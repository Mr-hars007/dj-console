/**
 * Pro DJ Key Lock (Master Tempo) DSP Engine.
 * 
 * Preserves the musical pitch of tracks when tempo/pitch faders or SYNC
 * alter playback speed. Operates via high-precision dual-grain Hann-windowed
 * overlap-add time-stretching with sub-sample linear interpolation.
 * 
 * - When Key Lock is ON: changing tempo changes BPM while locking musical key to original pitch.
 * - When Key Lock is OFF: changing tempo shifts both speed and pitch (classic vinyl behavior).
 * - When tempo multiplier is at unity (1.0x / 0.0% detent), automatically runs zero-latency pass-through.
 */
export class KeyLockNode {
  public ctx: AudioContext;
  public input: GainNode;
  public output: GainNode;
  private processor: ScriptProcessorNode | null = null;
  private bypassGain: GainNode;
  private wetGain: GainNode;

  public enabled: boolean = false;
  public tempoMultiplier: number = 1.0;

  // Ring buffer for stereo audio (large enough for smooth grain transitions)
  private bufferSize: number = 32768;
  private ringBufferL: Float32Array;
  private ringBufferR: Float32Array;
  private writeIndex: number = 0;

  // 4-Grain Overlap-Add for smooth, artifact-free pitch preservation
  private numGrains: number = 4;
  private grainSize: number = 2048;
  private nominalDelay: number = 4096;
  private phases: Float32Array;
  private readPositions: Float32Array;
  private currentS: number = 1.0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.bypassGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    this.ringBufferL = new Float32Array(this.bufferSize);
    this.ringBufferR = new Float32Array(this.bufferSize);

    this.phases = new Float32Array(this.numGrains);
    this.readPositions = new Float32Array(this.numGrains);

    const grainSpacing = Math.floor(this.grainSize / this.numGrains);
    for (let g = 0; g < this.numGrains; g++) {
      this.phases[g] = g * grainSpacing;
      this.readPositions[g] = (this.bufferSize - this.nominalDelay + g * grainSpacing) % this.bufferSize;
    }

    // Direct native hardware bypass connection: runs on browser C++ audio thread with 0% JS overhead
    this.input.connect(this.bypassGain);
    this.bypassGain.connect(this.output);

    this.setupProcessor();
    this.updateRouting();
  }

  private setupProcessor() {
    try {
      this.processor = this.ctx.createScriptProcessor(2048, 2, 2);

      this.processor.onaudioprocess = (e: AudioProcessingEvent) => {
        // If bypassed, zero wet output
        if (!this.enabled || Math.abs(this.tempoMultiplier - 1.0) < 0.002) {
          const outL = e.outputBuffer.getChannelData(0);
          const outR = e.outputBuffer.numberOfChannels > 1 ? e.outputBuffer.getChannelData(1) : null;
          outL.fill(0);
          if (outR) outR.fill(0);
          return;
        }

        const inL = e.inputBuffer.getChannelData(0);
        const inR = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : inL;
        const outL = e.outputBuffer.getChannelData(0);
        const outR = e.outputBuffer.numberOfChannels > 1 ? e.outputBuffer.getChannelData(1) : null;

        const len = inL.length;
        // Pitch shift factor required to neutralize tempo pitch variation:
        // When tempoMultiplier is 1.1 (+10%), playback is pitched up by 1.1x, so pitch shift must be 1/1.1 = 0.909x
        const targetS = 1.0 / Math.max(0.5, Math.min(2.0, this.tempoMultiplier));
        const G = this.grainSize;
        const M = this.bufferSize;
        const D = this.nominalDelay;
        const K = this.numGrains;

        for (let i = 0; i < len; i++) {
          // Smooth pitch ratio transitions per sample to eliminate chirps
          this.currentS += (targetS - this.currentS) * 0.005;
          const S = this.currentS;

          this.ringBufferL[this.writeIndex] = inL[i];
          this.ringBufferR[this.writeIndex] = inR[i];
          this.writeIndex = (this.writeIndex + 1) % M;

          let accL = 0;
          let accR = 0;

          for (let g = 0; g < K; g++) {
            // Raised-cosine Hann window: constant unity gain across all 4 grains (sum of weights = 2.0 / K = 0.5 * 4 = 2.0)
            const w = 0.5 * (1 - Math.cos((2 * Math.PI * this.phases[g]) / G));

            const pos = this.readPositions[g];
            const i0 = Math.floor(pos);
            const f0 = pos - i0;
            const next0 = (i0 + 1) % M;

            const sL = (1 - f0) * this.ringBufferL[i0] + f0 * this.ringBufferL[next0];
            const sR = (1 - f0) * this.ringBufferR[i0] + f0 * this.ringBufferR[next0];

            accL += w * sL;
            accR += w * sR;

            this.phases[g]++;
            if (this.phases[g] >= G) {
              this.phases[g] = 0;
              this.readPositions[g] = (this.writeIndex - D + M) % M;
            } else {
              this.readPositions[g] = (this.readPositions[g] + S) % M;
            }
          }

          // Scale by 2.0 / numGrains for exact 1.0 unity gain
          const norm = 2.0 / K;
          outL[i] = accL * norm;
          if (outR) {
            outR[i] = accR * norm;
          }
        }
      };

      this.input.connect(this.processor);
      this.processor.connect(this.wetGain);
      this.wetGain.connect(this.output);
    } catch (err) {
      console.warn('KeyLock processor initialization fallback to direct bypass:', err);
    }
  }

  private updateRouting() {
    const isBypassed = !this.enabled || Math.abs(this.tempoMultiplier - 1.0) < 0.002;
    const now = this.ctx.currentTime;
    if (isBypassed) {
      this.bypassGain.gain.setTargetAtTime(1.0, now, 0.03);
      this.wetGain.gain.setTargetAtTime(0.0, now, 0.03);
    } else {
      this.bypassGain.gain.setTargetAtTime(0.0, now, 0.03);
      this.wetGain.gain.setTargetAtTime(1.0, now, 0.03);
    }
  }

  public setEnabled(active: boolean) {
    this.enabled = active;
    this.updateRouting();
  }

  public setTempoMultiplier(mult: number) {
    this.tempoMultiplier = mult;
    this.updateRouting();
  }

  public dispose() {
    try {
      this.input.disconnect();
      if (this.processor) {
        this.processor.disconnect();
        this.processor.onaudioprocess = null;
      }
      this.bypassGain.disconnect();
      this.wetGain.disconnect();
      this.output.disconnect();
    } catch (_) {}
  }
}
