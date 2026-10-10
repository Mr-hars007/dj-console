import React, { useState, useEffect, useCallback } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface KeyDef {
  midi: number;
  note: string;
  isBlack: boolean;
  hotkey?: string;
}

export const Keyboard: React.FC = () => {
  const [octaveOffset, setOctaveOffset] = useState<number>(3); // Default C3
  const [activeMidis, setActiveMidis] = useState<Set<number>>(new Set());

  // 2 Octaves layout
  const KEY_MAPPINGS: { noteOffset: number; isBlack: boolean; hotkey?: string; noteBase: string }[] = [
    { noteOffset: 0, isBlack: false, hotkey: 'a', noteBase: 'C' },
    { noteOffset: 1, isBlack: true, hotkey: 'w', noteBase: 'C#' },
    { noteOffset: 2, isBlack: false, hotkey: 's', noteBase: 'D' },
    { noteOffset: 3, isBlack: true, hotkey: 'e', noteBase: 'D#' },
    { noteOffset: 4, isBlack: false, hotkey: 'd', noteBase: 'E' },
    { noteOffset: 5, isBlack: false, hotkey: 'f', noteBase: 'F' },
    { noteOffset: 6, isBlack: true, hotkey: 't', noteBase: 'F#' },
    { noteOffset: 7, isBlack: false, hotkey: 'g', noteBase: 'G' },
    { noteOffset: 8, isBlack: true, hotkey: 'y', noteBase: 'G#' },
    { noteOffset: 9, isBlack: false, hotkey: 'h', noteBase: 'A' },
    { noteOffset: 10, isBlack: true, hotkey: 'u', noteBase: 'A#' },
    { noteOffset: 11, isBlack: false, hotkey: 'j', noteBase: 'B' },

    { noteOffset: 12, isBlack: false, hotkey: 'k', noteBase: 'C' },
    { noteOffset: 13, isBlack: true, hotkey: 'o', noteBase: 'C#' },
    { noteOffset: 14, isBlack: false, hotkey: 'l', noteBase: 'D' },
    { noteOffset: 15, isBlack: true, hotkey: 'p', noteBase: 'D#' },
    { noteOffset: 16, isBlack: false, hotkey: ';', noteBase: 'E' },
    { noteOffset: 17, isBlack: false, hotkey: "'", noteBase: 'F' },
    { noteOffset: 18, isBlack: true, noteBase: 'F#' },
    { noteOffset: 19, isBlack: false, noteBase: 'G' },
    { noteOffset: 20, isBlack: true, noteBase: 'G#' },
    { noteOffset: 21, isBlack: false, noteBase: 'A' },
    { noteOffset: 22, isBlack: true, noteBase: 'A#' },
    { noteOffset: 23, isBlack: false, noteBase: 'B' },
    { noteOffset: 24, isBlack: false, noteBase: 'C' },
  ];

  const keys: KeyDef[] = KEY_MAPPINGS.map((k) => {
    const midi = (octaveOffset + 1) * 12 + k.noteOffset;
    const currentOct = Math.floor(midi / 12) - 1;
    return {
      midi,
      note: `${k.noteBase}${currentOct}`,
      isBlack: k.isBlack,
      hotkey: k.hotkey,
    };
  });

  const handleNoteStart = useCallback((midi: number) => {
    const engine = AudioEngine.getInstance();
    if (!engine.isInitialized) {
      engine.initialize().then(() => engine.noteOn(midi));
    } else {
      engine.noteOn(midi);
    }
    setActiveMidis((prev) => new Set(prev).add(midi));
  }, []);

  const handleNoteEnd = useCallback((midi: number) => {
    const engine = AudioEngine.getInstance();
    engine.noteOff(midi);
    setActiveMidis((prev) => {
      const next = new Set(prev);
      next.delete(midi);
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const keyChar = e.key.toLowerCase();
      const matched = keys.find((k) => k.hotkey === keyChar);
      if (matched && !activeMidis.has(matched.midi)) {
        handleNoteStart(matched.midi);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const keyChar = e.key.toLowerCase();
      const matched = keys.find((k) => k.hotkey === keyChar);
      if (matched) {
        handleNoteEnd(matched.midi);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [keys, activeMidis, handleNoteStart, handleNoteEnd]);

  const whiteKeys = keys.filter((k) => !k.isBlack);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
        <span className="font-semibold uppercase tracking-wider">
          TACTILE SYNTH KEYBOARD (A-L / W-P Keys)
        </span>

        {/* Octave Shift */}
        <div className="flex items-center gap-1.5 bg-[#0e0f14] px-2 py-0.5 rounded-lg border border-[#232532]">
          <span className="text-[10px] text-neutral-500 uppercase">Octave</span>
          <button
            onClick={() => setOctaveOffset((o) => Math.max(1, o - 1))}
            className="p-0.5 hover:bg-neutral-800 rounded text-neutral-300"
            title="Octave Down"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-mono font-bold text-neutral-200 w-4 text-center">
            {octaveOffset}
          </span>
          <button
            onClick={() => setOctaveOffset((o) => Math.min(6, o + 1))}
            className="p-0.5 hover:bg-neutral-800 rounded text-neutral-300"
            title="Octave Up"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Piano Keys Matrix */}
      <div className="relative flex justify-center h-36 select-none overflow-x-auto pb-1">
        <div className="relative flex">
          {whiteKeys.map((wKey) => {
            const isPressed = activeMidis.has(wKey.midi);
            return (
              <div
                key={wKey.midi}
                onMouseDown={() => handleNoteStart(wKey.midi)}
                onMouseUp={() => handleNoteEnd(wKey.midi)}
                onMouseLeave={() => {
                  if (activeMidis.has(wKey.midi)) handleNoteEnd(wKey.midi);
                }}
                className={`relative w-8 sm:w-10 h-full rounded-b-lg border cursor-pointer flex flex-col justify-end items-center pb-2 transition-all ${
                  isPressed
                    ? 'bg-neutral-100 border-white text-black shadow-md shadow-white/20'
                    : 'bg-[#181922] border-[#292b3a] hover:bg-[#20222e] text-neutral-400'
                }`}
              >
                {wKey.hotkey && (
                  <span className="text-[9px] font-mono font-bold uppercase opacity-60">
                    {wKey.hotkey}
                  </span>
                )}
                <span className="text-[8px] font-mono font-semibold opacity-75">
                  {wKey.note}
                </span>
              </div>
            );
          })}

          {/* Black Keys */}
          {keys
            .filter((k) => k.isBlack)
            .map((bKey) => {
              const semitoneFromStart = bKey.midi - keys[0].midi;
              const whiteKeyWidth = 40; // sm:w-10
              const whiteIndexMapping = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6, 7, 7, 8, 8, 9, 10, 10, 11, 11, 12, 12, 13, 14];
              const wIdx = whiteIndexMapping[semitoneFromStart] ?? 0;
              const leftPx = (wIdx + 1) * whiteKeyWidth - 14;

              const isPressed = activeMidis.has(bKey.midi);

              return (
                <div
                  key={bKey.midi}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleNoteStart(bKey.midi);
                  }}
                  onMouseUp={(e) => {
                    e.stopPropagation();
                    handleNoteEnd(bKey.midi);
                  }}
                  onMouseLeave={() => {
                    if (activeMidis.has(bKey.midi)) handleNoteEnd(bKey.midi);
                  }}
                  style={{ left: `${leftPx}px` }}
                  className={`absolute top-0 w-7 h-20 rounded-b-md border cursor-pointer z-10 flex flex-col justify-end items-center pb-1 transition-all ${
                    isPressed
                      ? 'bg-amber-400 border-amber-300 text-black shadow-md shadow-amber-400/40'
                      : 'bg-[#0b0c10] border-[#1d1f2b] hover:bg-[#14151e] text-neutral-400'
                  }`}
                >
                  {bKey.hotkey && (
                    <span className="text-[8px] font-mono font-bold uppercase opacity-80">
                      {bKey.hotkey}
                    </span>
                  )}
                  <span className="text-[7px] font-mono opacity-60">
                    {bKey.note}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
