import { createAlgorithmicImpulseResponse, makeDistortionCurve } from './synthPhysics';

export class EffectsChain {
  public input: GainNode;
  public output: GainNode;

  private ctx: AudioContext;
  private distortionNode: WaveShaperNode;
  private delayNode: DelayNode;
  private delayFeedbackNode: GainNode;
  private delayWetGain: GainNode;

  private convolverNode: ConvolverNode;
  private reverbWetGain: GainNode;

  private dryGain: GainNode;
  private compressor: DynamicsCompressorNode;

  private currentDecay: number = 2.2;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // Routing nodes
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // 1. Distortion
    this.distortionNode = ctx.createWaveShaper();
    this.distortionNode.oversample = '4x';
    (this.distortionNode.curve as any) = makeDistortionCurve(0);

    // 2. Delay
    this.delayNode = ctx.createDelay(2.0);
    this.delayNode.delayTime.setValueAtTime(0.3, ctx.currentTime);
    this.delayFeedbackNode = ctx.createGain();
    this.delayFeedbackNode.gain.setValueAtTime(0.4, ctx.currentTime);
    this.delayWetGain = ctx.createGain();
    this.delayWetGain.gain.setValueAtTime(0.25, ctx.currentTime);

    // Delay loop
    this.delayNode.connect(this.delayFeedbackNode);
    this.delayFeedbackNode.connect(this.delayNode);
    this.delayNode.connect(this.delayWetGain);

    // 3. Procedural Algorithmic Reverb (Zero audio files)
    this.convolverNode = ctx.createConvolver();
    this.updateReverbImpulse(2.2);
    this.reverbWetGain = ctx.createGain();
    this.reverbWetGain.gain.setValueAtTime(0.3, ctx.currentTime);
    this.convolverNode.connect(this.reverbWetGain);

    // 4. Dry Path
    this.dryGain = ctx.createGain();
    this.dryGain.gain.setValueAtTime(1.0, ctx.currentTime);

    // 5. Master Compressor / Limiter for punch and safety
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-12, ctx.currentTime);
    this.compressor.knee.setValueAtTime(30, ctx.currentTime);
    this.compressor.ratio.setValueAtTime(12, ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    this.compressor.release.setValueAtTime(0.25, ctx.currentTime);

    // Wire: Input -> Distortion -> [Dry, Delay, Reverb] -> Compressor -> Output
    this.input.connect(this.distortionNode);

    this.distortionNode.connect(this.dryGain);
    this.distortionNode.connect(this.delayNode);
    this.distortionNode.connect(this.convolverNode);

    this.dryGain.connect(this.compressor);
    this.delayWetGain.connect(this.compressor);
    this.reverbWetGain.connect(this.compressor);

    this.compressor.connect(this.output);
  }

  public updateReverbImpulse(decay: number) {
    try {
      this.currentDecay = decay;
      this.convolverNode.buffer = createAlgorithmicImpulseResponse(this.ctx, Math.max(1, decay * 1.2), decay);
    } catch (e) {
      console.warn('Reverb buffer generation error:', e);
    }
  }

  public setDistortion(drive: number) {
    (this.distortionNode.curve as any) = makeDistortionCurve(drive);
  }

  public setDelay(time: number, feedback: number, wet: number) {
    const t = this.ctx.currentTime;
    this.delayNode.delayTime.setTargetAtTime(Math.max(0.01, Math.min(1.5, time)), t, 0.05);
    this.delayFeedbackNode.gain.setTargetAtTime(Math.max(0, Math.min(0.85, feedback)), t, 0.05);
    this.delayWetGain.gain.setTargetAtTime(Math.max(0, Math.min(1, wet)), t, 0.05);
  }

  public setReverb(decay: number, wet: number) {
    const t = this.ctx.currentTime;
    if (Math.abs(decay - this.currentDecay) > 0.3) {
      this.updateReverbImpulse(decay);
    }
    this.reverbWetGain.gain.setTargetAtTime(Math.max(0, Math.min(1, wet)), t, 0.05);
  }

}
