import { createAlgorithmicNoiseBuffer } from './synthPhysics';

/**
 * 100% Procedural Drum Synthesizer.
 * Generates analog drum machine sounds via pure mathematical oscillator sweeps,
 * noise synthesis, and dynamic envelopes.
 * ZERO audio sample files.
 */
export class ProceduralDrums {
  private ctx: AudioContext;
  private destination: AudioNode;
  private noiseBuffer: AudioBuffer | null = null;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.destination = destination;
    this.initNoise();
  }

  private initNoise() {
    this.noiseBuffer = createAlgorithmicNoiseBuffer(this.ctx, 1.5);
  }

  /**
   * Procedural 808/909-style Kick Drum.
   * Sine wave frequency sweep from ~160 Hz -> 35 Hz + transient click.
   */
  triggerKick(time: number = this.ctx.currentTime, velocity: number = 1.0) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Pitch sweep envelope
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(36, time + 0.08);

    // Amplitude decay envelope
    const peakGain = Math.max(0.01, velocity * 1.2);
    gain.gain.setValueAtTime(peakGain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    // Beater click transient (short burst)
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(450, time);
    clickOsc.frequency.exponentialRampToValueAtTime(50, time + 0.02);

    clickGain.gain.setValueAtTime(0.7 * velocity, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.025);

    clickOsc.connect(clickGain);
    clickGain.connect(this.destination);

    osc.connect(gain);
    gain.connect(this.destination);

    osc.start(time);
    osc.stop(time + 0.4);
    clickOsc.start(time);
    clickOsc.stop(time + 0.03);
  }

  /**
   * Procedural Snare Drum.
   * Dual-layer: filtered algorithmic white noise snap + pitched resonant body tone.
   */
  triggerSnare(time: number = this.ctx.currentTime, velocity: number = 1.0) {
    if (!this.noiseBuffer) return;

    // Layer 1: Noise Snap
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(1000, time);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(velocity * 0.9, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.destination);

    // Layer 2: Tonal Shell / Body
    const bodyOsc = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(220, time);
    bodyOsc.frequency.exponentialRampToValueAtTime(140, time + 0.12);

    bodyGain.gain.setValueAtTime(velocity * 0.6, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.destination);

    noiseSource.start(time);
    noiseSource.stop(time + 0.25);
    bodyOsc.start(time);
    bodyOsc.stop(time + 0.16);
  }

  /**
   * Procedural Closed Hi-Hat.
   * High-pass filtered noise with ultra-fast snappy exponential decay.
   */
  triggerHiHat(time: number = this.ctx.currentTime, velocity: number = 1.0, open: boolean = false) {
    if (!this.noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    // Resonant bandpass + highpass metallic filter
    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(8500, time);
    bandpass.Q.setValueAtTime(4, time);

    const highpass = this.ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(7000, time);

    const gain = this.ctx.createGain();
    const decayDuration = open ? 0.35 : 0.045;

    gain.gain.setValueAtTime(velocity * 0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decayDuration);

    noise.connect(bandpass);
    bandpass.connect(highpass);
    highpass.connect(gain);
    gain.connect(this.destination);

    noise.start(time);
    noise.stop(time + decayDuration + 0.05);
  }

  /**
   * Procedural Percussion / Rim / Cyber-woodblock.
   * Resonant bandpass sine burst with snappy ping.
   */
  triggerPerc(time: number = this.ctx.currentTime, velocity: number = 1.0) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, time);
    osc.frequency.exponentialRampToValueAtTime(280, time + 0.06);

    gain.gain.setValueAtTime(velocity * 0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    osc.connect(gain);
    gain.connect(this.destination);

    osc.start(time);
    osc.stop(time + 0.09);
  }
}
