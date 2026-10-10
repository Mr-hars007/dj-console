import React, { useState, useEffect } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import type { AccompanimentStyle } from '../audio/AccompanimentEngine';


import { Power, Disc, Download, Volume2, Sparkles } from 'lucide-react';

export type ActiveInstrument = 'keyboard' | 'guitar' | 'drums';

export interface RGBTheme {
  id: string;
  name: string;
  colorA: string;
  colorB: string;
  glowA: string;
  glowB: string;
  color: string;
  glow: string;
}

export const RGB_THEMES: RGBTheme[] = [
  {
    id: 'toxic-violet',
    name: 'Acid & Ultraviolet',
    colorA: '#00ff88',
    colorB: '#d946ef',
    glowA: 'rgba(0, 255, 136, 0.45)',
    glowB: 'rgba(217, 70, 239, 0.45)',
    color: '#00ff88',
    glow: 'rgba(0, 255, 136, 0.45)',
  },
  {
    id: 'synth-vice',
    name: 'Miami Vice & Cyan',
    colorA: '#00f5ff',
    colorB: '#ff007f',
    glowA: 'rgba(0, 245, 255, 0.45)',
    glowB: 'rgba(255, 0, 127, 0.45)',
    color: '#00f5ff',
    glow: 'rgba(0, 245, 255, 0.45)',
  },
  {
    id: 'emerald-ocean',
    name: 'Toxic Emerald & Deep Ocean',
    colorA: '#10b981',
    colorB: '#06b6d4',
    glowA: 'rgba(16, 185, 129, 0.45)',
    glowB: 'rgba(6, 182, 212, 0.45)',
    color: '#10b981',
    glow: 'rgba(16, 185, 129, 0.45)',
  },
  {
    id: 'solar-gold',
    name: 'Imperial Gold & Solar Flame',
    colorA: '#eab308',
    colorB: '#f97316',
    glowA: 'rgba(234, 179, 8, 0.45)',
    glowB: 'rgba(249, 115, 22, 0.45)',
    color: '#eab308',
    glow: 'rgba(234, 179, 8, 0.45)',
  },
  {
    id: 'tokyo-crimson',
    name: 'Tokyo Crimson & Cyber Blue',
    colorA: '#ef4444',
    colorB: '#3b82f6',
    glowA: 'rgba(239, 68, 68, 0.45)',
    glowB: 'rgba(59, 130, 246, 0.45)',
    color: '#ef4444',
    glow: 'rgba(239, 68, 68, 0.45)',
  },
  {
    id: 'stealth',
    name: 'Stealth Smoke & Platinum',
    colorA: '#52525b',
    colorB: '#a1a1aa',
    glowA: 'rgba(82, 82, 91, 0.2)',
    glowB: 'rgba(161, 161, 170, 0.2)',
    color: '#52525b',
    glow: 'rgba(82, 82, 91, 0.2)',
  },
];

interface HardwareHeaderProps {
  activeInstrument: ActiveInstrument;
  onSelectInstrument: (inst: ActiveInstrument) => void;
  activeTheme: RGBTheme;
  onSelectTheme: (theme: RGBTheme) => void;
}

export const HardwareHeader: React.FC<HardwareHeaderProps> = ({
  activeInstrument,
  onSelectInstrument,
  activeTheme,
  onSelectTheme,
}) => {
  const engine = AudioEngine.getInstance();
  const [isPowerOn, setIsPowerOn] = useState(engine.isInitialized);
  const [isRecording, setIsRecording] = useState(engine.isRecording);
  const [volume, setVolume] = useState(engine.config.masterVolume);
  const [accompStyle, setAccompStyle] = useState<AccompanimentStyle>('groove');

  useEffect(() => {
    const unsub = engine.subscribe(() => {
      setIsPowerOn(engine.isInitialized);
      setIsRecording(engine.isRecording);
      setVolume(engine.config.masterVolume);
      if (engine.accompaniment) {
        setAccompStyle(engine.accompaniment.style);
      }
    });

    return unsub;
  }, [engine]);

  const togglePower = async () => {
    if (!engine.isInitialized) {
      await engine.initialize();
      setIsPowerOn(true);
    } else if (engine.ctx) {
      if (engine.ctx.state === 'running') {
        await engine.ctx.suspend();
        setIsPowerOn(false);
      } else {
        await engine.ctx.resume();
        setIsPowerOn(true);
      }
    }
  };

  const handleStyleChange = (s: AccompanimentStyle) => {
    setAccompStyle(s);
    if (engine.accompaniment) {
      engine.accompaniment.style = s;
      if (s === 'off') {
        engine.accompaniment.stop();
      } else if (!engine.accompaniment.isRunning && engine.isInitialized) {
        engine.accompaniment.start();
      }
    }
  };

  const toggleRecording = () => {
    if (!engine.isInitialized) return;
    if (engine.isRecording) {
      engine.stopRecording();
    } else {
      engine.startRecording();
    }
  };

  return (
    <div className="border-b border-[#232530] bg-[#111218] p-4 rounded-t-2xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Unit Branding & Power Switch */}
        <div className="flex items-center gap-3">
          <button
            onClick={togglePower}
            className={`flex items-center justify-center w-10 h-10 rounded-xl border transition-all ${
              isPowerOn
                ? 'bg-neutral-800 border-emerald-500/60 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                : 'bg-[#181920] border-[#2d303f] text-neutral-500 hover:text-neutral-300'
            }`}
            title={isPowerOn ? 'Power Online' : 'Click to Power On'}
          >
            <Power className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-sm tracking-widest text-neutral-100 uppercase">
                NEURAL<span className="text-neutral-400">STUDIO</span>
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#181a24] text-neutral-400 border border-[#2b2d3c] uppercase font-bold">
                MATTE-BLACK HW
              </span>
            </div>
            <p className="text-[10px] font-mono text-neutral-500">
              100% Algorithmic Live Accompanist &middot; Pure Acoustics
            </p>
          </div>
        </div>

        {/* Central Instrument Mode Tabs */}
        <div className="flex items-center gap-1.5 bg-[#0b0c10] p-1 rounded-xl border border-[#232532]">
          <button
            onClick={() => onSelectInstrument('keyboard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all ${
              activeInstrument === 'keyboard'
                ? 'bg-[#222430] text-neutral-100 border border-[#3b3e52] shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            🎹 KEYBOARD
          </button>
          <button
            onClick={() => onSelectInstrument('guitar')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all ${
              activeInstrument === 'guitar'
                ? 'bg-[#222430] text-neutral-100 border border-[#3b3e52] shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            🎸 GUITAR
          </button>
          <button
            onClick={() => onSelectInstrument('drums')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all ${
              activeInstrument === 'drums'
                ? 'bg-[#222430] text-neutral-100 border border-[#3b3e52] shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            🥁 DRUM PADS
          </button>
        </div>

        {/* Live Accompaniment Band Style & RGB Aura Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Accompanist Style */}
          <div className="flex items-center gap-1.5 bg-[#0b0c10] px-2.5 py-1.5 rounded-xl border border-[#232532]">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-mono text-neutral-400 uppercase">Live Band:</span>
            <select
              value={accompStyle}
              onChange={(e) => handleStyleChange(e.target.value as any)}
              className="bg-transparent text-xs font-mono font-bold text-neutral-200 focus:outline-none cursor-pointer"
            >
              <option value="groove" className="bg-[#121319]">Groove Funk</option>
              <option value="chill" className="bg-[#121319]">Chill Lounge</option>
              <option value="synthwave" className="bg-[#121319]">Synthwave</option>
              <option value="acoustic" className="bg-[#121319]">Acoustic</option>
              <option value="off" className="bg-[#121319]">Solo (No Band)</option>
            </select>
          </div>

          {/* Diffused RGB Theme Selector */}
          <div className="flex items-center gap-1.5 bg-[#0b0c10] px-2.5 py-1.5 rounded-xl border border-[#232532]">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: activeTheme.color }}
            />
            <span className="text-[10px] font-mono text-neutral-400 uppercase">Aura:</span>
            <select
              value={activeTheme.id}
              onChange={(e) => {
                const found = RGB_THEMES.find((t) => t.id === e.target.value);
                if (found) onSelectTheme(found);
              }}
              className="bg-transparent text-xs font-mono font-bold text-neutral-300 focus:outline-none cursor-pointer"
            >
              {RGB_THEMES.map((t) => (
                <option key={t.id} value={t.id} className="bg-[#121319]">
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Master Volume */}
          <div className="flex items-center gap-2 bg-[#0b0c10] px-2.5 py-1.5 rounded-xl border border-[#232532]">
            <Volume2 className="w-3.5 h-3.5 text-neutral-400" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                engine.applyConfig({ masterVolume: v });
              }}
              className="w-16 accent-neutral-300 cursor-pointer"
              title={`Master Volume: ${Math.round(volume * 100)}%`}
            />
          </div>

          {/* Record Button */}
          <button
            onClick={toggleRecording}
            className={`p-2 rounded-xl border font-mono transition-all ${
              isRecording
                ? 'bg-rose-950/80 border-rose-500 text-rose-400 animate-pulse'
                : 'bg-[#181920] border-[#2b2d3c] text-neutral-400 hover:text-neutral-200'
            }`}
            title={isRecording ? 'Recording active - click to finish' : 'Record performance to WebM file'}
          >
            {isRecording ? <Disc className="w-4 h-4 fill-current" /> : <Download className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
