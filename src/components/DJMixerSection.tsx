import React, { useState, useEffect } from 'react';
import { DJMixer } from '../dj/DJMixer';
import { Knob } from './Knob';
import { DJHardwareFader } from './DJHardwareFader';
import { Sliders } from 'lucide-react';
import { DeckHardwareSelector } from './DeckHardwareSelector';

interface DJMixerSectionProps {
  deckA?: any;
  deckB?: any;
  colorA?: string;
  colorB?: string;
  isSingleChannel?: boolean;
  activeDeckId?: 'A' | 'B';
  onSelectDeck?: (deck: 'A' | 'B') => void;
  isPoweredOn?: boolean;
}

export const DJMixerSection: React.FC<DJMixerSectionProps> = ({
  deckA: propDeckA,
  deckB: propDeckB,
  colorA = '#00ff88',
  colorB = '#d946ef',
  isSingleChannel = false,
  activeDeckId = 'A',
  onSelectDeck,
  isPoweredOn = true,
}) => {
  const mixer = DJMixer.getInstance();
  const deckA = propDeckA ?? mixer.deckA;
  const deckB = propDeckB ?? mixer.deckB;

  // Fully reactive state for Channel 1
  const [trimA, setTrimA] = useState<number>(deckA?.gain ?? 1.0);
  const [hiA, setHiA] = useState<number>(deckA?.eqHigh ?? 0);
  const [midA, setMidA] = useState<number>(deckA?.eqMid ?? 0);
  const [lowA, setLowA] = useState<number>(deckA?.eqLow ?? 0);
  const [filterA, setFilterA] = useState<number>(deckA?.filter ?? 0);
  const [volA, setVolA] = useState<number>(deckA?.volume ?? 1.0);

  // Fully reactive state for Channel 2
  const [trimB, setTrimB] = useState<number>(deckB?.gain ?? 1.0);
  const [hiB, setHiB] = useState<number>(deckB?.eqHigh ?? 0);
  const [midB, setMidB] = useState<number>(deckB?.eqMid ?? 0);
  const [lowB, setLowB] = useState<number>(deckB?.eqLow ?? 0);
  const [filterB, setFilterB] = useState<number>(deckB?.filter ?? 0);
  const [volB, setVolB] = useState<number>(deckB?.volume ?? 1.0);

  const [vuA, setVuA] = useState<number>(0);
  const [vuB, setVuB] = useState<number>(0);
  const [vuMaster, setVuMaster] = useState<number>(0);
  const [crossfader, setCrossfader] = useState<number>(mixer.crossfaderPos);
  const [isSyncActive, setIsSyncActive] = useState<boolean>(mixer.isSyncActive);
  const [syncOutOfRange, setSyncOutOfRange] = useState<boolean>(mixer.syncOutOfRange);

  // Sync state if deck references change or on initialization
  useEffect(() => {
    if (deckA) {
      setTrimA(deckA.gain);
      setHiA(deckA.eqHigh);
      setMidA(deckA.eqMid);
      setLowA(deckA.eqLow);
      setFilterA(deckA.filter);
      setVolA(deckA.volume);
    }
  }, [deckA]);

  useEffect(() => {
    if (deckB) {
      setTrimB(deckB.gain);
      setHiB(deckB.eqHigh);
      setMidB(deckB.eqMid);
      setLowB(deckB.eqLow);
      setFilterB(deckB.filter);
      setVolB(deckB.volume);
    }
  }, [deckB]);

  // Meter & sync update loop
  useEffect(() => {
    let animId: number;
    const unsub = mixer.subscribe(() => {
      setIsSyncActive(mixer.isSyncActive);
      setSyncOutOfRange(mixer.syncOutOfRange);
      setCrossfader(mixer.crossfaderPos);
    });
    const loop = () => {
      if (deckA) setVuA(deckA.getVULevel());
      if (deckB) setVuB(deckB.getVULevel());
      setVuMaster(mixer.getMasterVU());
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => {
      unsub();
      cancelAnimationFrame(animId);
    };
  }, [deckA, deckB, mixer]);

  const handleCrossfaderChange = (val: number) => {
    setCrossfader(val);
    mixer.setCrossfader(val);
  };

  const renderVUMeter = (level: number, heightPx: number = 72) => {
    const bars = 10;
    const activeBars = !isPoweredOn ? 0 : Math.round(level * bars);

    return (
      <div className="flex flex-col-reverse gap-0.5 w-2 sm:w-2.5 bg-[#06070a] p-0.5 rounded border border-[#1e202d]" style={{ height: `${heightPx}px` }}>
        {Array.from({ length: bars }).map((_, i) => {
          const isActive = i < activeBars;
          const isRed = i >= 8;
          const isAmber = i >= 6 && i < 8;
          const colorClass = isRed
            ? 'bg-rose-500'
            : isAmber
            ? 'bg-amber-400'
            : 'bg-emerald-400';

          return (
            <div
              key={i}
              className={`w-full flex-1 rounded-xs transition-opacity ${
                isActive ? colorClass : 'bg-[#181922] opacity-25'
              }`}
            />
          );
        })}
      </div>
    );
  };

  if (isSingleChannel) {
    const isDeckA = activeDeckId !== 'B';
    const curColor = isDeckA ? colorA : colorB;
    const curTrim = isDeckA ? trimA : trimB;
    const curHi = isDeckA ? hiA : hiB;
    const curMid = isDeckA ? midA : midB;
    const curLow = isDeckA ? lowA : lowB;
    const curFilter = isDeckA ? filterA : filterB;
    const curVol = isDeckA ? volA : volB;
    const curVu = isDeckA ? vuA : vuB;

    return (
      <div className="w-full md:w-36 lg:w-40 shrink-0 flex flex-col justify-between rounded-xl border border-[#232534] bg-[#0c0d14] p-2 sm:p-2.5 shadow-xl">
        {/* Mobile Mixer Header: Deck Switcher Tabs, Sync Button, Master VU */}
        <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-[#1c1e28] shrink-0">
          {/* Deck Switcher Tabs: DECK A | DECK B */}
          <DeckHardwareSelector
            activeDeck={isDeckA ? 'A' : 'B'}
            onSelectDeck={(d) => onSelectDeck?.(d)}
            colorA={colorA}
            colorB={colorB}
            compact={true}
            isPoweredOn={isPoweredOn}
          />

          {/* Sync Button */}
          <button
            onClick={() => {
              if (!isPoweredOn) return;
              mixer.toggleMasterSync();
              setIsSyncActive(mixer.isSyncActive);
              setSyncOutOfRange(mixer.syncOutOfRange);
            }}
            className={`flex items-center justify-center px-2 py-1 rounded-md text-[9.5px] font-mono font-black tracking-wider transition-all border ${
              !isPoweredOn
                ? 'border-[#202230] bg-[#0c0d14] text-neutral-600 cursor-default'
                : isSyncActive
                ? syncOutOfRange
                  ? 'border-amber-500/80 bg-amber-950/40 text-amber-200 cursor-pointer active:scale-95'
                  : 'border-red-500/80 bg-red-950/40 text-white cursor-pointer active:scale-95'
                : 'border-[#262838] bg-[#14151e] hover:bg-[#1c1e2a] text-neutral-300 cursor-pointer active:scale-95'
            }`}
            style={{
              boxShadow: isPoweredOn && isSyncActive
                ? '0 0 8px rgba(239, 68, 68, 0.45)'
                : undefined,
            }}
            title={isPoweredOn ? 'Master Beat Sync' : 'Console Off'}
          >
            SYNC
          </button>

          {/* Master Output VU */}
          <div className="flex items-center gap-1">
            <span className="text-[8.5px] font-mono font-bold text-neutral-500 uppercase">MST</span>
            <div className="flex gap-0.5 h-4.5">
              {renderVUMeter(vuMaster, 18)}
              {renderVUMeter(vuMaster, 18)}
            </div>
          </div>
        </div>

        {/* 1 Set of Mixer Knobs and Slider (Horizontal row on mobile portrait, vertical column on landscape/desktop) */}
        <div className="flex flex-row md:flex-col items-center justify-between gap-2 flex-1 min-h-0 py-1.5 overflow-hidden">
          {/* 5 Knobs: TRIM, HI, MID, LOW, COLOR */}
          <div className="flex flex-row md:flex-col items-center justify-around gap-1 sm:gap-1.5 flex-1 min-w-0 w-full bg-[#08090f] p-1.5 rounded-xl border border-[#1e202d]">
            <Knob
              size="sm"
              label="TRIM"
              value={curTrim}
              min={0}
              max={1.5}
              step={0.02}
              defaultValue={1.0}
              color={curColor}
              isPoweredOn={isPoweredOn}
              onChange={(v) => {
                if (isDeckA) {
                  setTrimA(v);
                  (deckA ?? mixer.deckA)?.setGain(v);
                } else {
                  setTrimB(v);
                  (deckB ?? mixer.deckB)?.setGain(v);
                }
              }}
            />
            <Knob
              size="sm"
              label="HI"
              value={curHi}
              min={-24}
              max={6}
              step={0.5}
              defaultValue={0}
              unit="dB"
              color={curColor}
              isPoweredOn={isPoweredOn}
              onChange={(v) => {
                if (isDeckA) {
                  setHiA(v);
                  (deckA ?? mixer.deckA)?.setEQ('high', v);
                } else {
                  setHiB(v);
                  (deckB ?? mixer.deckB)?.setEQ('high', v);
                }
              }}
            />
            <Knob
              size="sm"
              label="MID"
              value={curMid}
              min={-24}
              max={6}
              step={0.5}
              defaultValue={0}
              unit="dB"
              color={curColor}
              isPoweredOn={isPoweredOn}
              onChange={(v) => {
                if (isDeckA) {
                  setMidA(v);
                  (deckA ?? mixer.deckA)?.setEQ('mid', v);
                } else {
                  setMidB(v);
                  (deckB ?? mixer.deckB)?.setEQ('mid', v);
                }
              }}
            />
            <Knob
              size="sm"
              label="LOW"
              value={curLow}
              min={-24}
              max={6}
              step={0.5}
              defaultValue={0}
              unit="dB"
              color={curColor}
              isPoweredOn={isPoweredOn}
              onChange={(v) => {
                if (isDeckA) {
                  setLowA(v);
                  (deckA ?? mixer.deckA)?.setEQ('low', v);
                } else {
                  setLowB(v);
                  (deckB ?? mixer.deckB)?.setEQ('low', v);
                }
              }}
            />
            <Knob
              size="sm"
              label="COLOR"
              value={curFilter}
              min={-1}
              max={1}
              step={0.02}
              defaultValue={0}
              color={curColor}
              isPoweredOn={isPoweredOn}
              onChange={(v) => {
                if (isDeckA) {
                  setFilterA(v);
                  (deckA ?? mixer.deckA)?.setFilter(v);
                } else {
                  setFilterB(v);
                  (deckB ?? mixer.deckB)?.setFilter(v);
                }
              }}
            />
          </div>

          {/* 1 Volume Slider and VU Meter */}
          <div className="flex flex-col items-center justify-center shrink-0 bg-[#08090f] p-1.5 rounded-xl border border-[#1e202d] h-full md:h-auto md:w-full">
            <span
              className="text-[9px] font-mono font-black uppercase tracking-wider mb-1"
              style={{ color: isPoweredOn ? curColor : '#4b5563' }}
            >
              {isDeckA ? 'CH 1 VOL' : 'CH 2 VOL'}
            </span>
            <div className="flex items-center justify-center gap-1.5">
              {renderVUMeter(curVu, 88)}
              <DJHardwareFader
                orientation="vertical"
                value={curVol}
                min={0}
                max={1}
                step={0.01}
                defaultValue={1.0}
                onChange={(v) => {
                  if (isDeckA) {
                    setVolA(v);
                    (deckA ?? mixer.deckA)?.setVolume(v);
                  } else {
                    setVolB(v);
                    (deckB ?? mixer.deckB)?.setVolume(v);
                  }
                }}
                accentColor={curColor}
                scale="volume"
                heightPx={88}
                widthPx={48}
                title={`${isDeckA ? 'Deck A' : 'Deck B'} Volume Fader`}
                isPoweredOn={isPoweredOn}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full lg:w-80 xl:w-84 2xl:w-88 h-full min-h-0 shrink-0 flex flex-col justify-between rounded-xl border border-[#232534] bg-[#0c0d14] p-2 sm:p-2.5 shadow-xl overflow-hidden">

      {/* Mixer Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-[#1c1e28] shrink-0">
        <div
          className={`flex items-center gap-1.5 font-mono font-black text-xs uppercase tracking-wider transition-colors duration-75 ${
            isPoweredOn ? 'text-neutral-200' : 'text-neutral-600'
          }`}
        >
          <Sliders
            className={`w-3.5 h-3.5 transition-colors duration-75 ${
              isPoweredOn ? 'text-neutral-400' : 'text-neutral-600'
            }`}
          />
          MIXER
        </div>
        {/* Master Output VU */}
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[9px] font-mono font-bold uppercase transition-colors duration-75 ${
              isPoweredOn ? 'text-neutral-500' : 'text-neutral-700'
            }`}
          >
            MST
          </span>
          <div className="flex gap-1 h-5">
            {renderVUMeter(vuMaster, 20)}
            {renderVUMeter(vuMaster, 20)}
          </div>
        </div>
      </div>

      {/* 2 Channel Strips: CH A & CH B (Covering half width and full remaining height) */}
      <div className="grid grid-cols-2 gap-2 flex-1 min-h-0 my-1">
        {/* Channel A Strip */}
        <div className="flex flex-col justify-between items-center bg-[#08090f] p-2 rounded-xl border border-[#1e202d] min-h-0">
          <span
            className="text-[10px] font-mono font-black uppercase tracking-wider shrink-0 transition-colors"
            style={{ color: isPoweredOn ? colorA : '#4b5563' }}
          >
            CH 1
          </span>

          {/* TRIM */}
          <Knob
            size="md"
            label="TRIM"
            value={trimA}
            min={0}
            max={1.5}
            step={0.02}
            defaultValue={1.0}
            color={colorA}
            isPoweredOn={isPoweredOn}
            onChange={(v) => {
              setTrimA(v);
              (deckA ?? mixer.deckA)?.setGain(v);
            }}
          />

          <div className="w-full border-t border-[#181923]" />

          {/* 3-Band EQ */}
          <Knob
            size="md"
            label="HI"
            value={hiA}
            min={-24}
            max={6}
            step={0.5}
            defaultValue={0}
            unit="dB"
            color={colorA}
            isPoweredOn={isPoweredOn}
            onChange={(v) => {
              setHiA(v);
              (deckA ?? mixer.deckA)?.setEQ('high', v);
            }}
          />
          <Knob
            size="md"
            label="MID"
            value={midA}
            min={-24}
            max={6}
            step={0.5}
            defaultValue={0}
            unit="dB"
            color={colorA}
            isPoweredOn={isPoweredOn}
            onChange={(v) => {
              setMidA(v);
              (deckA ?? mixer.deckA)?.setEQ('mid', v);
            }}
          />
          <Knob
            size="md"
            label="LOW"
            value={lowA}
            min={-24}
            max={6}
            step={0.5}
            defaultValue={0}
            unit="dB"
            color={colorA}
            isPoweredOn={isPoweredOn}
            onChange={(v) => {
              setLowA(v);
              (deckA ?? mixer.deckA)?.setEQ('low', v);
            }}
          />

          <div className="w-full border-t border-[#181923]" />

          {/* Sound Color Filter */}
          <Knob
            size="md"
            label="COLOR"
            value={filterA}
            min={-1}
            max={1}
            step={0.02}
            defaultValue={0}
            color={colorA}
            isPoweredOn={isPoweredOn}
            onChange={(v) => {
              setFilterA(v);
              (deckA ?? mixer.deckA)?.setFilter(v);
            }}
          />

          {/* Channel Fader & VU Meter (Covering vertical space with no gap below) */}
          <div className="flex items-center justify-center gap-2 pt-1 border-t border-[#181923] w-full">
            {renderVUMeter(vuA, 108)}
            <DJHardwareFader
              orientation="vertical"
              value={volA}
              min={0}
              max={1}
              step={0.01}
              defaultValue={1.0}
              onChange={(v) => {
                setVolA(v);
                (deckA ?? mixer.deckA)?.setVolume(v);
              }}
              accentColor={colorA}
              scale="volume"
              heightPx={108}
              widthPx={54}
              title="Channel 1 Volume Fader"
              isPoweredOn={isPoweredOn}
            />
          </div>
        </div>

        {/* Channel B Strip */}
        <div className="flex flex-col justify-between items-center bg-[#08090f] p-2 rounded-xl border border-[#1e202d] min-h-0">
          <span
            className="text-[10px] font-mono font-black uppercase tracking-wider shrink-0 transition-colors"
            style={{ color: isPoweredOn ? colorB : '#4b5563' }}
          >
            CH 2
          </span>

          {/* TRIM */}
          <Knob
            size="md"
            label="TRIM"
            value={trimB}
            min={0}
            max={1.5}
            step={0.02}
            defaultValue={1.0}
            color={colorB}
            isPoweredOn={isPoweredOn}
            onChange={(v) => {
              setTrimB(v);
              (deckB ?? mixer.deckB)?.setGain(v);
            }}
          />

          <div className="w-full border-t border-[#181923]" />

          {/* 3-Band EQ */}
          <Knob
            size="md"
            label="HI"
            value={hiB}
            min={-24}
            max={6}
            step={0.5}
            defaultValue={0}
            unit="dB"
            color={colorB}
            isPoweredOn={isPoweredOn}
            onChange={(v) => {
              setHiB(v);
              (deckB ?? mixer.deckB)?.setEQ('high', v);
            }}
          />
          <Knob
            size="md"
            label="MID"
            value={midB}
            min={-24}
            max={6}
            step={0.5}
            defaultValue={0}
            unit="dB"
            color={colorB}
            isPoweredOn={isPoweredOn}
            onChange={(v) => {
              setMidB(v);
              (deckB ?? mixer.deckB)?.setEQ('mid', v);
            }}
          />
          <Knob
            size="md"
            label="LOW"
            value={lowB}
            min={-24}
            max={6}
            step={0.5}
            defaultValue={0}
            unit="dB"
            color={colorB}
            isPoweredOn={isPoweredOn}
            onChange={(v) => {
              setLowB(v);
              (deckB ?? mixer.deckB)?.setEQ('low', v);
            }}
          />

          <div className="w-full border-t border-[#181923]" />

          {/* Sound Color Filter */}
          <Knob
            size="md"
            label="COLOR"
            value={filterB}
            min={-1}
            max={1}
            step={0.02}
            defaultValue={0}
            color={colorB}
            isPoweredOn={isPoweredOn}
            onChange={(v) => {
              setFilterB(v);
              (deckB ?? mixer.deckB)?.setFilter(v);
            }}
          />

          {/* Channel Fader & VU Meter (Covering vertical space with no gap below) */}
          <div className="flex items-center justify-center gap-2 pt-1 border-t border-[#181923] w-full">
            {renderVUMeter(vuB, 108)}
            <DJHardwareFader
              orientation="vertical"
              value={volB}
              min={0}
              max={1}
              step={0.01}
              defaultValue={1.0}
              onChange={(v) => {
                setVolB(v);
                (deckB ?? mixer.deckB)?.setVolume(v);
              }}
              accentColor={colorB}
              scale="volume"
              heightPx={108}
              widthPx={54}
              title="Channel 2 Volume Fader"
              isPoweredOn={isPoweredOn}
            />
          </div>
        </div>
      </div>

      {/* Horizontal Crossfader Section with Central Master Beat Sync */}
      <div className="pt-2 border-t border-[#1c1e28] space-y-1.5 shrink-0">
        {/* Single Center Master Sync Button */}
        <div className="relative group flex items-center justify-center">
          <button
            onClick={() => {
              if (!isPoweredOn) return;
              mixer.toggleMasterSync();
              setIsSyncActive(mixer.isSyncActive);
              setSyncOutOfRange(mixer.syncOutOfRange);
            }}
            className={`flex items-center justify-center gap-2 w-full py-1.5 px-3 rounded-xl text-xs font-mono font-black tracking-wider transition-all border ${
              !isPoweredOn
                ? 'duration-75 delay-0 border-[#202230] bg-[#0c0d14] text-neutral-600 cursor-default'
                : isSyncActive
                ? syncOutOfRange
                  ? 'duration-75 delay-[450ms] border-amber-500/80 bg-amber-950/40 text-amber-200 cursor-pointer active:scale-95'
                  : 'duration-75 delay-[450ms] border-red-500/80 bg-red-950/40 text-white cursor-pointer active:scale-95'
                : 'duration-75 delay-[450ms] border-[#262838] bg-[#14151e] hover:bg-[#1c1e2a] text-neutral-300 cursor-pointer active:scale-95'
            }`}
            style={{
              background: !isPoweredOn
                ? undefined
                : isSyncActive
                ? syncOutOfRange
                  ? 'radial-gradient(circle at 50% 50%, rgba(245, 158, 11, 0.45) 0%, rgba(217, 119, 6, 0.2) 60%, #171109 100%)'
                  : 'radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.45) 0%, rgba(220, 38, 38, 0.2) 60%, #17090b 100%)'
                : undefined,
              boxShadow: !isPoweredOn
                ? undefined
                : isSyncActive
                ? syncOutOfRange
                  ? 'inset 0 0 16px rgba(245, 158, 11, 0.6), 0 0 14px rgba(245, 158, 11, 0.45)'
                  : 'inset 0 0 16px rgba(239, 68, 68, 0.6), 0 0 14px rgba(239, 68, 68, 0.45)'
                : undefined,
              color: !isPoweredOn
                ? undefined
                : isSyncActive
                ? syncOutOfRange ? '#fef3c7' : '#ffffff'
                : undefined,
              textShadow: !isPoweredOn
                ? undefined
                : isSyncActive
                ? syncOutOfRange
                  ? '0 0 8px rgba(245, 158, 11, 0.95), 0 0 2px #ffffff'
                  : '0 0 8px rgba(239, 68, 68, 0.95), 0 0 2px #ffffff'
                : undefined,
            }}
            title={
              !isPoweredOn
                ? 'Console Off'
                : isSyncActive && syncOutOfRange && mixer.syncOutOfRangeInfo
                ? `Target BPM Out of Range: ${mixer.syncOutOfRangeInfo.masterBPM.toFixed(1)} BPM exceeds ±10% limit of follower (${mixer.syncOutOfRangeInfo.followerBaseBPM.toFixed(1)} BPM). Clamped to ${mixer.syncOutOfRangeInfo.clampedBPM.toFixed(1)} BPM.`
                : 'Master Beat Sync: Lock Deck A and Deck B BPM & beat phase'
            }
          >
            <span>SYNC</span>
          </button>

          {/* Hover Hint: only visible when user cursor is over the button */}
          {isPoweredOn && isSyncActive && syncOutOfRange && (
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-30 px-2 py-0.5 rounded bg-[#16120d] border border-amber-600/60 text-amber-300 font-mono text-[9px] font-bold shadow-lg">
              Target BPM Out of Range (Clamped to ±10%)
            </div>
          )}
        </div>

        {/* Crossfader Header */}
        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 px-1">
          <span
            className="font-black text-[9px] sm:text-[10px] transition-colors duration-75"
            style={{ color: isPoweredOn ? colorA : '#4b5563' }}
          >
            DECK A
          </span>
          <span className="text-[8px] font-mono uppercase tracking-widest text-neutral-500 font-bold">CROSSFADER</span>
          <span
            className="font-black text-[9px] sm:text-[10px] transition-colors duration-75"
            style={{ color: isPoweredOn ? colorB : '#4b5563' }}
          >
            DECK B
          </span>
        </div>

        {/* Pro DJ Hardware Crossfader */}
        <div className="relative flex items-center justify-center px-1">
          <DJHardwareFader
            orientation="horizontal"
            value={crossfader}
            min={-1}
            max={1}
            step={0.01}
            defaultValue={0}
            onChange={handleCrossfaderChange}
            accentColor={crossfader < -0.05 ? colorA : crossfader > 0.05 ? colorB : colorA}
            scale="crossfader"
            heightPx={32}
            title="Crossfader ([-] Slide Left / Deck A · [+] Slide Right / Deck B)"
            isPoweredOn={isPoweredOn}
          />
        </div>

        {/* Center Snap Button (Positioned Below the Crossfader Slider) */}
        <div className="flex items-center justify-center pt-0.5">
          <button
            onClick={() => {
              if (!isPoweredOn) return;
              handleCrossfaderChange(0);
            }}
            className={`w-full py-1 px-3 rounded-lg text-[9px] sm:text-[10px] font-mono font-bold transition-all flex items-center justify-center gap-1.5 border ${
              !isPoweredOn
                ? 'duration-75 delay-0 bg-[#090a10] border-[#181a24] text-neutral-600 cursor-default shadow-none pointer-events-none'
                : 'duration-75 delay-[500ms] bg-[#141622] hover:bg-[#1d2030] text-neutral-300 hover:text-white border-[#222536] cursor-pointer active:scale-95 shadow-sm'
            }`}
            title={isPoweredOn ? 'Reset crossfader to center (0.0)' : 'Console Off'}
          >
            <span>CENTER SNAP</span>
          </button>
        </div>
      </div>

    </div>
  );
};
