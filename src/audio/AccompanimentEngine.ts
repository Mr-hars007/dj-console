import type { ProceduralDrums } from './ProceduralDrums';
import { midiToFreq, NOTE_NAMES } from './synthPhysics';

export type AccompanimentStyle = 'chill' | 'groove' | 'synthwave' | 'acoustic' | 'off';

export interface ChordInfo {
  root: string;
  type: string; // 'maj', 'min', '7', 'sus'
  name: string;
}

export class AccompanimentEngine {
  public enabled: boolean = true;
  public style: AccompanimentStyle = 'groove';
  public intensity: number = 0.6; // 0 to 1
  public bpm: number = 110;

  // Realtime inferred state
  public detectedChord: ChordInfo = { root: 'E', type: 'min', name: 'Em' };
  public userEnergy: number = 0.5; // decays over time, boosted by user playing

  private ctx: AudioContext;
  private drums: ProceduralDrums;
  private synthDestination: AudioNode;

  // Internal rhythm clock
  public isRunning: boolean = false;

  private step: number = 0;
  private timerId: number | null = null;
  private lookaheadMs: number = 30;
  private nextBeatTime: number = 0;

  // History of recently played user notes for harmonic analysis
  private recentMidiNotes: number[] = [40, 43, 47]; // default Em

  constructor(ctx: AudioContext, drums: ProceduralDrums, synthDestination: AudioNode) {
    this.ctx = ctx;
    this.drums = drums;
    this.synthDestination = synthDestination;
  }

  /**
   * Called whenever user plays a note on keyboard, guitar, or drums.
   */
  public registerUserNote(midiNote: number, velocity: number = 0.8) {
    this.recentMidiNotes.push(midiNote);
    if (this.recentMidiNotes.length > 8) {
      this.recentMidiNotes.shift();
    }

    // Boost energy
    this.userEnergy = Math.min(1.0, this.userEnergy + 0.18 * velocity);

    // Re-analyze chord / root
    this.analyzeHarmony();

    // Auto start accompaniment if not running and style is not 'off'
    if (!this.isRunning && this.enabled && this.style !== 'off') {
      this.start();
    }
  }

  public registerUserDrumHit() {
    this.userEnergy = Math.min(1.0, this.userEnergy + 0.15);
    if (!this.isRunning && this.enabled && this.style !== 'off') {
      this.start();
    }
  }

  private analyzeHarmony() {
    if (this.recentMidiNotes.length === 0) return;
    const lastNote = this.recentMidiNotes[this.recentMidiNotes.length - 1];
    const rootIndex = lastNote % 12;
    const rootName = NOTE_NAMES[rootIndex];

    // Check intervals against other recent notes
    let hasMinorThird = false;
    let hasMajorThird = false;

    for (const note of this.recentMidiNotes) {
      const interval = (note - lastNote + 120) % 12;
      if (interval === 3) hasMinorThird = true;
      if (interval === 4) hasMajorThird = true;
    }

    const isMinor = hasMinorThird || (!hasMajorThird && [0, 2, 4, 9, 11].includes(rootIndex));
    this.detectedChord = {
      root: rootName,
      type: isMinor ? 'min' : 'maj',
      name: `${rootName}${isMinor ? 'm' : ''}`,
    };
  }

  public start() {
    if (this.isRunning || this.style === 'off' || !this.enabled) return;
    this.isRunning = true;
    this.step = 0;
    this.nextBeatTime = this.ctx.currentTime + 0.05;
    this.runScheduler();
  }

  public stop() {
    this.isRunning = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private runScheduler() {
    this.timerId = window.setInterval(() => {
      if (!this.isRunning) return;

      // Natural energy decay
      this.userEnergy = Math.max(0.15, this.userEnergy * 0.985);

      const secondsPer16th = 60.0 / this.bpm / 4;
      while (this.nextBeatTime < this.ctx.currentTime + 0.1) {
        this.scheduleAccompanimentStep(this.step, this.nextBeatTime);
        this.nextBeatTime += secondsPer16th;
        this.step = (this.step + 1) % 16;
      }
    }, this.lookaheadMs);
  }

  private scheduleAccompanimentStep(step: number, time: number) {
    if (this.style === 'off' || !this.enabled) return;

    const dynamicVol = this.intensity * (0.4 + this.userEnergy * 0.6);
    const rootMidi = 36 + NOTE_NAMES.indexOf(this.detectedChord.root as any); // Octave 1-2 bass
    const isMinor = this.detectedChord.type === 'min';

    // 1. Algorithmic Drums
    if (this.style === 'groove') {
      // Kick on 0, 8, and dynamic syncopation on 6/14
      if (step === 0 || step === 8 || (step === 10 && this.userEnergy > 0.5)) {
        this.drums.triggerKick(time, 0.85 * dynamicVol);
      }
      // Snare on 4, 12
      if (step === 4 || step === 12) {
        this.drums.triggerSnare(time, 0.75 * dynamicVol);
      }
      // Hi-Hats on 8th notes
      if (step % 2 === 0) {
        this.drums.triggerHiHat(time, 0.5 * dynamicVol, step === 14 && Math.random() > 0.5);
      }
      // Percussion ghost notes on energetic moments
      if ((step === 7 || step === 15) && this.userEnergy > 0.6) {
        this.drums.triggerPerc(time, 0.45 * dynamicVol);
      }
    } else if (this.style === 'synthwave') {
      // Four-on-the-floor Kick
      if (step % 4 === 0) {
        this.drums.triggerKick(time, 0.9 * dynamicVol);
      }
      // Backbeat Snare
      if (step === 4 || step === 12) {
        this.drums.triggerSnare(time, 0.85 * dynamicVol);
      }
      // 16th note running hats
      this.drums.triggerHiHat(time, (step % 2 === 0 ? 0.6 : 0.35) * dynamicVol, false);
    } else if (this.style === 'chill') {
      if (step === 0 || (step === 10 && this.userEnergy > 0.4)) {
        this.drums.triggerKick(time, 0.65 * dynamicVol);
      }
      if (step === 4 || step === 12) {
        this.drums.triggerPerc(time, 0.6 * dynamicVol); // soft rimshot instead of loud snare
      }
      if (step % 4 === 2) {
        this.drums.triggerHiHat(time, 0.35 * dynamicVol, false);
      }
    } else if (this.style === 'acoustic') {
      if (step === 0) this.drums.triggerKick(time, 0.6 * dynamicVol);
      if (step === 8) this.drums.triggerPerc(time, 0.5 * dynamicVol);
    }

    // 2. Algorithmic Bassline (Follows user's chord root)
    if (this.style === 'synthwave') {
      // Rolling 8th-note or 16th-note octave bassline
      if (step % 2 === 0) {
        const octaveShift = step % 4 === 2 ? 12 : 0;
        this.playAccompanimentTone(rootMidi + octaveShift, 0.15, time, 0.7 * dynamicVol, 'sawtooth');
      }
    } else if (this.style === 'groove') {
      // Funk syncopated groove: Root on 0, Fifth on 6, Octave on 10, Minor/Major third on 14
      if (step === 0) {
        this.playAccompanimentTone(rootMidi, 0.25, time, 0.8 * dynamicVol, 'triangle');
      } else if (step === 6) {
        this.playAccompanimentTone(rootMidi + 7, 0.18, time, 0.65 * dynamicVol, 'triangle'); // 5th
      } else if (step === 10) {
        this.playAccompanimentTone(rootMidi + 12, 0.2, time, 0.7 * dynamicVol, 'triangle'); // Octave
      } else if (step === 14 && this.userEnergy > 0.4) {
        const third = isMinor ? 3 : 4;
        this.playAccompanimentTone(rootMidi + third, 0.15, time, 0.6 * dynamicVol, 'triangle');
      }
    } else if (this.style === 'chill') {
      // Long warm sustained root bass on bar starts
      if (step === 0) {
        this.playAccompanimentTone(rootMidi, 0.8, time, 0.6 * dynamicVol, 'sine');
      } else if (step === 8 && this.userEnergy > 0.5) {
        this.playAccompanimentTone(rootMidi + 7, 0.6, time, 0.5 * dynamicVol, 'sine');
      }
    }

    // 3. Algorithmic Ambient Chord Swell (Every bar start)
    if (step === 0 && (this.style === 'chill' || this.style === 'groove')) {
      const third = isMinor ? 3 : 4;
      const fifth = 7;
      const padMidi1 = rootMidi + 24; // Octave 4
      const padMidi2 = padMidi1 + third;
      const padMidi3 = padMidi1 + fifth;

      this.playAccompanimentTone(padMidi1, 1.8, time, 0.35 * dynamicVol, 'sine');
      this.playAccompanimentTone(padMidi2, 1.8, time, 0.3 * dynamicVol, 'sine');
      this.playAccompanimentTone(padMidi3, 1.8, time, 0.3 * dynamicVol, 'sine');
    }
  }

  private playAccompanimentTone(
    midi: number,
    duration: number,
    time: number,
    gainLevel: number,
    waveType: OscillatorType = 'triangle'
  ) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = waveType;
    osc.frequency.setValueAtTime(midiToFreq(midi), time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(gainLevel * 0.4, time + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.synthDestination);

    osc.start(time);
    osc.stop(time + duration + 0.05);
  }
}
