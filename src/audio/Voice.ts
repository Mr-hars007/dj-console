import type { SynthConfig } from './types';

import { midiToFreq } from './synthPhysics';

export class Voice {
  public midiNote: number;
  public isReleasing: boolean = false;

  private ctx: AudioContext;
  private destination: AudioNode;
  private config: SynthConfig;

  // Nodes
  private osc1: OscillatorNode;
  private osc1Gain: GainNode;

  private osc2: OscillatorNode;
  private osc2Gain: GainNode;

  private subOsc: OscillatorNode;
  private subOscGain: GainNode;

  private filterNode: BiquadFilterNode;
  private ampGain: GainNode;
  private lfoNode: OscillatorNode;
  private lfoGain: GainNode;

  private startTime: number;

  constructor(ctx: AudioContext, destination: AudioNode, midiNote: number, velocity: number, config: SynthConfig) {
    this.ctx = ctx;
    this.destination = destination;
    this.midiNote = midiNote;
    this.config = config;
    this.startTime = ctx.currentTime;

    const baseFreq = midiToFreq(midiNote);

    // 1. Filter
    this.filterNode = ctx.createBiquadFilter();
    this.filterNode.type = config.filterType;
    this.filterNode.Q.setValueAtTime(config.filterResonance, this.startTime);

    // 2. Amp Gain
    this.ampGain = ctx.createGain();
    this.ampGain.gain.setValueAtTime(0, this.startTime);

    // 3. LFO
    this.lfoNode = ctx.createOscillator();
    this.lfoNode.type = 'sine';
    this.lfoNode.frequency.setValueAtTime(config.lfoRate, this.startTime);

    this.lfoGain = ctx.createGain();

    // Route LFO
    if (config.lfoTarget === 'cutoff') {
      this.lfoGain.gain.setValueAtTime(config.lfoDepth * 2000, this.startTime);
      this.lfoNode.connect(this.lfoGain);
      this.lfoGain.connect(this.filterNode.frequency);
    } else if (config.lfoTarget === 'pitch') {
      this.lfoGain.gain.setValueAtTime(config.lfoDepth * 40, this.startTime);
      this.lfoNode.connect(this.lfoGain);
    }

    // 4. Osc 1
    this.osc1 = ctx.createOscillator();
    this.osc1.type = config.osc1Type;
    const osc1Freq = baseFreq * Math.pow(2, config.osc1Octave);
    this.osc1.frequency.setValueAtTime(osc1Freq, this.startTime);
    this.osc1.detune.setValueAtTime(config.osc1Detune, this.startTime);
    if (config.lfoTarget === 'pitch') {
      this.lfoGain.connect(this.osc1.detune);
    }

    this.osc1Gain = ctx.createGain();
    this.osc1Gain.gain.setValueAtTime(config.osc1Gain, this.startTime);
    this.osc1.connect(this.osc1Gain);
    this.osc1Gain.connect(this.filterNode);

    // 5. Osc 2
    this.osc2 = ctx.createOscillator();
    this.osc2.type = config.osc2Type;
    const osc2Freq = baseFreq * Math.pow(2, config.osc2Octave);
    this.osc2.frequency.setValueAtTime(osc2Freq, this.startTime);
    this.osc2.detune.setValueAtTime(config.osc2Detune, this.startTime);
    if (config.lfoTarget === 'pitch') {
      this.lfoGain.connect(this.osc2.detune);
    }

    this.osc2Gain = ctx.createGain();
    this.osc2Gain.gain.setValueAtTime(config.osc2Gain, this.startTime);
    this.osc2.connect(this.osc2Gain);
    this.osc2Gain.connect(this.filterNode);

    // 6. Sub Osc (1 octave down sine)
    this.subOsc = ctx.createOscillator();
    this.subOsc.type = 'sine';
    this.subOsc.frequency.setValueAtTime(baseFreq * 0.5, this.startTime);

    this.subOscGain = ctx.createGain();
    this.subOscGain.gain.setValueAtTime(config.subOscGain, this.startTime);
    this.subOsc.connect(this.subOscGain);
    this.subOscGain.connect(this.filterNode);

    // 7. Route Filter -> AmpGain -> Destination
    this.filterNode.connect(this.ampGain);
    this.ampGain.connect(this.destination);

    // 8. Trigger Envelopes
    this.triggerAttack(velocity);

    // Start Oscillators
    this.osc1.start(this.startTime);
    this.osc2.start(this.startTime);
    this.subOsc.start(this.startTime);
    this.lfoNode.start(this.startTime);
  }

  private triggerAttack(velocity: number) {
    const t = this.startTime;
    const amp = this.config.ampEnv;
    const flt = this.config.filterEnv;

    const targetAmp = velocity * 0.45;
    const sustainAmp = targetAmp * amp.sustain;

    // Amplitude ADSR Attack & Decay
    this.ampGain.gain.cancelScheduledValues(t);
    this.ampGain.gain.setValueAtTime(0.0001, t);
    this.ampGain.gain.linearRampToValueAtTime(targetAmp, t + Math.max(0.005, amp.attack));
    this.ampGain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, sustainAmp),
      t + Math.max(0.005, amp.attack) + Math.max(0.01, amp.decay)
    );

    // Filter ADSR Envelope
    const baseCutoff = Math.max(20, Math.min(18000, this.config.filterCutoff));
    const peakCutoff = Math.max(20, Math.min(18000, baseCutoff + this.filterEnvEnvAmount(velocity)));
    const sustainCutoff = Math.max(20, Math.min(18000, baseCutoff + (peakCutoff - baseCutoff) * flt.sustain));


    this.filterNode.frequency.cancelScheduledValues(t);
    this.filterNode.frequency.setValueAtTime(baseCutoff, t);
    this.filterNode.frequency.exponentialRampToValueAtTime(peakCutoff, t + Math.max(0.005, flt.attack));
    this.filterNode.frequency.exponentialRampToValueAtTime(
      sustainCutoff,
      t + Math.max(0.005, flt.attack) + Math.max(0.01, flt.decay)
    );
  }

  public noteOff(onEndCallback?: () => void) {
    if (this.isReleasing) return;
    this.isReleasing = true;

    const t = this.ctx.currentTime;
    const releaseTime = Math.max(0.01, this.config.ampEnv.release);

    // Amp Release ramp down
    this.ampGain.gain.cancelScheduledValues(t);
    this.ampGain.gain.setValueAtTime(this.ampGain.gain.value, t);
    this.ampGain.gain.exponentialRampToValueAtTime(0.0001, t + releaseTime);

    // Filter Release ramp down
    const baseCutoff = Math.max(20, this.config.filterCutoff);
    this.filterNode.frequency.cancelScheduledValues(t);
    this.filterNode.frequency.setValueAtTime(this.filterNode.frequency.value, t);
    this.filterNode.frequency.exponentialRampToValueAtTime(baseCutoff, t + Math.max(0.01, this.config.filterEnv.release));

    // Cleanup nodes after release
    const stopTime = t + releaseTime + 0.05;
    this.osc1.stop(stopTime);
    this.osc2.stop(stopTime);
    this.subOsc.stop(stopTime);
    this.lfoNode.stop(stopTime);

    setTimeout(() => {
      try {
        this.osc1.disconnect();
        this.osc2.disconnect();
        this.subOsc.disconnect();
        this.filterNode.disconnect();
        this.ampGain.disconnect();
        this.lfoNode.disconnect();
        this.lfoGain.disconnect();
      } catch (e) {
        // ignore already disconnected
      }
      if (onEndCallback) onEndCallback();
    }, (releaseTime + 0.1) * 1000);
  }

  private filterEnvEnvAmount(velocity: number): number {
    return this.config.filterEnvAmount * velocity;
  }
}
