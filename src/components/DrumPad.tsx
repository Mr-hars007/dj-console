import React, { useState, useEffect, useCallback } from 'react';
import { AudioEngine } from '../audio/AudioEngine';

interface DrumPadDef {
  id: string;
  name: string;
  desc: string;
  type: 'kick' | 'snare' | 'hihat' | 'perc';
  hotkey: string;
}

const PADS: DrumPadDef[] = [
  { id: 'kick', name: 'KICK 808', desc: 'Sub Sweep', type: 'kick', hotkey: '1' },
  { id: 'snare', name: 'SNARE', desc: 'Crack & Body', type: 'snare', hotkey: '2' },
  { id: 'rim', name: 'RIMSHOT', desc: 'Resonant Ping', type: 'perc', hotkey: '3' },
  { id: 'clap', name: 'CLAP', desc: 'Noise Burst', type: 'snare', hotkey: '4' },
  { id: 'ch', name: 'CLOSED HAT', desc: 'Tight Metal', type: 'hihat', hotkey: 'q' },
  { id: 'oh', name: 'OPEN HAT', desc: 'Sizzle Decay', type: 'hihat', hotkey: 'w' },
  { id: 'tom1', name: 'LOW TOM', desc: 'Pitched Sweep', type: 'kick', hotkey: 'e' },
  { id: 'tom2', name: 'HIGH TOM', desc: 'Mid Sweep', type: 'perc', hotkey: 'r' },
  { id: 'ride', name: 'RIDE CYM', desc: 'High Ping', type: 'hihat', hotkey: 'a' },
  { id: 'crash', name: 'CRASH', desc: 'Explosion', type: 'hihat', hotkey: 's' },
  { id: 'wood', name: 'WOODBLOCK', desc: 'Tuned Click', type: 'perc', hotkey: 'd' },
  { id: 'shaker', name: 'SHAKER', desc: 'Air Shimmer', type: 'hihat', hotkey: 'f' },
];

export const DrumPad: React.FC = () => {
  const [activePad, setActivePad] = useState<string | null>(null);

  const hitPad = useCallback((pad: DrumPadDef) => {
    const engine = AudioEngine.getInstance();
    if (!engine.isInitialized) {
      engine.initialize();
    }

    engine.triggerDrum(pad.type, 0.9);

    setActivePad(pad.id);
    setTimeout(() => {
      setActivePad((prev) => (prev === pad.id ? null : prev));
    }, 140);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      const matched = PADS.find((p) => p.hotkey === k);
      if (matched) {
        hitPad(matched);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hitPad]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
        <span className="font-semibold uppercase tracking-wider">
          12-PAD DRUM MPC CONSOLE (1-4, Q-R, A-F Keys)
        </span>
        <span className="text-[10px] text-neutral-500">
          Pure Algorithmic Percussion Physics
        </span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
        {PADS.map((pad) => {
          const isActive = activePad === pad.id;
          return (
            <button
              key={pad.id}
              onClick={() => hitPad(pad)}
              className={`h-20 rounded-xl border flex flex-col justify-between p-2.5 font-mono text-left select-none transition-all active:scale-95 ${
                isActive
                  ? 'bg-neutral-200 border-white text-black shadow-lg shadow-white/10 scale-98'
                  : 'bg-[#15161f] border-[#252735] text-neutral-300 hover:border-neutral-500 hover:bg-[#1a1c26]'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] font-bold tracking-tight uppercase">
                  {pad.name}
                </span>
                <span className="w-4 h-4 rounded bg-[#0b0c10] border border-[#232532] text-[9px] flex items-center justify-center font-bold text-neutral-400">
                  {pad.hotkey}
                </span>
              </div>
              <div className="text-[9px] text-neutral-500">
                {pad.desc}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
