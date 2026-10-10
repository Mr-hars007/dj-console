import React from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import { Knob } from './Knob';
import { Sliders, Sparkles } from 'lucide-react';

export const HardwareControls: React.FC = () => {
  const engine = AudioEngine.getInstance();
  const cfg = engine.config;

  const update = (partial: any) => {
    engine.applyConfig(partial);
  };

  const handleIntensityChange = (val: number) => {
    if (engine.accompaniment) {
      engine.accompaniment.intensity = val;
    }
  };

  const handleBpmChange = (val: number) => {
    if (engine.accompaniment) {
      engine.accompaniment.bpm = Math.round(val);
    }
    if (engine.sequencer) {
      engine.sequencer.bpm = Math.round(val);
    }
  };

  return (
    <div className="rounded-xl border border-[#232532] bg-[#0d0e14] p-3.5 space-y-3">
      <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
        <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-neutral-300">
          <Sliders className="w-3.5 h-3.5 text-neutral-400" />
          ANALOG MODELING & MASTER PROCESSING
        </div>
        <div className="flex items-center gap-1 text-[10px] text-neutral-500">
          <Sparkles className="w-3 h-3 text-amber-400" />
          REAL-TIME ADAPTIVE DSP
        </div>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 pt-1 border-t border-[#1a1c26]">
        <Knob
          label="Cutoff"
          value={cfg.filterCutoff}
          min={60}
          max={16000}
          step={50}
          defaultValue={2400}
          unit="Hz"
          color="#38bdf8"
          onChange={(v) => update({ filterCutoff: v })}
        />
        <Knob
          label="Resonance"
          value={cfg.filterResonance}
          min={0.1}
          max={15}
          step={0.1}
          defaultValue={4.0}
          unit="Q"
          color="#38bdf8"
          onChange={(v) => update({ filterResonance: v })}
        />
        <Knob
          label="Drive"
          value={cfg.drive}
          min={0}
          max={1}
          step={0.02}
          defaultValue={0.15}
          color="#f59e0b"
          onChange={(v) => update({ drive: v })}
        />
        <Knob
          label="Delay"
          value={cfg.delayWet}
          min={0}
          max={0.8}
          step={0.02}
          defaultValue={0.25}
          color="#a855f7"
          onChange={(v) => update({ delayWet: v })}
        />
        <Knob
          label="Reverb"
          value={cfg.reverbWet}
          min={0}
          max={0.8}
          step={0.02}
          defaultValue={0.3}
          color="#a855f7"
          onChange={(v) => update({ reverbWet: v })}
        />
        <Knob
          label="Room Size"
          value={cfg.reverbDecay}
          min={0.5}
          max={5.0}
          step={0.1}
          defaultValue={2.5}
          unit="s"
          color="#a855f7"
          onChange={(v) => update({ reverbDecay: v })}
        />
        <Knob
          label="Band Level"
          value={engine.accompaniment?.intensity ?? 0.6}
          min={0}
          max={1}
          step={0.05}
          defaultValue={0.6}
          color="#10b981"
          onChange={handleIntensityChange}
        />
        <Knob
          label="Tempo"
          value={engine.accompaniment?.bpm ?? 110}
          min={60}
          max={180}
          step={1}
          defaultValue={110}
          unit="bpm"
          color="#e2e8f0"
          onChange={handleBpmChange}
        />
      </div>
    </div>
  );
};
