/**
 * Pure mathematical functions and algorithmic physics for sound synthesis.
 * ZERO external samples or copyrighted audio files.
 */

// Note names in 12-Tone Equal Temperament
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/**
 * Convert MIDI note number to Frequency (Hz) using standard A4 = 440 Hz
 */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Convert Note Name (e.g. "A4", "C#3") to Frequency (Hz)
 */
export function noteToFreq(note: string): number {
  const match = note.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return 440;
  const noteName = match[1];
  const octave = parseInt(match[2], 10);
  const noteIndex = NOTE_NAMES.indexOf(noteName as any);
  if (noteIndex === -1) return 440;
  const midi = (octave + 1) * 12 + noteIndex;
  return midiToFreq(midi);
}

/**
 * Convert MIDI note number to formatted Note Name string (e.g. 60 -> "C4")
 */
export function midiToNote(midi: number): string {
  const noteIndex = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/**
 * Algorithmic White Noise Generator.
 * Generates an in-memory stereo AudioBuffer with purely uniform pseudorandom values.
 */
export function createAlgorithmicNoiseBuffer(ctx: AudioContext, durationSeconds: number = 2): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const bufferSize = sampleRate * durationSeconds;
  const buffer = ctx.createBuffer(2, bufferSize, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < bufferSize; i++) {
      // Uniform distribution [-1.0, 1.0]
      channelData[i] = Math.random() * 2 - 1;
    }
  }

  return buffer;
}

/**
 * Algorithmic Pink Noise Generator.
 * Generates an in-memory pink noise buffer (1/f power spectrum) using Paul Kellet's filter algorithm.
 */
export function createPinkNoiseBuffer(ctx: AudioContext, durationSeconds: number = 2): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const bufferSize = sampleRate * durationSeconds;
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);

  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }

  return buffer;
}

/**
 * Algorithmic Stereo Impulse Response Generator for Reverb.
 * Synthesizes an acoustic room/hall impulse response in memory mathematically.
 * Uses exponentially decaying Gaussian noise with stereo decorrelation and frequency absorption.
 * ZERO sample files needed.
 */
export function createAlgorithmicImpulseResponse(
  ctx: AudioContext,
  durationSeconds: number = 2.5,
  decay: number = 2.0
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * durationSeconds);
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    // Exponential amplitude decay envelope
    const envelope = Math.exp(-t * (decay * 1.5));
    
    // Stereo decorrelated Gaussian noise
    const leftNoise = (Math.random() * 2 - 1) * envelope;
    const rightNoise = (Math.random() * 2 - 1) * envelope;

    // Apply high-frequency dampening simulation over time
    const damping = Math.max(0.05, 1 - (t / durationSeconds) * 0.7);

    left[i] = leftNoise * damping;
    right[i] = rightNoise * damping;
  }

  return impulse;
}

/**
 * Distortion Wave-Shaping Curve.
 * Generates a smooth non-linear saturation curve (Math.tanh) for warm analog-style overdrive.
 */
export function makeDistortionCurve(drive: number = 0, samples: number = 44100): Float32Array {
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  const k = Math.max(0, drive * 50);

  for (let i = 0; i < samples; ++i) {
    const x = (i * 2) / samples - 1;
    if (k === 0) {
      curve[i] = x;
    } else {
      // Soft saturation using arctangent / tanh approximation
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
  }
  return curve;
}

/**
 * Euclidean Rhythm Algorithm.
 * Distributes `k` pulses as evenly as possible across `n` steps (Bresenham/Bjorklund).
 */
export function generateEuclideanRhythm(pulses: number, steps: number): boolean[] {
  if (pulses >= steps) return new Array(steps).fill(true);
  if (pulses <= 0) return new Array(steps).fill(false);

  const pattern = new Array(steps).fill(false);
  let bucket = 0;
  for (let i = 0; i < steps; i++) {
    bucket += pulses;
    if (bucket >= steps) {
      bucket -= steps;
      pattern[i] = true;
    }
  }
  return pattern;
}
