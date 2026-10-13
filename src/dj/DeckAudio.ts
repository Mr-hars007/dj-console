import type { DeckState, TrackMetadata, HotCue } from './types';
import { KeyLockNode } from './KeyLockNode';

export interface DeckPlaylistItem {
  id: string;
  buffer: AudioBuffer;
  metadata: TrackMetadata;
  reverseBuffer: AudioBuffer | null;
  cuePosition?: number;
  hasCue?: boolean;
}

export class DeckAudio {
  public id: 'A' | 'B';
  public ctx: AudioContext;
  public destination: AudioNode;

  // Key Lock (Master Tempo) & Pitch Preservation
  public keyLockNode: KeyLockNode;
  public isKeyLockActive: boolean = false;
  public tempoLimit: number = 0.10; // Default ±10% limit
  public syncOutOfRange: boolean = false;

  // Audio Nodes
  public sourceNode: AudioBufferSourceNode | null = null;
  public eqLowNode: BiquadFilterNode;
  public eqMidNode: BiquadFilterNode;
  public eqHighNode: BiquadFilterNode;
  public filterNode: BiquadFilterNode;
  public gainNode: GainNode;
  public volumeNode: GainNode;
  public preFaderTapNode: GainNode;
  public analyserNode: AnalyserNode;

  // Multi-track Playlist / Crate
  public playlist: DeckPlaylistItem[] = [];
  public currentTrackIndex: number = -1;

  // Track & Playback state
  public buffer: AudioBuffer | null = null;
  public track: TrackMetadata | null = null;
  public isPlaying: boolean = false;
  public playbackPosition: number = 0; // seconds
  public lastPlayStartTime: number = 0;
  public tempoMultiplier: number = 1.0; // 1.0 = 0% pitch bend
  public pitchBendDelta: number = 0; // Current pitch bend delta (-0.06 to +0.06)
  public cuePosition: number = 0;
  public hasCue: boolean = false;
  public isCueAuditioning: boolean = false;

  // Loops & Hot Cues
  public loopActive: boolean = false;
  public loopStart: number = 0;
  public loopEnd: number = 0;
  public loopLengthBeats: number = 4;
  public hotCues: HotCue[] = [
    { id: 1, time: 0, active: false, color: '#38bdf8' },
    { id: 2, time: 0, active: false, color: '#f59e0b' },
    { id: 3, time: 0, active: false, color: '#10b981' },
    { id: 4, time: 0, active: false, color: '#ec4899' },
  ];

  // Knobs & Fader values
  public eqLow: number = 0;   // dB (-24 to +6)
  public eqMid: number = 0;   // dB
  public eqHigh: number = 0;  // dB
  public filter: number = 0;  // -1 to +1
  public gain: number = 1.0;   // 0 to 1.5
  public volume: number = 1.0; // 0 to 1

  // Vinyl scratching real audio wave engine
  public isScratching: boolean = false;
  public isSyncActive: boolean = false;
  public reverseBuffer: AudioBuffer | null = null;
  public mixer?: any;
  private scratchSourceNode: AudioBufferSourceNode | null = null;
  private scratchGainNode: GainNode;
  private scratchDirection: 'forward' | 'reverse' | 'idle' = 'idle';
  private scratchStopTimeout: ReturnType<typeof setTimeout> | null = null;
  public onPlay?: () => void;
  public onTempoChange?: () => void;
  public onChange?: () => void;
  public onTrackLoaded?: () => void;
  public onScratchDelta?: (deltaDegrees: number, dtSeconds: number, currentRPM: number) => void;

  // Physical vinyl inertia engine
  public lastScratchVelocity: number = 0; // angular degrees per second
  private inertiaAnimId: number | null = null;
  private frictionDecay: number = 0.958; // realistic slipmat friction factor
  public isInertiaCoasting: boolean = false;

  constructor(id: 'A' | 'B', ctx: AudioContext, destination: AudioNode, mixer?: any) {
    this.id = id;
    this.ctx = ctx;
    this.destination = destination;
    this.mixer = mixer;

    // 1. 3-Band Equalizer
    this.eqLowNode = ctx.createBiquadFilter();
    this.eqLowNode.type = 'lowshelf';
    this.eqLowNode.frequency.setValueAtTime(320, ctx.currentTime);
    this.eqLowNode.gain.setValueAtTime(0, ctx.currentTime);

    this.eqMidNode = ctx.createBiquadFilter();
    this.eqMidNode.type = 'peaking';
    this.eqMidNode.frequency.setValueAtTime(1200, ctx.currentTime);
    this.eqMidNode.Q.setValueAtTime(1.0, ctx.currentTime);
    this.eqMidNode.gain.setValueAtTime(0, ctx.currentTime);

    this.eqHighNode = ctx.createBiquadFilter();
    this.eqHighNode.type = 'highshelf';
    this.eqHighNode.frequency.setValueAtTime(3500, ctx.currentTime);
    this.eqHighNode.gain.setValueAtTime(0, ctx.currentTime);

    // 2. Bipolar Color Filter (Center = 0 / Off)
    this.filterNode = ctx.createBiquadFilter();
    this.filterNode.type = 'allpass';
    this.filterNode.frequency.setValueAtTime(1000, ctx.currentTime);

    // 3. Gain and Volume faders
    this.gainNode = ctx.createGain();
    this.gainNode.gain.setValueAtTime(1.0, ctx.currentTime);

    this.volumeNode = ctx.createGain();
    this.volumeNode.gain.setValueAtTime(1.0, ctx.currentTime);

    // Pre-Fade Listen (PFL) cue tap node (tapped before volume fader)
    this.preFaderTapNode = ctx.createGain();
    this.preFaderTapNode.gain.setValueAtTime(1.0, ctx.currentTime);

    // 4. Dedicated Real-Wave Scratch Bus (routed directly through EQ and filters)
    this.scratchGainNode = ctx.createGain();
    this.scratchGainNode.gain.setValueAtTime(0, ctx.currentTime);
    this.scratchGainNode.connect(this.eqLowNode);

    // 5. Deck Analyser
    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyserNode.smoothingTimeConstant = 0.5;

    // Wire DSP Chain: Source -> KeyLock (Master Tempo) -> EQ Low -> EQ Mid -> EQ High -> Filter -> Gain -> Volume -> Analyser -> Output
    this.keyLockNode = new KeyLockNode(ctx);
    this.keyLockNode.setEnabled(this.isKeyLockActive);
    this.keyLockNode.setTempoMultiplier(this.tempoMultiplier);
    this.keyLockNode.output.connect(this.eqLowNode);

    this.eqLowNode.connect(this.eqMidNode);
    this.eqMidNode.connect(this.eqHighNode);
    this.eqHighNode.connect(this.filterNode);
    this.filterNode.connect(this.gainNode);
    this.gainNode.connect(this.volumeNode);
    this.gainNode.connect(this.preFaderTapNode);
    this.volumeNode.connect(this.analyserNode);
    this.analyserNode.connect(this.destination);
  }

  public addTrack(buffer: AudioBuffer, metadata: TrackMetadata, activate: boolean = false) {
    let reverseBuffer: AudioBuffer | null = null;
    try {
      const rev = this.ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const src = buffer.getChannelData(ch);
        const dst = rev.getChannelData(ch);
        const len = src.length;
        for (let i = 0; i < len; i++) {
          dst[i] = src[len - 1 - i];
        }
      }
      reverseBuffer = rev;
    } catch (_) {
      reverseBuffer = null;
    }

    const item: DeckPlaylistItem = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      buffer,
      metadata,
      reverseBuffer,
      cuePosition: 0,
      hasCue: false,
    };

    this.playlist.push(item);

    if (activate || this.currentTrackIndex === -1) {
      this.loadTrackIndex(this.playlist.length - 1);
    } else {
      this.onChange?.();
    }
  }

  public loadTrackIndex(index: number) {
    if (index < 0 || index >= this.playlist.length) return;

    // Save active track's cue state before switching
    if (this.currentTrackIndex >= 0 && this.currentTrackIndex < this.playlist.length) {
      this.playlist[this.currentTrackIndex].cuePosition = this.cuePosition;
      this.playlist[this.currentTrackIndex].hasCue = this.hasCue;
    }

    this.pause();
    this.stopScratchAudio();

    const item = this.playlist[index];
    this.currentTrackIndex = index;
    this.buffer = item.buffer;
    this.track = item.metadata;
    this.reverseBuffer = item.reverseBuffer;
    this.playbackPosition = 0;
    this.cuePosition = item.cuePosition ?? 0;
    this.hasCue = item.hasCue ?? false;
    this.isCueAuditioning = false;
    this.loopActive = false;
    this.hotCues.forEach((c) => (c.active = false));
    this.syncOutOfRange = false;
    this.keyLockNode.setTempoMultiplier(this.tempoMultiplier);
    this.keyLockNode.setEnabled(this.isKeyLockActive);

    this.onChange?.();
    this.onTempoChange?.();
    this.onTrackLoaded?.();
  }

  public nextTrack() {
    if (this.playlist.length <= 1) return;
    const nextIdx = (this.currentTrackIndex + 1) % this.playlist.length;
    this.loadTrackIndex(nextIdx);
  }

  public prevTrack() {
    if (this.playlist.length <= 1) return;
    const prevIdx = (this.currentTrackIndex - 1 + this.playlist.length) % this.playlist.length;
    this.loadTrackIndex(prevIdx);
  }

  public removeTrack(index: number) {
    if (index < 0 || index >= this.playlist.length) return;
    const isRemovingCurrent = index === this.currentTrackIndex;
    this.playlist.splice(index, 1);

    if (this.playlist.length === 0) {
      this.pause();
      this.stopScratchAudio();
      this.currentTrackIndex = -1;
      this.buffer = null;
      this.track = null;
      this.reverseBuffer = null;
      this.playbackPosition = 0;
      this.cuePosition = 0;
      this.hasCue = false;
    } else if (isRemovingCurrent) {
      const nextIdx = Math.min(index, this.playlist.length - 1);
      this.loadTrackIndex(nextIdx);
    } else if (index < this.currentTrackIndex) {
      this.currentTrackIndex--;
    }
    this.onChange?.();
  }

  public loadTrack(buffer: AudioBuffer, metadata: TrackMetadata) {
    this.addTrack(buffer, metadata, true);
  }

  public play() {
    if (!this.buffer || this.isPlaying) return;
    if (this.mixer && !this.mixer.isPoweredOn) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // If sync is active, notify listener to align phase
    this.onPlay?.();

    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.buffer;
    const effectiveRate = this.pitchBendDelta !== 0 ? this.tempoMultiplier * (1 + this.pitchBendDelta) : this.tempoMultiplier;
    this.sourceNode.playbackRate.setValueAtTime(effectiveRate, this.ctx.currentTime);
    this.sourceNode.connect(this.keyLockNode.input);
    this.keyLockNode.setTempoMultiplier(effectiveRate);

    // Loop config if active
    if (this.loopActive) {
      this.sourceNode.loop = true;
      this.sourceNode.loopStart = this.loopStart;
      this.sourceNode.loopEnd = this.loopEnd;
    } else {
      this.sourceNode.loop = false;
    }

    const startPos = Math.max(0, Math.min(this.buffer.duration, this.playbackPosition));
    this.lastPlayStartTime = this.ctx.currentTime;
    this.sourceNode.start(this.ctx.currentTime, startPos);
    this.isPlaying = true;

    this.sourceNode.onended = () => {
      if (this.isPlaying && !this.loopActive) {
        this.isPlaying = false;
        this.playbackPosition = this.buffer ? this.buffer.duration : 0;
        this.sourceNode = null;
      }
    };
  }

  /**
   * Resyncs the active audio source node to this.playbackPosition cleanly without pausing.
   */
  public resyncNodeToPosition(targetRate?: number) {
    if (!this.buffer || !this.isPlaying) return;
    const clamped = Math.max(0, Math.min(this.buffer.duration, this.playbackPosition));

    if (this.sourceNode) {
      this.sourceNode.onended = null;
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (e) {}
      this.sourceNode = null;
    }

    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.buffer;
    const defaultRate = this.pitchBendDelta !== 0 ? this.tempoMultiplier * (1 + this.pitchBendDelta) : this.tempoMultiplier;
    const rate = targetRate !== undefined ? targetRate : defaultRate;
    this.sourceNode.playbackRate.setValueAtTime(rate, this.ctx.currentTime);
    this.sourceNode.connect(this.keyLockNode.input);
    this.keyLockNode.setTempoMultiplier(rate);

    if (this.loopActive) {
      this.sourceNode.loop = true;
      this.sourceNode.loopStart = this.loopStart;
      this.sourceNode.loopEnd = this.loopEnd;
    } else {
      this.sourceNode.loop = false;
    }

    this.lastPlayStartTime = this.ctx.currentTime;
    this.sourceNode.start(this.ctx.currentTime, clamped);

    this.sourceNode.onended = () => {
      if (this.isPlaying && !this.loopActive) {
        this.isPlaying = false;
        this.playbackPosition = this.buffer ? this.buffer.duration : 0;
        this.sourceNode = null;
      }
    };
  }

  /**
  /**
   * Holds the platter stationary (hand on vinyl record / slipmat hold).
   * Halts main audio playback and freezes playhead position while hand is holding the disk.
   */
  public holdPlatter() {
    this.stopInertia();
    this.isScratching = true;
    this.updateCurrentPosition();

    if (this.isPlaying && this.sourceNode) {
      const now = this.ctx.currentTime;
      this.sourceNode.playbackRate.cancelScheduledValues(now);
      this.sourceNode.playbackRate.setValueAtTime(0.0001, now);
    }
  }

  /**
   * Authentic vinyl scratching engine using the real audio wave buffer (forward and reversed).
   * Modulates playback speed and direction in real-time according to physical hand movements.
   * Completely eliminates artificial oscillator beeps/chirps.
   */
  public scratchRotate(deltaDegrees: number, dtSeconds: number, fromInertia: boolean = false) {
    if (this.mixer && !this.mixer.isPoweredOn) return;

    if (!fromInertia) {
      this.stopInertia();
    }

    this.isScratching = true;

    // 1 revolution (360 deg) = ~1.8 seconds (33.3 RPM)
    const scrubTimeDelta = (deltaDegrees / 360) * 1.8;
    if (this.buffer) {
      this.playbackPosition = Math.max(0, Math.min(this.buffer.duration, this.playbackPosition + scrubTimeDelta));
    } else {
      this.playbackPosition = Math.max(0, this.playbackPosition + scrubTimeDelta);
    }

    const dt = Math.max(0.008, dtSeconds);
    const angularSpeed = deltaDegrees / dt; // deg / sec
    if (!fromInertia) {
      this.lastScratchVelocity = angularSpeed;
    }

    const currentRPM = Math.round((Math.abs(angularSpeed) / 360) * 60 * 10) / 10;
    this.onScratchDelta?.(deltaDegrees, dt, currentRPM);

    // If no audio buffer is loaded, platter rotation and inertia physics still run normally without audio
    if (!this.buffer) {
      return;
    }

    // 180 deg/s is normal 1.0x playback speed
    const speedFactor = Math.abs(angularSpeed) / 180;
    const clampedRate = Math.min(3.8, Math.max(0.10, speedFactor * this.tempoMultiplier));

    const now = this.ctx.currentTime;

    // While dragging the record, pause main sourceNode output
    if (this.isPlaying && this.sourceNode) {
      this.sourceNode.playbackRate.cancelScheduledValues(now);
      this.sourceNode.playbackRate.setValueAtTime(0.001, now);
    }

    // Determine motion direction (< 0.01 deg threshold for ultra-responsive scratch tracking)
    const newDir: 'forward' | 'reverse' | 'idle' =
      Math.abs(deltaDegrees) < 0.01 ? 'idle' : deltaDegrees > 0 ? 'forward' : 'reverse';

    if (newDir === 'idle') {
      return;
    }

    // When reversing direction or launching scratch, start matching buffer (normal or reversed)
    const needNewNode = !this.scratchSourceNode || this.scratchDirection !== newDir;

    if (needNewNode) {
      if (this.scratchSourceNode) {
        const oldNode = this.scratchSourceNode;
        this.scratchSourceNode = null;
        try {
          oldNode.stop(now + 0.005);
          setTimeout(() => {
            try {
              oldNode.disconnect();
            } catch (_) {}
          }, 25);
        } catch (_) {}
      }

      this.scratchDirection = newDir;
      const targetBuffer = newDir === 'reverse' && this.reverseBuffer ? this.reverseBuffer : this.buffer;
      const offset =
        newDir === 'reverse'
          ? Math.max(0, Math.min(targetBuffer.duration, targetBuffer.duration - this.playbackPosition))
          : Math.max(0, Math.min(targetBuffer.duration, this.playbackPosition));

      const sNode = this.ctx.createBufferSource();
      sNode.buffer = targetBuffer;
      sNode.playbackRate.setValueAtTime(clampedRate, now);
      sNode.connect(this.scratchGainNode);
      sNode.start(now, offset);
      this.scratchSourceNode = sNode;

      if (this.scratchGainNode) {
        this.scratchGainNode.gain.cancelScheduledValues(now);
        this.scratchGainNode.gain.setValueAtTime(0.3, now);
        this.scratchGainNode.gain.linearRampToValueAtTime(1.0, now + 0.006);
      }
    } else if (this.scratchSourceNode) {
      // Continuing in same direction: smoothly track velocity
      this.scratchSourceNode.playbackRate.cancelScheduledValues(now);
      this.scratchSourceNode.playbackRate.setValueAtTime(clampedRate, now);

      if (this.scratchGainNode) {
        this.scratchGainNode.gain.cancelScheduledValues(now);
        this.scratchGainNode.gain.setValueAtTime(1.0, now);
      }
    }

    // Auto-silence scratch audio if hand stops moving on the platter and not coasting
    if (!fromInertia) {
      if (this.scratchStopTimeout) clearTimeout(this.scratchStopTimeout);
      this.scratchStopTimeout = setTimeout(() => {
        if (!this.isInertiaCoasting && this.scratchGainNode && this.ctx) {
          this.scratchGainNode.gain.setValueAtTime(0.001, this.ctx.currentTime);
          this.lastScratchVelocity = 0;
        }
      }, 150);
    }
  }

  /**
   * High-accuracy physical spinback & throw inertia engine.
   * Simulates heavy aluminum platter / vinyl slipmat deceleration physics.
   */
  public startInertialCoasting(initialVelocity: number) {
    if (this.scratchStopTimeout) {
      clearTimeout(this.scratchStopTimeout);
      this.scratchStopTimeout = null;
    }
    this.stopInertia();
    this.isInertiaCoasting = true;
    this.isScratching = true;
    let currentVel = initialVelocity;
    let lastTime = performance.now();

    // Normal platter motor speed in deg/sec (33.3 RPM = 200 deg/sec * tempoMultiplier)
    const normalMotorSpeed = 200 * this.tempoMultiplier;

    const inertiaLoop = (now: number) => {
      const dt = Math.min(0.04, Math.max(0.008, (now - lastTime) / 1000));
      lastTime = now;

      // Realistic exponential slipmat friction deceleration
      currentVel *= Math.pow(this.frictionDecay, dt / 0.016);

      // TURNTABLE MOTOR CATCH-UP PHYSICS:
      // If turntable motor is running (isPlaying === true):
      if (this.isPlaying) {
        // Forward throw / coast:
        // As soon as the forward inertia decelerates to normal motor speed,
        // the motor catches the slipmat! It must NEVER slow down below the platter speed.
        if (initialVelocity > 0 && currentVel <= normalMotorSpeed) {
          this.stopInertia();
          this.isScratching = false;
          // Seamless crossfade handover to main playback
          this.resyncNodeToPosition(this.tempoMultiplier);
          this.stopScratchAudio();
          return;
        }

        // Reverse throw / backspin:
        // Once reversed spin reaches zero/stops, the motor immediately catches and resumes forward play!
        if (initialVelocity < 0 && (currentVel >= -20 || currentVel >= 0)) {
          this.stopInertia();
          this.isScratching = false;
          this.resyncNodeToPosition(this.tempoMultiplier);
          this.stopScratchAudio();
          return;
        }
      } else {
        // Paused deck: coast to complete rest
        if (Math.abs(currentVel) < 18) {
          this.stopInertia();
          this.isScratching = false;
          this.stopScratchAudio();
          return;
        }
      }

      const deltaDeg = currentVel * dt;
      this.scratchRotate(deltaDeg, dt, true);

      this.inertiaAnimId = requestAnimationFrame(inertiaLoop);
    };

    this.inertiaAnimId = requestAnimationFrame(inertiaLoop);
  }

  public stopInertia() {
    if (this.inertiaAnimId !== null) {
      cancelAnimationFrame(this.inertiaAnimId);
      this.inertiaAnimId = null;
    }
    this.isInertiaCoasting = false;
  }

  /**
   * Scrub audio by a time delta in seconds (e.g. from waveform dragging).
   */
  public scrubDelta(deltaSeconds: number, dtSeconds: number = 0.016) {
    if (!this.buffer) return;
    const deltaDegrees = (deltaSeconds / 1.8) * 360;
    this.scratchRotate(deltaDegrees, dtSeconds);
  }

  public releaseScratch(allowInertia: boolean = true) {
    if (this.scratchStopTimeout) {
      clearTimeout(this.scratchStopTimeout);
      this.scratchStopTimeout = null;
    }

    // If already actively coasting with inertia, let the inertia run its course!
    if (this.isInertiaCoasting) {
      return;
    }

    // If release was preceded by scrubbing motion (> 25 deg/sec), trigger physical inertia coasting!
    const throwSpeed = Math.abs(this.lastScratchVelocity);
    if (allowInertia && throwSpeed > 25) {
      this.startInertialCoasting(this.lastScratchVelocity);
      this.lastScratchVelocity = 0;
      return;
    }

    this.stopInertia();
    this.lastScratchVelocity = 0;
    this.isScratching = false;
    this.stopScratchAudio();

    if (!this.buffer) return;

    if (this.isPlaying) {
      // Smoothly resume real track playback from the scrubbed position
      this.resyncNodeToPosition(this.tempoMultiplier);
    }
  }

  private stopScratchAudio(crossfadeDuration: number = 0.03) {
    this.scratchDirection = 'idle';
    const oldNode = this.scratchSourceNode;
    this.scratchSourceNode = null;

    if (this.scratchGainNode && this.ctx) {
      const now = this.ctx.currentTime;
      this.scratchGainNode.gain.cancelScheduledValues(now);
      if (crossfadeDuration > 0) {
        this.scratchGainNode.gain.setValueAtTime(this.scratchGainNode.gain.value, now);
        this.scratchGainNode.gain.linearRampToValueAtTime(0, now + crossfadeDuration);
      } else {
        this.scratchGainNode.gain.setValueAtTime(0, now);
      }
    }

    if (oldNode) {
      setTimeout(() => {
        try {
          oldNode.stop();
          oldNode.disconnect();
        } catch (_) {}
      }, Math.round(crossfadeDuration * 1000) + 20);
    }
  }

  public pause() {
    this.stopScratchAudio();
    if (!this.isPlaying) return;
    this.updateCurrentPosition();
    if (this.sourceNode) {
      this.sourceNode.onended = null;
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (e) {
        // ignore already stopped
      }
      this.sourceNode = null;
    }
    this.isPlaying = false;
  }

  public togglePlay() {
    if (this.mixer && !this.mixer.isPoweredOn) return;
    if (this.isCueAuditioning) {
      // Hardware Pro Feature: Holding CUE and pressing PLAY locks playback continuously!
      this.isCueAuditioning = false;
      this.isPlaying = true;
      this.onChange?.();
      return;
    }
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public setCue() {
    if (this.mixer && !this.mixer.isPoweredOn) return;
    if (!this.buffer) return;
    this.cuePosition = this.isPlaying ? this.updateCurrentPosition() : this.playbackPosition;
    this.hasCue = true;
    this.onChange?.();
    this.onTempoChange?.();
  }

  public cueDown() {
    if (this.mixer && !this.mixer.isPoweredOn) return;
    if (!this.buffer) return;
    if (this.isCueAuditioning) return; // Prevent any glitch / re-entrancy while holding cue!

    // If currently playing normally: drop / place CUE on-the-fly and KEEP PLAYING!
    if (this.isPlaying) {
      this.cuePosition = this.updateCurrentPosition();
      this.hasCue = true;
      this.onChange?.();
      this.onTempoChange?.();
      return;
    }

    // When paused: audition / play from stored cue point while key or button is held
    if (!this.hasCue) {
      this.cuePosition = this.playbackPosition;
      this.hasCue = true;
    }

    this.seekTo(this.cuePosition);
    this.isCueAuditioning = true;
    this.play();
    this.onChange?.();
  }

  public cueUp() {
    if (this.isCueAuditioning) {
      // Releasing CUE springs back to cue point and pauses
      this.isCueAuditioning = false;
      this.pause();
      this.seekTo(this.cuePosition);
      this.onChange?.();
    }
  }

  /**
   * Dedicated Play CUE method (used by G on Deck A & H on Deck B):
   * Always jumps to stored CUE point and plays while held.
   * NEVER alters or overwrites the stored CUE position!
   */
  public playCueDown() {
    if (this.mixer && !this.mixer.isPoweredOn) return;
    if (!this.buffer) return;
    if (this.isCueAuditioning) return;

    if (this.isPlaying) {
      this.pause();
    }

    if (!this.hasCue) {
      this.cuePosition = 0;
      this.hasCue = true;
    }

    this.seekTo(this.cuePosition);
    this.isCueAuditioning = true;
    this.play();
    this.onChange?.();
  }

  public cue() {
    if (this.mixer && !this.mixer.isPoweredOn) return;
    this.setCue();
  }

  public seekTo(timeSeconds: number) {
    if (!this.buffer) return;
    const clamped = Math.max(0, Math.min(this.buffer.duration, timeSeconds));
    this.playbackPosition = clamped;
    if (this.isPlaying) {
      this.resyncNodeToPosition();
    }
  }

  public updateCurrentPosition(): number {
    if (this.isPlaying && this.buffer) {
      if (this.isScratching) {
        // Platter/waveform is held by user - do not advance position
        this.lastPlayStartTime = this.ctx.currentTime;
        return this.playbackPosition;
      }

      const currentRate = this.pitchBendDelta !== 0 ? this.tempoMultiplier * (1 + this.pitchBendDelta) : this.tempoMultiplier;
      const elapsed = (this.ctx.currentTime - this.lastPlayStartTime) * currentRate;
      this.playbackPosition = (this.playbackPosition + elapsed);

      if (this.loopActive && this.loopEnd > this.loopStart) {
        const loopLen = this.loopEnd - this.loopStart;
        if (this.playbackPosition >= this.loopEnd) {
          this.playbackPosition = this.loopStart + ((this.playbackPosition - this.loopStart) % loopLen);
        }
      }

      if (this.playbackPosition >= this.buffer.duration && !this.loopActive) {
        this.playbackPosition = this.buffer.duration;
        this.pause();
      }
      this.lastPlayStartTime = this.ctx.currentTime;
    }
    return this.playbackPosition;
  }

  public setTempoMultiplier(mult: number) {
    const minLimit = 1.0 - this.tempoLimit;
    const maxLimit = 1.0 + this.tempoLimit;
    const clamped = Math.max(minLimit, Math.min(maxLimit, mult));
    if (Math.abs(this.tempoMultiplier - clamped) < 0.0001) return;
    this.updateCurrentPosition();
    this.tempoMultiplier = clamped;
    this.keyLockNode.setTempoMultiplier(this.tempoMultiplier);
    if (this.sourceNode) {
      this.sourceNode.playbackRate.setTargetAtTime(this.tempoMultiplier, this.ctx.currentTime, 0.05);
    }
    this.onTempoChange?.();
  }

  public setKeyLock(active: boolean) {
    this.isKeyLockActive = active;
    this.keyLockNode.setEnabled(active);
    this.keyLockNode.setTempoMultiplier(this.tempoMultiplier);
    this.onChange?.();
  }

  public toggleKeyLock() {
    this.setKeyLock(!this.isKeyLockActive);
  }

  public nudge(deltaPercent: number) {
    if (this.sourceNode) {
      const temporaryRate = this.tempoMultiplier * (1 + deltaPercent);
      this.sourceNode.playbackRate.setValueAtTime(temporaryRate, this.ctx.currentTime);
      this.keyLockNode.setTempoMultiplier(temporaryRate);
      setTimeout(() => {
        if (this.sourceNode) {
          this.sourceNode.playbackRate.setValueAtTime(this.tempoMultiplier, this.ctx.currentTime);
          this.keyLockNode.setTempoMultiplier(this.tempoMultiplier);
        }
      }, 200);
    }
  }

  public pitchBend(delta: number) {
    this.pitchBendDelta = delta;
    if (this.sourceNode) {
      const targetRate = delta === 0 ? this.tempoMultiplier : this.tempoMultiplier * (1 + delta);
      this.sourceNode.playbackRate.setValueAtTime(targetRate, this.ctx.currentTime);
      this.keyLockNode.setTempoMultiplier(targetRate);
    }
    this.onChange?.();
  }

  // Hot Cues
  public setHotCue(id: number) {
    const cue = this.hotCues.find((c) => c.id === id);
    if (!cue) return;
    cue.time = this.updateCurrentPosition();
    cue.active = true;
    this.onChange?.();
  }

  public playHotCue(id: number) {
    const cue = this.hotCues.find((c) => c.id === id);
    if (!cue) return;
    if (!cue.active) {
      // If not yet set, set it first then play
      cue.time = this.updateCurrentPosition();
      cue.active = true;
    }
    this.seekTo(cue.time);
    if (!this.isPlaying) {
      this.play();
    }
    this.onChange?.();
  }

  public triggerHotCue(id: number) {
    const cue = this.hotCues.find((c) => c.id === id);
    if (!cue) return;

    if (!cue.active) {
      // Set hot cue
      cue.time = this.updateCurrentPosition();
      cue.active = true;
    } else {
      // Jump to hot cue
      this.seekTo(cue.time);
      if (!this.isPlaying) {
        this.play();
      }
    }
    this.onChange?.();
  }

  public clearHotCue(id: number) {
    const cue = this.hotCues.find((c) => c.id === id);
    if (cue) {
      cue.active = false;
      cue.time = 0;
      this.onChange?.();
    }
  }

  // Loops
  public toggleLoop(beats?: number) {
    this.updateCurrentPosition();
    const rawBpm = this.track?.bpm || 120;
    const secondsPerBeat = 60.0 / rawBpm;
    const firstBeatOffset = this.track?.firstBeatOffset ?? 0;

    if (beats !== undefined) {
      if (this.loopActive && this.loopLengthBeats === beats) {
        // Clicking the currently active beat length exits loop mode
        this.loopActive = false;
        if (this.sourceNode) {
          this.sourceNode.loop = false;
        }
      } else {
        // Seamlessly switch to new beat length (e.g. from 2 to 1) or engage loop
        this.loopLengthBeats = beats;
        const loopDuration = this.loopLengthBeats * secondsPerBeat;

        if (!this.loopActive) {
          // Quantize loop start to the nearest beat grid line
          const k = Math.round((this.playbackPosition - firstBeatOffset) / secondsPerBeat);
          this.loopStart = Math.max(0, firstBeatOffset + k * secondsPerBeat);
          this.loopEnd = this.loopStart + loopDuration;
          this.loopActive = true;

          // If playback is outside this newly formed loop, seek to loopStart
          if (this.playbackPosition < this.loopStart || this.playbackPosition >= this.loopEnd) {
            this.playbackPosition = this.loopStart;
          }
        } else {
          // Loop is ALREADY active: dynamically shift/resize loop length on the fly!
          this.loopEnd = this.loopStart + loopDuration;

          // If playback position has exceeded the newly shortened loopEnd, wrap back
          if (this.playbackPosition >= this.loopEnd) {
            this.playbackPosition = this.loopStart + ((this.playbackPosition - this.loopStart) % loopDuration);
          }
        }

        // Apply updated loop points to playing audio node
        if (this.isPlaying && this.sourceNode) {
          this.sourceNode.loop = true;
          this.sourceNode.loopStart = this.loopStart;
          this.sourceNode.loopEnd = this.loopEnd;
          if (this.playbackPosition >= this.loopEnd || this.playbackPosition < this.loopStart) {
            this.resyncNodeToPosition();
          }
        }
      }
    } else {
      // Main LOOP toggle button clicked
      if (this.loopActive) {
        this.loopActive = false;
        if (this.sourceNode) {
          this.sourceNode.loop = false;
        }
      } else {
        const loopDuration = this.loopLengthBeats * secondsPerBeat;
        const k = Math.round((this.playbackPosition - firstBeatOffset) / secondsPerBeat);
        this.loopStart = Math.max(0, firstBeatOffset + k * secondsPerBeat);
        this.loopEnd = this.loopStart + loopDuration;
        this.loopActive = true;
        if (this.playbackPosition < this.loopStart || this.playbackPosition >= this.loopEnd) {
          this.playbackPosition = this.loopStart;
        }
        if (this.isPlaying && this.sourceNode) {
          this.sourceNode.loop = true;
          this.sourceNode.loopStart = this.loopStart;
          this.sourceNode.loopEnd = this.loopEnd;
        }
      }
    }

    this.onChange?.();
  }

  // 3-Band Equalizer
  public setEQ(band: 'low' | 'mid' | 'high', dB: number) {
    const clamped = Math.max(-24, Math.min(6, dB));
    const t = this.ctx.currentTime;
    if (band === 'low') {
      this.eqLow = clamped;
      this.eqLowNode.gain.setTargetAtTime(clamped, t, 0.05);
    } else if (band === 'mid') {
      this.eqMid = clamped;
      this.eqMidNode.gain.setTargetAtTime(clamped, t, 0.05);
    } else if (band === 'high') {
      this.eqHigh = clamped;
      this.eqHighNode.gain.setTargetAtTime(clamped, t, 0.05);
    }
  }

  // Bipolar Color Filter (-1 to +1, 0 = off)
  public setFilter(val: number) {
    this.filter = Math.max(-1, Math.min(1, val));
    const t = this.ctx.currentTime;

    if (Math.abs(this.filter) < 0.02) {
      this.filterNode.type = 'allpass';
    } else if (this.filter < 0) {
      // Lowpass sweep from 20000 Hz down to 180 Hz
      this.filterNode.type = 'lowpass';
      const freq = 20000 * Math.pow(0.009, -this.filter);
      this.filterNode.frequency.setTargetAtTime(Math.max(150, freq), t, 0.05);
    } else {
      // Highpass sweep from 20 Hz up to 5500 Hz
      this.filterNode.type = 'highpass';
      const freq = 20 + 5500 * Math.pow(this.filter, 2.5);
      this.filterNode.frequency.setTargetAtTime(freq, t, 0.05);
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.volumeNode.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  }

  public setGain(val: number) {
    this.gain = Math.max(0, Math.min(1.5, val));
    this.gainNode.gain.setTargetAtTime(this.gain, this.ctx.currentTime, 0.05);
  }

  private vuDataArray: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(32));

  public getVULevel(): number {
    this.analyserNode.getByteFrequencyData(this.vuDataArray);
    let sum = 0;
    for (let i = 0; i < 32; i++) sum += this.vuDataArray[i];
    return Math.min(1.0, (sum / (32 * 255)) * 1.5 * this.volume);
  }

  public getState(): DeckState {
    this.updateCurrentPosition();
    return {
      isPlaying: this.isPlaying,
      isCueing: false,
      currentTime: this.playbackPosition,
      duration: this.buffer?.duration || 0,
      bpm: (this.track?.bpm || 120) * this.tempoMultiplier,
      tempoMultiplier: this.tempoMultiplier,
      loopActive: this.loopActive,
      loopStart: this.loopStart,
      loopEnd: this.loopEnd,
      loopLengthBeats: this.loopLengthBeats,
      hotCues: [...this.hotCues],
      gain: this.gain,
      eqHigh: this.eqHigh,
      eqMid: this.eqMid,
      eqLow: this.eqLow,
      filter: this.filter,
      volume: this.volume,
      track: this.track,
      vuLevel: this.getVULevel(),
    };
  }
}
