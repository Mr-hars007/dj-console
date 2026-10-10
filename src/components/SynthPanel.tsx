import React from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import { Knob } from './Knob';
import type { WaveformType, FilterType } from '../audio/types';

import { Sliders, Cpu, Activity, Waves, Sparkles } from 'lucide-react';

export const SynthPanel: React.FC = () => {
  const engine = AudioEngine.getInstance();
  const cfg = engine.config;

  const update = (partial: any) => {
    engine.applyConfig(partial);
  };

  const waveforms: { id: WaveformType; label: string }[] = [
    { id: 'sawtooth', label: 'SAW' },
    { id: 'square', label: 'SQR' },
    { id: 'sine', label: 'SIN' },
    { id: 'triangle', label: 'TRI' },
  ];

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-slate-950/85 backdrop-blur-md p-4 shadow-lg shadow-cyan-950/30 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
        <Cpu className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-mono font-bold tracking-widest text-cyan-300 uppercase">
          Modular Synthesizer Architecture
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Module 1: Oscillators */}
        <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-300">
            <Waves className="w-3.5 h-3.5 text-cyan-400" /> OSCILLATORS
          </div>

          {/* Osc 1 */}
          <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>OSC 1</span>
              <div className="flex gap-1">
                {waveforms.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => update({ osc1Type: w.id })}
                    className={`px-1.5 py-0.5 rounded text-[9px] ${
                      cfg.osc1Type === w.id
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-around">
              <Knob
                label="Octave"
                value={cfg.osc1Octave}
                min={-2}
                max={2}
                step={1}
                defaultValue={0}
                onChange={(v) => update({ osc1Octave: v })}
              />
              <Knob
                label="Detune"
                value={cfg.osc1Detune}
                min={-50}
                max={50}
                step={1}
                defaultValue={-6}
                unit="c"
                onChange={(v) => update({ osc1Detune: v })}
              />
              <Knob
                label="Level"
                value={cfg.osc1Gain}
                min={0}
                max={1}
                step={0.02}
                defaultValue={0.7}
                onChange={(v) => update({ osc1Gain: v })}
              />
            </div>
          </div>

          {/* Osc 2 */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>OSC 2</span>
              <div className="flex gap-1">
                {waveforms.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => update({ osc2Type: w.id })}
                    className={`px-1.5 py-0.5 rounded text-[9px] ${
                      cfg.osc2Type === w.id
                        ? 'bg-pink-500 text-white font-bold'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-around">
              <Knob
                label="Octave"
                value={cfg.osc2Octave}
                min={-2}
                max={2}
                step={1}
                defaultValue={0}
                color="#ff007f"
                onChange={(v) => update({ osc2Octave: v })}
              />
              <Knob
                label="Detune"
                value={cfg.osc2Detune}
                min={-50}
                max={50}
                step={1}
                defaultValue={8}
                unit="c"
                color="#ff007f"
                onChange={(v) => update({ osc2Detune: v })}
              />
              <Knob
                label="Level"
                value={cfg.osc2Gain}
                min={0}
                max={1}
                step={0.02}
                defaultValue={0.5}
                color="#ff007f"
                onChange={(v) => update({ osc2Gain: v })}
              />
            </div>
          </div>

          {/* Sub Osc */}
          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400">SUB OSC (-1 OCT)</span>
            <Knob
              label="Sub Level"
              value={cfg.subOscGain}
              min={0}
              max={1}
              step={0.05}
              defaultValue={0.3}
              color="#a855f7"
              onChange={(v) => update({ subOscGain: v })}
            />
          </div>
        </div>

        {/* Module 2: Resonant Filter & LFO */}
        <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-300">
            <Sliders className="w-3.5 h-3.5 text-emerald-400" /> RESONANT FILTER
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
            <span>FILTER TYPE</span>
            <div className="flex gap-1">
              {(['lowpass', 'highpass', 'bandpass'] as FilterType[]).map((ft) => (
                <button
                  key={ft}
                  onClick={() => update({ filterType: ft })}
                  className={`px-1.5 py-0.5 rounded text-[9px] uppercase ${
                    cfg.filterType === ft
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {ft === 'lowpass' ? 'LP' : ft === 'highpass' ? 'HP' : 'BP'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1">
            <Knob
              label="Cutoff"
              value={cfg.filterCutoff}
              min={40}
              max={12000}
              step={20}
              defaultValue={1800}
              unit="Hz"
              color="#10b981"
              onChange={(v) => update({ filterCutoff: v })}
            />
            <Knob
              label="Resonance"
              value={cfg.filterResonance}
              min={0.1}
              max={18}
              step={0.1}
              defaultValue={4.5}
              unit="Q"
              color="#10b981"
              onChange={(v) => update({ filterResonance: v })}
            />
            <Knob
              label="Env Amt"
              value={cfg.filterEnvAmount}
              min={-4000}
              max={8000}
              step={100}
              defaultValue={2400}
              unit="Hz"
              color="#10b981"
              onChange={(v) => update({ filterEnvAmount: v })}
            />
          </div>

          {/* LFO Section */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>LFO MODULATION</span>
              <div className="flex gap-1">
                {(['cutoff', 'pitch'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => update({ lfoTarget: t })}
                    className={`px-1.5 py-0.5 rounded text-[9px] uppercase ${
                      cfg.lfoTarget === t
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-around">
              <Knob
                label="LFO Rate"
                value={cfg.lfoRate}
                min={0.1}
                max={20}
                step={0.1}
                defaultValue={3.2}
                unit="Hz"
                color="#f59e0b"
                onChange={(v) => update({ lfoRate: v })}
              />
              <Knob
                label="LFO Depth"
                value={cfg.lfoDepth}
                min={0}
                max={1}
                step={0.02}
                defaultValue={0.25}
                color="#f59e0b"
                onChange={(v) => update({ lfoDepth: v })}
              />
            </div>
          </div>
        </div>

        {/* Module 3: ADSR Envelopes */}
        <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-300">
            <Activity className="w-3.5 h-3.5 text-cyan-400" /> ADSR ENVELOPES
          </div>

          {/* Amp Envelope */}
          <div className="space-y-1 pt-1 border-t border-slate-800/60">
            <span className="text-[10px] font-mono text-cyan-400 font-bold">AMP ENVELOPE</span>
            <div className="grid grid-cols-4 gap-1">
              <Knob
                label="Attack"
                value={cfg.ampEnv.attack}
                min={0.005}
                max={2.0}
                step={0.01}
                defaultValue={0.02}
                unit="s"
                onChange={(v) => update({ ampEnv: { ...cfg.ampEnv, attack: v } })}
              />
              <Knob
                label="Decay"
                value={cfg.ampEnv.decay}
                min={0.01}
                max={2.0}
                step={0.01}
                defaultValue={0.25}
                unit="s"
                onChange={(v) => update({ ampEnv: { ...cfg.ampEnv, decay: v } })}
              />
              <Knob
                label="Sustain"
                value={cfg.ampEnv.sustain}
                min={0}
                max={1}
                step={0.02}
                defaultValue={0.5}
                onChange={(v) => update({ ampEnv: { ...cfg.ampEnv, sustain: v } })}
              />
              <Knob
                label="Release"
                value={cfg.ampEnv.release}
                min={0.02}
                max={3.0}
                step={0.02}
                defaultValue={0.4}
                unit="s"
                onChange={(v) => update({ ampEnv: { ...cfg.ampEnv, release: v } })}
              />
            </div>
          </div>

          {/* Filter Envelope */}
          <div className="space-y-1 pt-2 border-t border-slate-800/60">
            <span className="text-[10px] font-mono text-emerald-400 font-bold">FILTER ENVELOPE</span>
            <div className="grid grid-cols-4 gap-1">
              <Knob
                label="Attack"
                value={cfg.filterEnv.attack}
                min={0.005}
                max={2.0}
                step={0.01}
                defaultValue={0.04}
                unit="s"
                color="#10b981"
                onChange={(v) => update({ filterEnv: { ...cfg.filterEnv, attack: v } })}
              />
              <Knob
                label="Decay"
                value={cfg.filterEnv.decay}
                min={0.01}
                max={2.0}
                step={0.01}
                defaultValue={0.3}
                unit="s"
                color="#10b981"
                onChange={(v) => update({ filterEnv: { ...cfg.filterEnv, decay: v } })}
              />
              <Knob
                label="Sustain"
                value={cfg.filterEnv.sustain}
                min={0}
                max={1}
                step={0.02}
                defaultValue={0.3}
                color="#10b981"
                onChange={(v) => update({ filterEnv: { ...cfg.filterEnv, sustain: v } })}
              />
              <Knob
                label="Release"
                value={cfg.filterEnv.release}
                min={0.02}
                max={3.0}
                step={0.02}
                defaultValue={0.3}
                unit="s"
                color="#10b981"
                onChange={(v) => update({ filterEnv: { ...cfg.filterEnv, release: v } })}
              />
            </div>
          </div>
        </div>

        {/* Module 4: FX Rack */}
        <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-pink-400" /> ALGORITHMIC FX RACK
          </div>

          <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
            <span className="text-[10px] font-mono text-amber-400 font-bold">OVERDRIVE & DELAY</span>
            <div className="grid grid-cols-3 gap-1">
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
                label="Dly Time"
                value={cfg.delayTime}
                min={0.05}
                max={1.0}
                step={0.02}
                defaultValue={0.28}
                unit="s"
                color="#38bdf8"
                onChange={(v) => update({ delayTime: v })}
              />
              <Knob
                label="Dly Wet"
                value={cfg.delayWet}
                min={0}
                max={1}
                step={0.02}
                defaultValue={0.3}
                color="#38bdf8"
                onChange={(v) => update({ delayWet: v })}
              />
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
            <span className="text-[10px] font-mono text-purple-400 font-bold">PROCEDURAL REVERB</span>
            <div className="grid grid-cols-2 gap-2">
              <Knob
                label="Decay"
                value={cfg.reverbDecay}
                min={0.5}
                max={5.0}
                step={0.1}
                defaultValue={2.5}
                unit="s"
                color="#c084fc"
                onChange={(v) => update({ reverbDecay: v })}
              />
              <Knob
                label="Rvb Wet"
                value={cfg.reverbWet}
                min={0}
                max={1}
                step={0.02}
                defaultValue={0.25}
                color="#c084fc"
                onChange={(v) => update({ reverbWet: v })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
