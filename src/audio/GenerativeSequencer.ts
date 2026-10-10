import type { SequencerTrack } from './types';

import { generateEuclideanRhythm } from './synthPhysics';
import { getScaleNotes } from './scales';

export class GenerativeSequencer {
  public tracks: SequencerTrack[] = [];
  public bpm: number = 120;
  public isPlaying: boolean = false;
  public currentStep: number = 0;

  private ctx: AudioContext;
  private onStepCallback: ((step: number) => void) | null = null;
  private onTriggerTrack: ((track: SequencerTrack, step: number, time: number) => void) | null = null;

  // Web Audio lookahead scheduling
  private lookaheadMs: number = 25;
  private scheduleAheadSec: number = 0.1;
  private nextStepTime: number = 0;
  private timerId: number | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.initDefaultTracks();
  }

  private initDefaultTracks() {
    this.tracks = [
      {
        id: 'kick',
        name: 'Kick (Algo)',
        type: 'kick',
        steps: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
        velocities: new Array(16).fill(0.9),
        muted: false,
      },
      {
        id: 'snare',
        name: 'Snare (Algo)',
        type: 'snare',
        steps: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
        velocities: new Array(16).fill(0.85),
        muted: false,
      },
      {
        id: 'hihat',
        name: 'Hi-Hat (Algo)',
        type: 'hihat',
        steps: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
        velocities: new Array(16).fill(0.6),
        muted: false,
      },
      {
        id: 'perc',
        name: 'Perc / Rim (Algo)',
        type: 'perc',
        steps: [false, false, false, true, false, false, true, false, false, false, false, true, false, true, false, false],
        velocities: new Array(16).fill(0.7),
        muted: false,
      },
      {
        id: 'lead',
        name: 'Synth Lead (Algo)',
        type: 'synthLead',
        steps: [true, false, true, false, false, true, false, true, true, false, false, true, false, true, false, true],
        notes: ['D4', 'F4', 'G4', 'A4', 'C5', 'A4', 'G4', 'F4', 'D4', 'D4', 'F4', 'G4', 'A4', 'C5', 'D5', 'A4'],
        velocities: new Array(16).fill(0.75),
        muted: false,
      },
      {
        id: 'bass',
        name: 'Synth Bass (Algo)',
        type: 'synthBass',
        steps: [true, false, false, true, true, false, false, false, true, false, true, false, true, false, false, false],
        notes: ['D2', 'D2', 'D2', 'F2', 'D2', 'D2', 'G2', 'G2', 'D2', 'D2', 'C2', 'C2', 'D2', 'D2', 'A1', 'A1'],
        velocities: new Array(16).fill(0.85),
        muted: false,
      },
    ];
  }

  public setCallbacks(
    onStep: (step: number) => void,
    onTrigger: (track: SequencerTrack, step: number, time: number) => void
  ) {
    this.onStepCallback = onStep;
    this.onTriggerTrack = onTrigger;
  }

  public start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.currentStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.scheduleLoop();
  }

  public stop() {
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.currentStep = 0;
    if (this.onStepCallback) this.onStepCallback(0);
  }

  private scheduleLoop() {
    this.timerId = window.setInterval(() => {
      if (!this.isPlaying) return;

      const secondsPerBeat = 60.0 / this.bpm;
      const secondsPer16th = secondsPerBeat / 4;

      while (this.nextStepTime < this.ctx.currentTime + this.scheduleAheadSec) {
        this.scheduleStep(this.currentStep, this.nextStepTime);

        // Advance step
        this.nextStepTime += secondsPer16th;
        this.currentStep = (this.currentStep + 1) % 16;
      }
    }, this.lookaheadMs);
  }

  private scheduleStep(step: number, time: number) {
    // Notify UI (draw cursor) slightly before audio hits
    const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
    setTimeout(() => {
      if (this.isPlaying && this.onStepCallback) {
        this.onStepCallback(step);
      }
    }, delayMs);

    // Schedule audio for all tracks at exact Web Audio timestamp
    for (const track of this.tracks) {
      if (!track.muted && track.steps[step]) {
        if (this.onTriggerTrack) {
          this.onTriggerTrack(track, step, time);
        }
      }
    }
  }

  /**
   * Pure Algorithmic Mutation & Music Generation:
   * 1. Uses Euclidean rhythms to distribute drum hits mathematically.
   * 2. Uses stochastic scale quantization to write novel melodic and bass lines.
   */
  public mutateAll(scaleId: string = 'cyber_insen', rootNote: string = 'D') {
    const leadNotesPool = getScaleNotes(rootNote, scaleId, 3, 5);
    const bassNotesPool = getScaleNotes(rootNote, scaleId, 1, 2);

    for (const track of this.tracks) {
      if (track.type === 'kick') {
        // Euclidean 4 or 5 pulses in 16 steps
        const pulses = Math.random() > 0.5 ? 4 : 5;
        track.steps = generateEuclideanRhythm(pulses, 16);
      } else if (track.type === 'snare') {
        // Standard backbeat with occasional syncopation
        track.steps = [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, Math.random() > 0.6];
      } else if (track.type === 'hihat') {
        // Euclidean 8, 10, or 12 pulses
        const pulses = [8, 10, 12, 14][Math.floor(Math.random() * 4)];
        track.steps = generateEuclideanRhythm(pulses, 16);
      } else if (track.type === 'perc') {
        // Euclidean 3 or 5 pulses
        const pulses = [3, 5, 7][Math.floor(Math.random() * 3)];
        track.steps = generateEuclideanRhythm(pulses, 16);
      } else if (track.type === 'synthLead') {

        // Generate melodic contour (7 to 11 active steps)
        const density = 0.55 + Math.random() * 0.25;
        const newSteps: boolean[] = [];
        const newNotes: string[] = [];

        let currentIdx = Math.floor(Math.random() * leadNotesPool.length);

        for (let s = 0; s < 16; s++) {
          const active = Math.random() < density;
          newSteps.push(active);

          // Step-wise random walk (melodic Markov style)
          const stepDelta = Math.floor(Math.random() * 5) - 2; // -2, -1, 0, 1, 2
          currentIdx = Math.max(0, Math.min(leadNotesPool.length - 1, currentIdx + stepDelta));
          newNotes.push(leadNotesPool[currentIdx]);
        }
        track.steps = newSteps;
        track.notes = newNotes;
      } else if (track.type === 'synthBass') {
        // Bass groove (driving root with passing tones)
        const newSteps: boolean[] = [];
        const newNotes: string[] = [];
        const rootMidiNote = bassNotesPool[0] || `${rootNote}2`;

        for (let s = 0; s < 16; s++) {
          // Emphasize downbeats
          const active = s % 4 === 0 || Math.random() < 0.45;
          newSteps.push(active);

          if (Math.random() < 0.6) {
            newNotes.push(rootMidiNote);
          } else {
            const randomBass = bassNotesPool[Math.floor(Math.random() * Math.min(4, bassNotesPool.length))];
            newNotes.push(randomBass || rootMidiNote);
          }
        }
        track.steps = newSteps;
        track.notes = newNotes;
      }
    }
  }

  public toggleStep(trackId: string, stepIndex: number) {
    const track = this.tracks.find((t) => t.id === trackId);
    if (track && stepIndex >= 0 && stepIndex < 16) {
      track.steps[stepIndex] = !track.steps[stepIndex];
    }
  }

  public setTrackNote(trackId: string, stepIndex: number, note: string) {
    const track = this.tracks.find((t) => t.id === trackId);
    if (track && track.notes && stepIndex >= 0 && stepIndex < 16) {
      track.notes[stepIndex] = note;
    }
  }

  public toggleMute(trackId: string) {
    const track = this.tracks.find((t) => t.id === trackId);
    if (track) {
      track.muted = !track.muted;
    }
  }
}
