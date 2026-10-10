import React, { useState, useEffect } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import { PRESETS } from '../audio/presets';
import { VISUALIZER_THEMES } from '../visualizer/themes';
import type { VisualizerMode } from '../audio/types';

import { Power, Radio, Disc, Download, Eye, Palette, Volume2 } from 'lucide-react';

interface HeaderProps {
  currentMode: VisualizerMode;
  onModeChange: (mode: VisualizerMode) => void;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentMode,
  onModeChange,
  currentTheme,
  onThemeChange,
}) => {
  const engine = AudioEngine.getInstance();
  const [isPowerOn, setIsPowerOn] = useState(engine.isInitialized);
  const [selectedPreset, setSelectedPreset] = useState(PRESETS[0].id);
  const [isRecording, setIsRecording] = useState(engine.isRecording);
  const [volume, setVolume] = useState(engine.config.masterVolume);

  useEffect(() => {
    const unsub = engine.subscribe(() => {
      setIsPowerOn(engine.isInitialized);
      setIsRecording(engine.isRecording);
      setVolume(engine.config.masterVolume);
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

  const handlePresetSelect = (id: string) => {
    setSelectedPreset(id);
    engine.loadPreset(id);
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
    <header className="rounded-2xl border border-cyan-500/30 bg-slate-950/85 backdrop-blur-md p-3.5 shadow-xl shadow-cyan-950/40">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Badge */}
        <div className="flex items-center gap-3">
          <button
            onClick={togglePower}
            className={`flex items-center justify-center w-10 h-10 rounded-xl border transition-all shadow-lg ${
              isPowerOn
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-cyan-500/40 animate-pulse'
                : 'bg-rose-950/40 border-rose-600 text-rose-400 hover:bg-rose-900/50'
            }`}
            title={isPowerOn ? 'Audio Engine Online' : 'Click to Engage Audio Engine'}
          >
            <Power className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black font-mono tracking-wider bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 bg-clip-text text-transparent m-0 p-0">
                NEURAL<span className="text-cyan-400">SYNTH</span>
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono font-bold tracking-tight uppercase">
                100% Algorithmic
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              Procedural Web Audio Engine &middot; Zero Samples &middot; 3D Reactive WebGL
            </p>
          </div>
        </div>

        {/* Center: Presets & Live Recording */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Preset Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 rounded-xl px-2.5 py-1.5 border border-slate-800">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] font-mono text-slate-400 uppercase">Patch:</span>
            <select
              value={selectedPreset}
              onChange={(e) => handlePresetSelect(e.target.value)}
              className="bg-transparent text-xs font-mono font-bold text-cyan-300 focus:outline-none cursor-pointer"
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Record Session Button */}
          <button
            onClick={toggleRecording}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all shadow-md ${
              isRecording
                ? 'bg-rose-600 text-white animate-pulse shadow-rose-600/50'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
            }`}
            title="Record direct live output and export as WebM audio file"
          >
            {isRecording ? (
              <>
                <Disc className="w-3.5 h-3.5 fill-current animate-spin" />
                <span>REC... STOP</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-rose-400" />
                <span>Record Session</span>
              </>
            )}
          </button>
        </div>

        {/* Right: 3D Visualizer Mode & Theme Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Mode Selector */}
          <div className="flex items-center gap-1 bg-slate-900/90 rounded-xl p-1 border border-slate-800">
            <Eye className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
            {(['neural', 'cybercore', 'terrain'] as VisualizerMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => onModeChange(mode)}
                className={`px-2 py-1 rounded-lg text-[10px] font-mono uppercase font-bold transition-all ${
                  currentMode === mode
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode === 'neural' ? 'Synapse' : mode === 'cybercore' ? 'Core' : 'Terrain'}
              </button>
            ))}
          </div>

          {/* Theme Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 rounded-xl px-2.5 py-1.5 border border-slate-800">
            <Palette className="w-3.5 h-3.5 text-pink-400" />
            <select
              value={currentTheme}
              onChange={(e) => onThemeChange(e.target.value)}
              className="bg-transparent text-xs font-mono text-slate-300 focus:outline-none cursor-pointer"
            >
              {VISUALIZER_THEMES.map((t) => (
                <option key={t.id} value={t.id} className="bg-slate-900 text-slate-200">
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Master Volume */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 rounded-xl px-2.5 py-1.5 border border-slate-800">
            <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
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
              className="w-16 accent-cyan-400 cursor-pointer"
              title={`Master Volume: ${Math.round(volume * 100)}%`}
            />
          </div>
        </div>
      </div>
    </header>
  );
};
