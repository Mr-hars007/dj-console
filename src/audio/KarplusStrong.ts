/**
 * 100% Algorithmic Karplus-Strong Physical Modeling Plucked String Synthesizer.
 * Simulates the physical acoustics of a vibrating string:
 * A burst of noise excitation circulating through a feedback delay line with low-pass damping.
 * ZERO audio sample files.
 */
export class KarplusStrong {
  private ctx: AudioContext;
  private destination: AudioNode;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.destination = destination;
  }

  /**
   * Pluck a string at a specific frequency with physical acoustic modeling.
   * @param freq Fundamental frequency of the string (Hz)
   * @param velocity Pluck intensity (0 to 1)
   * @param damping String material damping (0.9 to 0.995)
   * @param brightness Pick brightness / sharpness (0 to 1)
   */
  public pluck(
    freq: number,
    velocity: number = 0.8,
    damping: number = 0.988,
    brightness: number = 0.75,
    panPosition: number = 0
  ) {
    const sampleRate = this.ctx.sampleRate;
    const duration = Math.min(3.5, Math.max(0.8, (1200 / freq) * 0.8)); // Lower notes ring longer
    const totalSamples = Math.floor(sampleRate * duration);
    const periodSamples = Math.max(2, Math.round(sampleRate / freq));

    // Allocate in-memory audio buffer for this plucked note
    const buffer = this.ctx.createBuffer(1, totalSamples, sampleRate);
    const channelData = buffer.getChannelData(0);

    // 1. Initial excitation: Filtered noise burst in the delay line
    let prevNoise = 0;
    for (let i = 0; i < periodSamples; i++) {
      const white = Math.random() * 2 - 1;
      // Filter excitation for pick softness / brightness
      prevNoise = prevNoise * (1 - brightness) + white * brightness;
      channelData[i] = prevNoise;
    }

    // 2. Karplus-Strong feedback loop:
    // y[i] = 0.5 * (y[i - N] + y[i - N - 1]) * damping
    for (let i = periodSamples; i < totalSamples; i++) {
      const idxA = i - periodSamples;
      const idxB = idxA > 0 ? idxA - 1 : periodSamples - 1;
      const filtered = 0.5 * (channelData[idxA] + channelData[idxB]);
      channelData[i] = filtered * damping;
    }

    // 3. Play through AudioContext with gain & stereo panner
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = this.ctx.createGain();
    const peakGain = Math.max(0.05, velocity * 0.85);
    gainNode.gain.setValueAtTime(peakGain, this.ctx.currentTime);

    // Dynamic Stereo Panner (if supported)
    if (this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.8, Math.min(0.8, panPosition)), this.ctx.currentTime);
      source.connect(gainNode);
      gainNode.connect(panner);
      panner.connect(this.destination);
    } else {
      source.connect(gainNode);
      gainNode.connect(this.destination);
    }

    source.start(this.ctx.currentTime);
  }
}
