import { DeckAudio } from './DeckAudio';
import { extractAudioMetadata } from './metadataParser';
import { detectBPMAndBeatGrid } from './BPMDetector';


export class DJMixer {
  private static instance: DJMixer | null = null;

  public ctx: AudioContext | null = null;
  public isInitialized: boolean = false;
  public isPoweredOn: boolean = (() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('dj_power_state');
      if (stored !== null) return stored === 'true';
    }
    return false;
  })();

  public deckA: DeckAudio | null = null;
  public deckB: DeckAudio | null = null;

  // Crossfader Routing
  private crossfaderGainA: GainNode | null = null;
  private crossfaderGainB: GainNode | null = null;
  public crossfaderPos: number = 0; // -1 (Deck A) to +1 (Deck B)

  // Master Section
  public masterGain: GainNode | null = null;
  public masterAnalyser: AnalyserNode | null = null;
  public masterVolume: number = 1.0;
  public masterDeckId: 'A' | 'B' = 'A';

  // Headphone Preview & Audio Routing
  public routingMode: 'separate-devices' | 'split-stereo' | 'multichannel' | 'stereo' = 'stereo';
  public headphoneVolume: number = 0.8;
  public headphoneMix: number = 0.5; // 0 = 100% Cue, 1 = 100% Master
  public cueA: boolean = false;
  public cueB: boolean = false;
  public cueMaster: boolean = false;

  // Headphone / Cue Audio Nodes
  public cueGainA: GainNode | null = null;
  public cueGainB: GainNode | null = null;
  public cueGainMaster: GainNode | null = null;
  public cueBusGain: GainNode | null = null;
  public headphoneMixGainCue: GainNode | null = null;
  public headphoneMixGainMaster: GainNode | null = null;
  public headphoneGain: GainNode | null = null;
  public headphoneAnalyser: AnalyserNode | null = null;

  // Multi-routing mergers and secondary device sink
  private mergerMulti: ChannelMergerNode | null = null;
  private headphoneStreamDest: MediaStreamAudioDestinationNode | null = null;
  private headphoneAudioElement: HTMLAudioElement | null = null;

  // Audio Device management
  public masterDeviceId: string = 'default';
  public headphoneDeviceId: string = 'default';
  public audioDevices: MediaDeviceInfo[] = [];

  // Recording
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  public isRecording: boolean = false;
  private recordDest: MediaStreamAudioDestinationNode | null = null;

  // Master Sync
  public isSyncActive: boolean = false;
  private isSyncing: boolean = false;
  public syncOutOfRange: boolean = false;
  public syncOutOfRangeInfo: {
    masterBPM: number;
    followerBaseBPM: number;
    clampedBPM: number;
    minBPM: number;
    maxBPM: number;
  } | null = null;

  private listeners: Set<() => void> = new Set();

  private constructor() {
    this.setupDeviceListeners();
    this.enumerateAudioDevices();
  }

  private setupDeviceListeners() {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      try {
        navigator.mediaDevices.addEventListener('devicechange', async () => {
          await this.enumerateAudioDevices();
          this.notify();
        });
      } catch (_) {}
    }
  }

  public static getInstance(): DJMixer {
    if (!DJMixer.instance) {
      DJMixer.instance = new DJMixer();
    }
    return DJMixer.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass({ latencyHint: 'interactive' });

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    // Master bus
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);

    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 512;
    this.masterAnalyser.smoothingTimeConstant = 0.6;
    this.masterGain.connect(this.masterAnalyser);

    // Headphone Cue Bus (Pre-Fade Listen)
    this.cueGainA = this.ctx.createGain();
    this.cueGainB = this.ctx.createGain();
    this.cueGainMaster = this.ctx.createGain();
    this.cueBusGain = this.ctx.createGain();

    this.cueGainA.connect(this.cueBusGain);
    this.cueGainB.connect(this.cueBusGain);

    this.headphoneMixGainCue = this.ctx.createGain();
    this.headphoneMixGainMaster = this.ctx.createGain();
    this.headphoneGain = this.ctx.createGain();

    this.cueBusGain.connect(this.headphoneMixGainCue);
    this.cueGainMaster.connect(this.headphoneMixGainMaster);
    this.masterGain.connect(this.cueGainMaster);

    this.headphoneMixGainCue.connect(this.headphoneGain);
    this.headphoneMixGainMaster.connect(this.headphoneGain);

    this.headphoneAnalyser = this.ctx.createAnalyser();
    this.headphoneAnalyser.fftSize = 256;
    this.headphoneAnalyser.smoothingTimeConstant = 0.5;
    this.headphoneGain.connect(this.headphoneAnalyser);

    // Crossfader gains
    this.crossfaderGainA = this.ctx.createGain();
    this.crossfaderGainB = this.ctx.createGain();

    this.crossfaderGainA.connect(this.masterGain);
    this.crossfaderGainB.connect(this.masterGain);

    // Initialize Decks
    this.deckA = new DeckAudio('A', this.ctx, this.crossfaderGainA, this);
    this.deckB = new DeckAudio('B', this.ctx, this.crossfaderGainB, this);

    // Wire Pre-Fade Taps for Headphone Cue (PFL)
    this.deckA.preFaderTapNode.connect(this.cueGainA);
    this.deckB.preFaderTapNode.connect(this.cueGainB);

    this.deckA.onPlay = () => {
      if (this.isSyncActive) this.syncDecks();
      else this.notify();
    };
    this.deckA.onTempoChange = () => {
      if (this.isSyncActive) this.syncDecks();
      else this.notify();
    };
    this.deckA.onChange = () => this.notify();

    this.deckB.onPlay = () => {
      if (this.isSyncActive) this.syncDecks();
      else this.notify();
    };
    this.deckB.onTempoChange = () => {
      if (this.isSyncActive) this.syncDecks();
      else this.notify();
    };
    this.deckB.onChange = () => this.notify();

    this.setCrossfader(0);
    this.updateCueLevels();
    this.updateRoutingConnections();

    // Apply configured master device sink if AudioContext supports setSinkId
    if (this.masterDeviceId && this.masterDeviceId !== 'default' && 'setSinkId' in this.ctx) {
      try {
        await (this.ctx as any).setSinkId(this.masterDeviceId);
      } catch (e) {
        console.warn('setSinkId master device restoration error:', e);
      }
    }

    // Query audio output devices if available
    this.enumerateAudioDevices();

    // Recording node
    try {
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(this.recordDest);
    } catch (e) {
      console.warn('Recording not supported on this browser:', e);
    }

    // Initialize power state from sessionStorage (defaults to false / OFF on first launch)
    let initialPower = false;
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('dj_power_state');
      if (stored !== null) {
        initialPower = stored === 'true';
      } else {
        sessionStorage.setItem('dj_power_state', 'false');
      }
    }

    this.isInitialized = true;
    this.isPoweredOn = initialPower;

    if (!initialPower && this.ctx && this.ctx.state === 'running') {
      try {
        await this.ctx.suspend();
      } catch (_) {}
    }

    this.notify();
  }

  public async togglePower(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
      this.isPoweredOn = true;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('dj_power_state', 'true');
      }
      this.notify();
      return true;
    }

    if (this.isPoweredOn) {
      this.isPoweredOn = false;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('dj_power_state', 'false');
      }
      if (this.isRecording) {
        this.stopRecording();
      }
      if (this.deckA?.isPlaying) this.deckA.pause();
      if (this.deckB?.isPlaying) this.deckB.pause();
      if (this.ctx && this.ctx.state === 'running') {
        try {
          await this.ctx.suspend();
        } catch (_) {}
      }
      this.notify();
      return false;
    } else {
      this.isPoweredOn = true;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('dj_power_state', 'true');
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch (_) {}
      }
      this.notify();
      return true;
    }
  }

  public setCrossfader(pos: number) {
    let cleanPos = Math.max(-1, Math.min(1, Math.round(pos * 1000) / 1000));
    if (Math.abs(cleanPos) < 0.008) {
      cleanPos = 0;
    }
    this.crossfaderPos = cleanPos;
    if (!this.crossfaderGainA || !this.crossfaderGainB || !this.ctx) return;

    const t = this.ctx.currentTime;
    // DJ Smooth Dip Crossfader curve
    let gainA = 1.0;
    let gainB = 1.0;

    if (this.crossfaderPos < 0) {
      gainA = 1.0;
      gainB = Math.cos(((this.crossfaderPos + 1) * Math.PI) / 2 - Math.PI / 2);
    } else {
      gainA = Math.cos((this.crossfaderPos * Math.PI) / 2);
      gainB = 1.0;
    }

    this.crossfaderGainA.gain.setTargetAtTime(gainA, t, 0.03);
    this.crossfaderGainB.gain.setTargetAtTime(gainB, t, 0.03);
    this.notify();
  }

  public setMasterVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1.2, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.04);
    }
    this.notify();
  }

  // Headphone Preview & Cue Control
  public setCue(channel: 'A' | 'B' | 'MASTER', active: boolean) {
    if (channel === 'A') this.cueA = active;
    else if (channel === 'B') this.cueB = active;
    else if (channel === 'MASTER') this.cueMaster = active;
    this.updateCueLevels();
    this.notify();
  }

  public setHeadphoneVolume(vol: number) {
    this.headphoneVolume = Math.max(0, Math.min(1.2, vol));
    this.updateCueLevels();
    this.notify();
  }

  public setHeadphoneMix(mix: number) {
    this.headphoneMix = Math.max(0, Math.min(1.0, mix));
    this.updateCueLevels();
    this.notify();
  }

  public setRoutingMode(mode: 'separate-devices' | 'split-stereo' | 'multichannel' | 'stereo') {
    this.routingMode = mode;
    this.updateRoutingConnections();
    this.notify();
  }

  public updateCueLevels() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.cueGainA) {
      this.cueGainA.gain.setTargetAtTime(this.cueA ? 1.0 : 0.0, t, 0.02);
    }
    if (this.cueGainB) {
      this.cueGainB.gain.setTargetAtTime(this.cueB ? 1.0 : 0.0, t, 0.02);
    }
    if (this.cueGainMaster) {
      this.cueGainMaster.gain.setTargetAtTime(this.cueMaster ? 1.0 : 0.0, t, 0.02);
    }
    if (this.headphoneMixGainCue) {
      this.headphoneMixGainCue.gain.setTargetAtTime(1.0 - this.headphoneMix, t, 0.02);
    }
    if (this.headphoneMixGainMaster) {
      this.headphoneMixGainMaster.gain.setTargetAtTime(this.headphoneMix, t, 0.02);
    }
    if (this.headphoneGain) {
      this.headphoneGain.gain.setTargetAtTime(this.headphoneVolume, t, 0.02);
    }
  }

  public updateRoutingConnections() {
    if (!this.ctx || !this.masterAnalyser || !this.headphoneGain) return;

    try {
      this.masterAnalyser.disconnect();
      this.headphoneGain.disconnect();
      if (this.mergerMulti) this.mergerMulti.disconnect();
    } catch (_) {}

    if (this.routingMode === 'separate-devices') {
      // Approach A: Master to main output (speakers), Cue to separate headphone device
      this.masterAnalyser.connect(this.ctx.destination);
      // Stream headphone cue to separate audio output sink
      if (this.headphoneDeviceId && this.headphoneDeviceId !== 'default') {
        this.setHeadphoneDevice(this.headphoneDeviceId);
      } else {
        // In default mode, headphone bus can audition when cue is enabled
        this.headphoneGain.connect(this.ctx.destination);
      }
    } else if (this.routingMode === 'split-stereo') {
      // Approach A (Split-Stereo): 1 Jack with DJ Splitter cable (Left = Speakers, Right = Wired Earphones)
      if (!this.mergerMulti) {
        this.mergerMulti = this.ctx.createChannelMerger(2);
      }
      this.masterAnalyser.connect(this.mergerMulti, 0, 0); // Left channel: Master to Speakers
      this.headphoneGain.connect(this.mergerMulti, 0, 1);  // Right channel: Cue to Wired Earphones
      this.mergerMulti.connect(this.ctx.destination);
    } else if (this.routingMode === 'multichannel' && this.ctx.destination.maxChannelCount >= 4) {
      // Approach B: Pro 4-Channel DJ audio interface (Ch 1-2 Master, Ch 3-4 Headphones)
      try {
        this.ctx.destination.channelCount = 4;
        this.ctx.destination.channelCountMode = 'explicit';
      } catch (_) {}
      if (!this.mergerMulti) {
        this.mergerMulti = this.ctx.createChannelMerger(4);
      }
      this.masterAnalyser.connect(this.mergerMulti, 0, 0);
      this.masterAnalyser.connect(this.mergerMulti, 0, 1);
      this.headphoneGain.connect(this.mergerMulti, 0, 2);
      this.headphoneGain.connect(this.mergerMulti, 0, 3);
      this.mergerMulti.connect(this.ctx.destination);
    } else {
      // Approach C: One ordinary stereo output
      this.masterAnalyser.connect(this.ctx.destination);
      this.headphoneGain.connect(this.ctx.destination);
    }
  }

  public getHeadphoneVU(): number {
    if (!this.headphoneAnalyser) return 0;
    const data = new Uint8Array(64);
    this.headphoneAnalyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < 32; i++) sum += data[i];
    return Math.min(1.0, (sum / (32 * 255)) * 1.6);
  }

  public async enumerateAudioDevices(): Promise<MediaDeviceInfo[]> {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        let outputs = devices.filter((d) => d.kind === 'audiooutput');

        // Deduplicate devices by deviceId and label
        const seen = new Set<string>();
        outputs = outputs.filter((d) => {
          const key = `${d.deviceId}:${d.label}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        this.audioDevices = outputs;
        this.notify();
        return outputs;
      } catch (e) {
        console.warn('Audio device query error:', e);
      }
    }
    return [];
  }

  public async requestAudioDeviceAccess(): Promise<MediaDeviceInfo[]> {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      // Modern selectAudioOutput API if available (Chrome 110+)
      if ('selectAudioOutput' in navigator.mediaDevices) {
        try {
          const selected = await (navigator.mediaDevices as any).selectAudioOutput();
          if (selected && selected.deviceId) {
            this.headphoneDeviceId = selected.deviceId;
          }
        } catch (_) {}
      }
      return await this.enumerateAudioDevices();
    }
    return [];
  }

  public async setOutputDevice(deviceId: string) {
    this.masterDeviceId = deviceId;
    if (this.ctx && 'setSinkId' in this.ctx) {
      try {
        await (this.ctx as any).setSinkId(deviceId);
      } catch (e) {
        console.warn('setSinkId error:', e);
      }
    }
    this.notify();
  }

  public async setHeadphoneDevice(deviceId: string) {
    this.headphoneDeviceId = deviceId;
    if (!this.ctx || !this.headphoneGain) return;

    if (deviceId && deviceId !== 'default') {
      try {
        if (!this.headphoneStreamDest) {
          this.headphoneStreamDest = this.ctx.createMediaStreamDestination();
          this.headphoneGain.connect(this.headphoneStreamDest);
        }
        if (!this.headphoneAudioElement) {
          this.headphoneAudioElement = new Audio();
        }
        this.headphoneAudioElement.srcObject = this.headphoneStreamDest.stream;
        if ('setSinkId' in this.headphoneAudioElement) {
          await (this.headphoneAudioElement as any).setSinkId(deviceId);
        }
        this.headphoneAudioElement.play().catch(() => {});
      } catch (err) {
        console.warn('Error setting headphone device:', err);
      }
    } else {
      if (this.headphoneAudioElement) {
        this.headphoneAudioElement.pause();
        this.headphoneAudioElement.srcObject = null;
      }
      this.updateRoutingConnections();
    }
    this.notify();
  }

  // Master Beat Sync (Matches tempo & beat phase with ±10% limit and harmonic half/double detection)
  public syncDecks() {
    if (!this.deckA || !this.deckB) return;
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      // Determine Master vs Follower based on live playback state
      let master = this.deckA;
      let follower = this.deckB;

      if (this.deckB.isPlaying && !this.deckA.isPlaying) {
        master = this.deckB;
        follower = this.deckA;
        this.masterDeckId = 'B';
      } else if (this.deckA.isPlaying && !this.deckB.isPlaying) {
        master = this.deckA;
        follower = this.deckB;
        this.masterDeckId = 'A';
      } else {
        master = this.masterDeckId === 'A' ? this.deckA : this.deckB;
        follower = this.masterDeckId === 'A' ? this.deckB : this.deckA;
      }

      // If neither has track, nothing to align yet
      if (!master.track && !follower.track) {
        this.syncOutOfRange = false;
        this.syncOutOfRangeInfo = null;
        this.notify();
        return;
      }

      // Always poll fresh microsecond positions
      const masterPos = master.updateCurrentPosition();
      const followerPos = follower.updateCurrentPosition();

      // Read original track reference constants without mutating original metadata
      const masterBaseBPM = master.track?.bpm || 120;
      const followerBaseBPM = follower.track?.bpm || 120;
      const masterCurrentBPM = masterBaseBPM * master.tempoMultiplier;

      // Default allowed tempo adjustment limit: ±10% ([0.90, 1.10])
      const tempoLimit = follower.tempoLimit ?? 0.10;
      const minMultiplier = 1.0 - tempoLimit;
      const maxMultiplier = 1.0 + tempoLimit;

      // Harmonic tempo candidates (prevents unnaturally fast or sluggish chipmunk/sludge playback)
      // 1. 1:1 direct tempo match
      // 2. 0.5x half-time match (e.g. Master 140 BPM, Follower 70 BPM)
      // 3. 2.0x double-time match (e.g. Master 70 BPM, Follower 140 BPM)
      const candidates = [
        { multiplier: masterCurrentBPM / followerBaseBPM, ratio: 1.0 },
        { multiplier: (masterCurrentBPM * 0.5) / followerBaseBPM, ratio: 0.5 },
        { multiplier: (masterCurrentBPM * 2.0) / followerBaseBPM, ratio: 2.0 },
      ];

      // Filter candidates that fit comfortably within the allowed ±10% range
      const validCandidates = candidates.filter(
        (c) => c.multiplier >= minMultiplier - 1e-4 && c.multiplier <= maxMultiplier + 1e-4
      );

      let selectedMultiplier: number;
      let selectedRatio: number = 1.0;
      let isOutOfRange = false;

      if (validCandidates.length > 0) {
        // Pick the harmonic candidate closest to 1.0 (natural original playback speed)
        validCandidates.sort((a, b) => Math.abs(a.multiplier - 1.0) - Math.abs(b.multiplier - 1.0));
        selectedMultiplier = validCandidates[0].multiplier;
        selectedRatio = validCandidates[0].ratio;
        isOutOfRange = false;
      } else {
        // Target BPM is OUTSIDE the allowed ±10% range!
        // Prevent SYNC from exceeding that range silently: clamp strictly to limit and flag out-of-range
        isOutOfRange = true;
        candidates.sort((a, b) => {
          const distA = Math.max(0, minMultiplier - a.multiplier, a.multiplier - maxMultiplier);
          const distB = Math.max(0, minMultiplier - b.multiplier, b.multiplier - maxMultiplier);
          return distA - distB;
        });
        const closest = candidates[0];
        selectedMultiplier = Math.max(minMultiplier, Math.min(maxMultiplier, closest.multiplier));
        selectedRatio = closest.ratio;
      }

      this.syncOutOfRange = isOutOfRange;
      follower.syncOutOfRange = isOutOfRange;
      master.syncOutOfRange = false;
      this.syncOutOfRangeInfo = isOutOfRange
        ? {
            masterBPM: masterCurrentBPM,
            followerBaseBPM: followerBaseBPM,
            clampedBPM: followerBaseBPM * selectedMultiplier,
            minBPM: followerBaseBPM * minMultiplier,
            maxBPM: followerBaseBPM * maxMultiplier,
          }
        : null;

      // Apply tempo multiplier within ±10% limit
      follower.setTempoMultiplier(selectedMultiplier);

      // Exact Beat Phase Alignment using each track's individual beat grid and offset
      if (follower.buffer) {
        const masterBeatDurationInBuffer = 60.0 / masterBaseBPM;
        const followerBeatDurationInBuffer = 60.0 / followerBaseBPM;

        const masterOffset = master.track?.firstBeatOffset ?? 0;
        const followerOffset = follower.track?.firstBeatOffset ?? 0;

        // Exact fractional phase of the master track (0.0 to 1.0 within the beat)
        const masterBeatsElapsed = (masterPos - masterOffset) / masterBeatDurationInBuffer;
        const beatFraction = ((masterBeatsElapsed % 1.0) + 1.0) % 1.0;

        // Target fractional phase aligned with master beat grid
        const targetFrac =
          selectedRatio === 0.5
            ? ((beatFraction * 0.5) % 1.0 + 1.0) % 1.0
            : beatFraction;

        // Quantize follower to the nearest beat index with matching beatFraction
        const currentFollowerBeats = (followerPos - followerOffset) / followerBeatDurationInBuffer;
        const k = Math.round(currentFollowerBeats - targetFrac);
        let alignedTime = followerOffset + (k + targetFrac) * followerBeatDurationInBuffer;

        // Ensure within buffer boundaries
        if (alignedTime < 0) alignedTime += followerBeatDurationInBuffer;
        if (alignedTime > follower.buffer.duration) alignedTime -= followerBeatDurationInBuffer;

        // Constrain within active loop bounds if follower is currently looping
        if (follower.loopActive && follower.loopEnd > follower.loopStart) {
          const loopLen = follower.loopEnd - follower.loopStart;
          alignedTime = follower.loopStart + (((alignedTime - follower.loopStart) % loopLen) + loopLen) % loopLen;
        }

        follower.playbackPosition = Math.max(0, Math.min(follower.buffer.duration, alignedTime));

        if (follower.isPlaying) {
          follower.resyncNodeToPosition();
        }
      }
    } finally {
      this.isSyncing = false;
    }

    this.notify();
  }

  public toggleMasterSync() {
    this.setMasterSync(!this.isSyncActive);
  }

  public setMasterSync(active: boolean) {
    this.isSyncActive = active;

    if (!active) {
      this.syncOutOfRange = false;
      this.syncOutOfRangeInfo = null;
      if (this.deckA) this.deckA.syncOutOfRange = false;
      if (this.deckB) this.deckB.syncOutOfRange = false;
    }

    if (this.deckA) this.deckA.isSyncActive = this.isSyncActive;
    if (this.deckB) this.deckB.isSyncActive = this.isSyncActive;

    if (this.isSyncActive) {
      this.syncDecks();
    } else {
      this.notify();
    }
  }

  // Load user local files into Deck (handles single or multiple files)
  public async loadUserFiles(deckId: 'A' | 'B', files: FileList | File[]): Promise<void> {
    if (!this.ctx) await this.initialize();
    if (!this.ctx) return;

    const deck = deckId === 'A' ? this.deckA : this.deckB;
    if (!deck) return;

    const fileList = Array.from(files);
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        const meta = await extractAudioMetadata(file);
        const { bpm, firstBeatOffset } = detectBPMAndBeatGrid(audioBuffer, meta.bpm);

        deck.addTrack(
          audioBuffer,
          {
            title: meta.title || file.name.replace(/\.[^/.]+$/, ''),
            artist: meta.artist || 'Local Audio File',
            duration: audioBuffer.duration,
            bpm,
            firstBeatOffset,
            artworkUrl: meta.artworkUrl,
          },
          i === 0 && deck.currentTrackIndex === -1 // Auto-activate if deck was empty
        );
      } catch (err) {
        console.error('Failed to decode audio file:', file.name, err);
      }
    }

    this.notify();
  }

  // Load single user local file into Deck (backwards-compatible)
  public async loadUserFile(deckId: 'A' | 'B', file: File): Promise<void> {
    return this.loadUserFiles(deckId, [file]);
  }

  // Open audio file picker dialog for Deck A or Deck B
  public async openFileDialog(deckId: 'A' | 'B'): Promise<void> {
    const wasFullscreen = typeof document !== 'undefined' && !!document.fullscreenElement;

    // 1. Try modern File System Access API
    if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      try {
        const handles = await (window as any).showOpenFilePicker({
          multiple: true,
          types: [
            {
              description: 'Audio Files',
              accept: {
                'audio/*': ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.webm', '.opus'],
              },
            },
          ],
        });

        if (handles && handles.length > 0) {
          const files: File[] = [];
          for (const handle of handles) {
            try {
              files.push(await handle.getFile());
            } catch (_) {}
          }
          if (files.length > 0) {
            await this.loadUserFiles(deckId, files);
          }
        }

        if (wasFullscreen && !document.fullscreenElement) {
          try {
            await document.documentElement.requestFullscreen();
          } catch (_) {}
        }
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          if (wasFullscreen && !document.fullscreenElement) {
            try {
              await document.documentElement.requestFullscreen();
            } catch (_) {}
          }
          return;
        }
      }
    }

    // 2. Fallback to hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac,.webm,.opus';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = async () => {
      if (input.files && input.files.length > 0) {
        await this.loadUserFiles(deckId, input.files);
      }
      if (wasFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
      document.body.removeChild(input);
    };
    input.click();
  }

  // Recording
  public startRecording() {
    if (!this.recordDest || this.isRecording) return;
    this.recordedChunks = [];
    try {
      this.mediaRecorder = new MediaRecorder(this.recordDest.stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg',
      });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };
      this.mediaRecorder.onstop = () => {
        this.downloadMix();
      };
      this.mediaRecorder.start();
      this.isRecording = true;
      this.notify();
    } catch (e) {
      console.error('Recording error:', e);
    }
  }

  public stopRecording() {
    if (!this.mediaRecorder || !this.isRecording) return;
    this.mediaRecorder.stop();
    this.isRecording = false;
    this.notify();
  }

  private downloadMix() {
    if (this.recordedChunks.length === 0) return;
    const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DJ_Live_Mix_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private masterVUDataArray: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(32));

  public getMasterVU(): number {
    if (!this.masterAnalyser) return 0;
    this.masterAnalyser.getByteFrequencyData(this.masterVUDataArray);
    let sum = 0;
    for (let i = 0; i < 32; i++) sum += this.masterVUDataArray[i];
    return Math.min(1.0, (sum / (32 * 255)) * 1.6);
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public notify() {
    this.listeners.forEach((l) => l());
  }
}
