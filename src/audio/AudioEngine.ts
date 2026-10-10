import type { SynthConfig, SequencerTrack } from './types';

import { DEFAULT_SYNTH_CONFIG, PRESETS } from './presets';
import { ProceduralDrums } from './ProceduralDrums';
import { EffectsChain } from './EffectsChain';
import { Voice } from './Voice';
import { GenerativeSequencer } from './GenerativeSequencer';
import { KarplusStrong } from './KarplusStrong';
import { AccompanimentEngine } from './AccompanimentEngine';
import { noteToFreq } from './synthPhysics';

export class AudioEngine {
  private static instance: AudioEngine | null = null;

  public ctx: AudioContext | null = null;
  public isInitialized: boolean = false;
  public config: SynthConfig = { ...DEFAULT_SYNTH_CONFIG };
  public sequencer: GenerativeSequencer | null = null;
  public drums: ProceduralDrums | null = null;
  public guitar: KarplusStrong | null = null;
  public accompaniment: AccompanimentEngine | null = null;
  public effects: EffectsChain | null = null;
  public analyser: AnalyserNode | null = null;


  // Polyphony
  private activeVoices: Map<number, Voice> = new Map();
  private masterGain: GainNode | null = null;

  // Recording
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  public isRecording: boolean = false;
  private recordDest: MediaStreamAudioDestinationNode | null = null;

  // Listeners for UI state
  private onStateChangeListeners: Set<() => void> = new Set();

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
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

    // 1. Master Output Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.config.masterVolume, this.ctx.currentTime);

    // 2. Analyser Node for 3D Visualizer
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.8;

    // 3. Effects Chain
    this.effects = new EffectsChain(this.ctx);

    // 4. Procedural Drums & Karplus-Strong Physical Modeling Guitar
    this.drums = new ProceduralDrums(this.ctx, this.effects.input);
    this.guitar = new KarplusStrong(this.ctx, this.effects.input);

    // 5. Connect Synth Voices/Drums/Guitar -> Effects -> Master Gain -> Analyser -> Output
    this.effects.output.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // 6. Live Generative Accompaniment Band
    this.accompaniment = new AccompanimentEngine(this.ctx, this.drums, this.effects.input);

    // 7. MediaStream destination for live recording
    try {
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(this.recordDest);
    } catch (e) {
      console.warn('Recording destination unsupported:', e);
    }

    // 8. Sequencer setup
    this.sequencer = new GenerativeSequencer(this.ctx);
    this.sequencer.setCallbacks(
      () => this.notifyListeners(),
      (track, step, time) => this.handleSequencerTrigger(track, step, time)
    );

    this.isInitialized = true;
    this.applyConfig(this.config);
    this.notifyListeners();
  }

  private handleSequencerTrigger(track: SequencerTrack, step: number, time: number) {
    if (!this.drums || !this.ctx) return;
    const velocity = track.velocities[step] ?? 0.8;

    if (track.type === 'kick') {
      this.drums.triggerKick(time, velocity);
    } else if (track.type === 'snare') {
      this.drums.triggerSnare(time, velocity);
    } else if (track.type === 'hihat') {
      this.drums.triggerHiHat(time, velocity, false);
    } else if (track.type === 'perc') {
      this.drums.triggerPerc(time, velocity);
    } else if (track.type === 'synthLead' || track.type === 'synthBass') {
      if (track.notes && track.notes[step]) {
        const noteName = track.notes[step];
        const freq = noteToFreq(noteName);
        const midi = Math.round(69 + 12 * Math.log2(freq / 440));
        this.triggerTimedNote(midi, velocity, time, 0.18);
      }
    }
  }

  /**
   * Play note for interactive piano / keyboard hotkeys
   */
  public noteOn(midiNote: number, velocity: number = 0.85) {
    if (!this.ctx || !this.effects) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // Stop existing voice if note is already sounding
    if (this.activeVoices.has(midiNote)) {
      this.noteOff(midiNote);
    }

    const voice = new Voice(this.ctx, this.effects.input, midiNote, velocity, this.config);
    this.activeVoices.set(midiNote, voice);

    // Notify Accompaniment engine to dynamically adapt backing band
    this.accompaniment?.registerUserNote(midiNote, velocity);
    this.notifyListeners();
  }

  public noteOff(midiNote: number) {
    const voice = this.activeVoices.get(midiNote);
    if (voice) {
      voice.noteOff(() => {
        if (this.activeVoices.get(midiNote) === voice) {
          this.activeVoices.delete(midiNote);
        }
      });
      this.activeVoices.delete(midiNote);
    }
  }

  /**
   * Pluck algorithmic guitar string (Karplus-Strong physical modeling)
   */
  public pluckGuitar(
    freq: number,
    velocity: number = 0.85,
    damping: number = 0.988,
    brightness: number = 0.75,
    pan: number = 0
  ) {
    if (!this.guitar || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.guitar.pluck(freq, velocity, damping, brightness, pan);

    // Compute approximate MIDI note for accompaniment key detection
    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
    this.accompaniment?.registerUserNote(midi, velocity);
    this.notifyListeners();
  }

  /**
   * Trigger procedural drum with accompaniment notification
   */
  public triggerDrum(type: 'kick' | 'snare' | 'hihat' | 'perc', velocity: number = 0.9) {
    if (!this.drums || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (type === 'kick') this.drums.triggerKick(this.ctx.currentTime, velocity);
    else if (type === 'snare') this.drums.triggerSnare(this.ctx.currentTime, velocity);
    else if (type === 'hihat') this.drums.triggerHiHat(this.ctx.currentTime, velocity, false);
    else if (type === 'perc') this.drums.triggerPerc(this.ctx.currentTime, velocity);

    this.accompaniment?.registerUserDrumHit();
    this.notifyListeners();
  }


  /**
   * Trigger note with fixed duration (for sequencer)
   */
  public triggerTimedNote(midiNote: number, velocity: number = 0.8, _time: number = 0, duration: number = 0.2) {
    if (!this.ctx || !this.effects) return;
    const voice = new Voice(this.ctx, this.effects.input, midiNote, velocity, this.config);
    setTimeout(() => {
      voice.noteOff();
    }, duration * 1000);
  }


  public applyConfig(newConfig: Partial<SynthConfig>) {
    this.config = { ...this.config, ...newConfig };

    if (!this.ctx || !this.effects || !this.masterGain) return;

    if (newConfig.masterVolume !== undefined) {
      this.masterGain.gain.setTargetAtTime(this.config.masterVolume, this.ctx.currentTime, 0.05);
    }
    if (newConfig.drive !== undefined) {
      this.effects.setDistortion(this.config.drive);
    }
    if (newConfig.delayTime !== undefined || newConfig.delayFeedback !== undefined || newConfig.delayWet !== undefined) {
      this.effects.setDelay(this.config.delayTime, this.config.delayFeedback, this.config.delayWet);
    }
    if (newConfig.reverbDecay !== undefined || newConfig.reverbWet !== undefined) {
      this.effects.setReverb(this.config.reverbDecay, this.config.reverbWet);
    }

    this.notifyListeners();
  }

  public loadPreset(presetId: string) {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    this.applyConfig(preset.synth);
    if (this.sequencer) {
      this.sequencer.bpm = preset.bpm;
      this.sequencer.mutateAll(preset.scale, preset.rootNote);
    }
    this.notifyListeners();
  }

  // --- Live Audio Recording ---
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
        this.downloadRecording();
      };
      this.mediaRecorder.start();
      this.isRecording = true;
      this.notifyListeners();
    } catch (e) {
      console.error('MediaRecorder start error:', e);
    }
  }

  public stopRecording() {
    if (!this.mediaRecorder || !this.isRecording) return;
    this.mediaRecorder.stop();
    this.isRecording = false;
    this.notifyListeners();
  }

  private downloadRecording() {
    if (this.recordedChunks.length === 0) return;
    const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NeuralSynth_Session_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // State Change Subscriber
  public subscribe(listener: () => void): () => void {
    this.onStateChangeListeners.add(listener);
    return () => this.onStateChangeListeners.delete(listener);
  }

  private notifyListeners() {
    this.onStateChangeListeners.forEach((listener) => listener());
  }
}
