import React, { useState, useEffect, useCallback } from 'react';
import { AudioEngine } from '../audio/AudioEngine';

interface GuitarString {
  id: number;
  name: string;
  note: string;
  freq: number;
  pan: number;
  hotkey: string;
}

const STRINGS: GuitarString[] = [
  { id: 6, name: '6th (Low E)', note: 'E2', freq: 82.41, pan: -0.4, hotkey: '1' },
  { id: 5, name: '5th (A)', note: 'A2', freq: 110.0, pan: -0.25, hotkey: '2' },
  { id: 4, name: '4th (D)', note: 'D3', freq: 146.83, pan: -0.1, hotkey: '3' },
  { id: 3, name: '3rd (G)', note: 'G3', freq: 196.0, pan: 0.1, hotkey: '4' },
  { id: 2, name: '2nd (B)', note: 'B3', freq: 246.94, pan: 0.25, hotkey: '5' },
  { id: 1, name: '1st (High E)', note: 'E4', freq: 329.63, pan: 0.4, hotkey: '6' },
];

interface ChordPreset {
  name: string;
  key: string;
  // Multipliers for string frequencies: 2^(semitones/12)
  frets: number[]; // frets for strings 6 to 1 (-1 = mute)
}

const CHORDS: ChordPreset[] = [
  { name: 'E Minor', key: 'q', frets: [0, 2, 2, 0, 0, 0] },
  { name: 'A Minor', key: 'w', frets: [-1, 0, 2, 2, 1, 0] },
  { name: 'C Major', key: 'e', frets: [-1, 3, 2, 0, 1, 0] },
  { name: 'G Major', key: 'r', frets: [3, 2, 0, 0, 0, 3] },
  { name: 'D Major', key: 't', frets: [-1, -1, 0, 2, 3, 2] },
  { name: 'F Major', key: 'y', frets: [1, 3, 3, 2, 1, 1] },
  { name: 'D Minor', key: 'u', frets: [-1, -1, 0, 2, 3, 1] },
  { name: 'B Minor', key: 'i', frets: [-1, 2, 4, 4, 3, 2] },
];

export const GuitarView: React.FC = () => {
  const [activeStrings, setActiveStrings] = useState<Set<number>>(new Set());
  const [activeChord, setActiveChord] = useState<string | null>(null);

  const pluckSingleString = useCallback((stringDef: GuitarString, fret: number = 0, velocity: number = 0.85) => {
    const engine = AudioEngine.getInstance();
    if (!engine.isInitialized) {
      engine.initialize();
    }

    const freq = stringDef.freq * Math.pow(2, fret / 12);
    engine.pluckGuitar(freq, velocity, 0.989, 0.72, stringDef.pan);

    setActiveStrings((prev) => new Set(prev).add(stringDef.id));
    setTimeout(() => {
      setActiveStrings((prev) => {
        const next = new Set(prev);
        next.delete(stringDef.id);
        return next;
      });
    }, 180);
  }, []);

  const strumChord = useCallback((chord: ChordPreset, downstroke: boolean = true) => {
    setActiveChord(chord.name);
    setTimeout(() => setActiveChord(null), 250);

    const orderedStrings = downstroke ? [...STRINGS] : [...STRINGS].reverse();
    orderedStrings.forEach((s, idx) => {
      const fretIndex = 6 - s.id; // string 6 is index 0
      const fret = chord.frets[fretIndex];
      if (fret !== -1) {
        setTimeout(() => {
          pluckSingleString(s, fret, 0.82 + Math.random() * 0.1);
        }, idx * 18); // 18ms acoustic strum delay
      }
    });
  }, [pluckSingleString]);

  // Keyboard hotkeys for strings (1-6) and chords (Q-I)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();

      // Check string hotkey 1-6
      const matchedString = STRINGS.find((s) => s.hotkey === k);
      if (matchedString) {
        pluckSingleString(matchedString, 0, 0.9);
        return;
      }

      // Check chord hotkey
      const matchedChord = CHORDS.find((c) => c.key === k);
      if (matchedChord) {
        strumChord(matchedChord, true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pluckSingleString, strumChord]);

  return (
    <div className="space-y-4">
      {/* Chord Strumming Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">
            One-Touch Acoustic Chord Strummer (Q-I Keys)
          </span>
          <span className="text-[10px] font-mono text-neutral-500">
            Algorithmic Physical String Modeling
          </span>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {CHORDS.map((chord) => {
            const isActive = activeChord === chord.name;
            return (
              <button
                key={chord.name}
                onClick={() => strumChord(chord, true)}
                className={`py-3 px-2 rounded-lg border text-center font-mono transition-all select-none active:scale-95 ${
                  isActive
                    ? 'bg-neutral-200 border-white text-black shadow-lg shadow-white/10 scale-98'
                    : 'bg-[#181920] border-[#262833] text-neutral-200 hover:border-neutral-500 hover:bg-[#20212a]'
                }`}
              >
                <div className="text-xs font-bold">{chord.name}</div>
                <div className="text-[9px] text-neutral-500 uppercase mt-0.5">[{chord.key}]</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 6-String Pluckboard */}
      <div className="rounded-xl border border-[#22242e] bg-[#121319] p-4 space-y-3">
        <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
          <span>6-STRING GUITAR PLUCK BOARD (1-6 Keys or Click / Drag)</span>
          <span className="text-[10px] text-neutral-500">Pure Karplus-Strong Acoustics</span>
        </div>

        <div className="space-y-2.5 py-1">
          {STRINGS.map((str) => {
            const isVibrating = activeStrings.has(str.id);
            // String gauges: lower pitch is thicker
            const stringThickness = [1.5, 2.0, 2.5, 3.2, 4.0, 5.0][str.id - 1];

            return (
              <div
                key={str.id}
                onClick={() => pluckSingleString(str, 0, 0.9)}
                onMouseEnter={(e) => {
                  if (e.buttons === 1) pluckSingleString(str, 0, 0.85);
                }}
                className="group relative flex items-center h-9 px-3 rounded-lg bg-[#181922] hover:bg-[#1f202c] border border-[#262835] cursor-pointer transition-colors"
                title={`Click or press [${str.hotkey}] to pluck`}
              >
                {/* String Label */}
                <div className="w-24 flex items-center gap-1.5 font-mono text-[11px] text-neutral-300">
                  <span className="w-4 h-4 rounded bg-[#0d0e13] border border-[#2c2e3c] flex items-center justify-center text-[10px] text-neutral-400 font-bold">
                    {str.hotkey}
                  </span>
                  <span>{str.note}</span>
                </div>

                {/* Physical Vibrating String Graphic */}
                <div className="flex-1 relative flex items-center h-full mx-2">
                  <div
                    className={`w-full rounded-full transition-all duration-75 ${
                      isVibrating
                        ? 'bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.8)] scale-y-125'
                        : 'bg-neutral-600 group-hover:bg-neutral-400'
                    }`}
                    style={{
                      height: `${stringThickness}px`,
                      transform: isVibrating ? 'scaleY(1.4)' : 'none',
                    }}
                  />
                </div>

                {/* Frequency & Pluck Button */}
                <div className="text-[10px] font-mono text-neutral-500 group-hover:text-amber-400">
                  {Math.round(str.freq)} Hz
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
