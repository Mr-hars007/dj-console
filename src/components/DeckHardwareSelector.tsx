import React from 'react';

interface DeckHardwareSelectorProps {
  activeDeck: 'A' | 'B';
  onSelectDeck: (deck: 'A' | 'B') => void;
  colorA: string;
  colorB: string;
  className?: string;
  compact?: boolean;
  isPoweredOn?: boolean;
}

/**
 * Flagship DJ Hardware Deck Selector Module
 * Emulates the tactile, precision-machined mechanical layer/deck switches
 * found on flagship club mixers and media players.
 */
export const DeckHardwareSelector: React.FC<DeckHardwareSelectorProps> = ({
  activeDeck,
  onSelectDeck,
  colorA,
  colorB,
  className = '',
  compact = false,
  isPoweredOn = true,
}) => {
  const isDeckAActive = isPoweredOn && activeDeck === 'A';
  const isDeckBActive = isPoweredOn && activeDeck === 'B';

  return (
    <div
      className={`relative inline-flex items-center rounded-lg bg-[#080910] border border-[#222436] p-0.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.85),0_1px_1px_rgba(255,255,255,0.06)] ${className}`}
      role="group"
      aria-label="Deck Layer Selector"
    >
      {/* DECK A Tactile Hardware Button */}
      <button
        type="button"
        onClick={() => onSelectDeck('A')}
        className={`group relative flex items-center justify-center gap-1.5 rounded-md font-mono font-black transition-all cursor-pointer select-none active:scale-[0.97] ${
          compact ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[9.5px]'
        } ${
          isDeckAActive
            ? 'bg-gradient-to-b from-[#1e2132] to-[#12131f] text-white border border-[#343852] shadow-[inset_0_1px_2px_rgba(255,255,255,0.12),0_2px_6px_rgba(0,0,0,0.7)]'
            : 'bg-gradient-to-b from-[#11121c] to-[#0a0b12] text-neutral-400 hover:text-neutral-200 border border-transparent hover:border-[#222538]'
        }`}
        style={{
          boxShadow: isDeckAActive ? `inset 0 1px 2px rgba(255,255,255,0.12), 0 0 12px ${colorA}30` : undefined,
        }}
        title="Hardware Layer: Select Deck A (Channel 1)"
      >
        {/* Precision Optical LED Pilot Jewel */}
        <span
          className={`w-1.5 h-1.5 rounded-full transition-all shrink-0 ${
            isDeckAActive ? 'scale-100 ring-1 ring-white/50' : 'scale-90 opacity-20 bg-[#1e2030]'
          }`}
          style={{
            backgroundColor: isDeckAActive ? colorA : '#202334',
            boxShadow: isDeckAActive
              ? `0 0 6px ${colorA}, 0 0 10px ${colorA}90`
              : 'inset 0 1px 1px rgba(0,0,0,0.8)',
          }}
        />
        <span className="tracking-widest uppercase">
          DECK{' '}
          <span
            className="transition-colors"
            style={{
              color: isDeckAActive ? colorA : '#64748b',
              textShadow: isDeckAActive ? `0 0 8px ${colorA}80` : undefined,
            }}
          >
            A
          </span>
        </span>
      </button>

      {/* Recessed Machined Metal Divider Notch */}
      <div className="w-[1px] h-3.5 bg-[#1c1f30] mx-0.5 shrink-0 shadow-[0_0_1px_rgba(0,0,0,0.8)]" />

      {/* DECK B Tactile Hardware Button */}
      <button
        type="button"
        onClick={() => onSelectDeck('B')}
        className={`group relative flex items-center justify-center gap-1.5 rounded-md font-mono font-black transition-all cursor-pointer select-none active:scale-[0.97] ${
          compact ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[9.5px]'
        } ${
          isDeckBActive
            ? 'bg-gradient-to-b from-[#1e2132] to-[#12131f] text-white border border-[#343852] shadow-[inset_0_1px_2px_rgba(255,255,255,0.12),0_2px_6px_rgba(0,0,0,0.7)]'
            : 'bg-gradient-to-b from-[#11121c] to-[#0a0b12] text-neutral-400 hover:text-neutral-200 border border-transparent hover:border-[#222538]'
        }`}
        style={{
          boxShadow: isDeckBActive ? `inset 0 1px 2px rgba(255,255,255,0.12), 0 0 12px ${colorB}30` : undefined,
        }}
        title="Hardware Layer: Select Deck B (Channel 2)"
      >
        {/* Precision Optical LED Pilot Jewel */}
        <span
          className={`w-1.5 h-1.5 rounded-full transition-all shrink-0 ${
            isDeckBActive ? 'scale-100 ring-1 ring-white/50' : 'scale-90 opacity-20 bg-[#1e2030]'
          }`}
          style={{
            backgroundColor: isDeckBActive ? colorB : '#202334',
            boxShadow: isDeckBActive
              ? `0 0 6px ${colorB}, 0 0 10px ${colorB}90`
              : 'inset 0 1px 1px rgba(0,0,0,0.8)',
          }}
        />
        <span className="tracking-widest uppercase">
          DECK{' '}
          <span
            className="transition-colors"
            style={{
              color: isDeckBActive ? colorB : '#64748b',
              textShadow: isDeckBActive ? `0 0 8px ${colorB}80` : undefined,
            }}
          >
            B
          </span>
        </span>
      </button>
    </div>
  );
};
