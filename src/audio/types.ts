export type WaveformType = 'sine' | 'sawtooth' | 'square' | 'triangle';
export type FilterType = 'lowpass' | 'highpass' | 'bandpass';

export interface ADSRConfig {
  attack: number;   // seconds
  decay: number;    // seconds
  sustain: number;  // level 0 - 1
  release: number;  // seconds
}

export interface SynthConfig {
  osc1Type: WaveformType;
  osc1Octave: number; // -2 to +2
  osc1Detune: number; // cents -50 to +50
  osc1Gain: number;   // 0 to 1

  osc2Type: WaveformType;
  osc2Octave: number;
  osc2Detune: number;
  osc2Gain: number;

  subOscGain: number; // 0 to 1

  // Filter
  filterType: FilterType;
  filterCutoff: number;    // Hz (20 to 18000)
  filterResonance: number; // Q (0.1 to 20)
  filterEnvAmount: number; // Hz envelope sweep (-5000 to +8000)

  // Envelopes
  ampEnv: ADSRConfig;
  filterEnv: ADSRConfig;

  // LFO
  lfoRate: number;        // Hz (0.1 to 20)
  lfoDepth: number;       // 0 to 1
  lfoTarget: 'pitch' | 'cutoff' | 'pan';

  // Effects
  drive: number;          // 0 to 1 (tanh distortion)
  delayTime: number;      // 0.05 to 1.0 sec
  delayFeedback: number;  // 0 to 0.9
  delayWet: number;       // 0 to 1
  reverbDecay: number;    // 0.5 to 5.0 sec
  reverbWet: number;      // 0 to 1
  masterVolume: number;   // 0 to 1
}

export interface DrumStep {
  active: boolean;
  velocity: number; // 0 to 1
}

export interface SynthStep {
  active: boolean;
  note: string;     // e.g. "C3", "D#3", "G3"
  velocity: number;
}

export interface SequencerTrack {
  id: string;
  name: string;
  type: 'kick' | 'snare' | 'hihat' | 'perc' | 'synthLead' | 'synthBass';
  steps: boolean[];
  notes?: string[]; // for synth tracks
  velocities: number[];
  muted: boolean;
}

export interface Preset {
  id: string;
  name: string;
  category: string;
  description: string;
  synth: SynthConfig;
  bpm: number;
  scale: string;
  rootNote: string;
  sequencerPattern?: SequencerTrack[];
}

export type VisualizerMode = 'neural' | 'cybercore' | 'terrain';

export interface VisualizerTheme {
  name: string;
  id: string;
  primary: string;    // hex
  secondary: string;  // hex
  accent: string;     // hex
  background: string; // hex
}
