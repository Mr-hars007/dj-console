import { NOTE_NAMES, midiToNote } from './synthPhysics';

export interface MusicalScale {
  id: string;
  name: string;
  intervals: number[]; // semitone intervals from root
  description: string;
}

export const MUSICAL_SCALES: MusicalScale[] = [
  {
    id: 'minor_pentatonic',
    name: 'Minor Pentatonic',
    intervals: [0, 3, 5, 7, 10],
    description: 'Dark, bluesy, versatile synthwave staple',
  },
  {
    id: 'cyber_insen',
    name: 'Cyber Insen (Japanese)',
    intervals: [0, 1, 5, 7, 10],
    description: 'Exotic, dystopian, cyberpunk blade-runner feel',
  },
  {
    id: 'dorian',
    name: 'Dorian Mode',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    description: 'Sci-fi, neo-noir, introspective and mysterious',
  },
  {
    id: 'phrygian',
    name: 'Phrygian Mode',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    description: 'Tense, ominous, brooding basslines',
  },
  {
    id: 'harmonic_minor',
    name: 'Harmonic Minor',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    description: 'Dramatic, neoclassical, dark energy',
  },
  {
    id: 'cyber_blues',
    name: 'Cyber Blues',
    intervals: [0, 3, 5, 6, 7, 10],
    description: 'Gritty, driving, electronic rock & synth grit',
  },
  {
    id: 'major_pentatonic',
    name: 'Major Pentatonic',
    intervals: [0, 2, 4, 7, 9],
    description: 'Bright, celestial, uplifting cosmic ambient',
  },
];

/**
 * Get all valid MIDI note numbers for a given root note, scale, and octave range.
 */
export function getScaleNotes(rootNote: string, scaleId: string, minOctave: number = 2, maxOctave: number = 5): string[] {
  const scale = MUSICAL_SCALES.find((s) => s.id === scaleId) || MUSICAL_SCALES[0];
  const rootIndex = NOTE_NAMES.indexOf(rootNote as any);
  if (rootIndex === -1) return ['C3', 'D#3', 'F3', 'G3', 'A#3'];

  const notes: string[] = [];
  for (let octave = minOctave; octave <= maxOctave; octave++) {
    const rootMidi = (octave + 1) * 12 + rootIndex;
    for (const interval of scale.intervals) {
      const midi = rootMidi + interval;
      notes.push(midiToNote(midi));
    }
  }
  return notes;
}

/**
 * Quantize any arbitrary MIDI note to the closest note in the scale.
 */
export function quantizeToScale(midiNote: number, rootNote: string, scaleId: string): number {
  const scale = MUSICAL_SCALES.find((s) => s.id === scaleId) || MUSICAL_SCALES[0];
  const rootIndex = NOTE_NAMES.indexOf(rootNote as any);
  if (rootIndex === -1) return midiNote;

  const noteClass = midiNote % 12;
  const octave = Math.floor(midiNote / 12);
  const relativeSemitone = (noteClass - rootIndex + 12) % 12;

  // Find closest interval
  let closestInterval = scale.intervals[0];
  let minDiff = 999;
  for (const interval of scale.intervals) {
    const diff = Math.abs(relativeSemitone - interval);
    if (diff < minDiff) {
      minDiff = diff;
      closestInterval = interval;
    }
  }

  return octave * 12 + rootIndex + closestInterval;
}
