import React, { useState, useEffect } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import { MUSICAL_SCALES } from '../audio/scales';
import { NOTE_NAMES } from '../audio/synthPhysics';
import { Sparkles, Volume2, VolumeX, Play, Square } from 'lucide-react';

export const SequencerView: React.FC = () => {
  const engine = AudioEngine.getInstance();
  const [, setTick] = useState(0);
  const [selectedScale, setSelectedScale] = useState('cyber_insen');
  const [selectedRoot, setSelectedRoot] = useState('D');

  useEffect(() => {
    const unsub = engine.subscribe(() => {
      setTick((t) => t + 1);
    });
    return unsub;
  }, [engine]);

  const seq = engine.sequencer;
  if (!seq) return null;

  const handleTogglePlay = async () => {
    if (!engine.isInitialized) {
      await engine.initialize();
    }
    if (seq.isPlaying) {
      seq.stop();
    } else {
      seq.start();
    }
    setTick((t) => t + 1);
  };

  const handleMutate = async () => {
    if (!engine.isInitialized) {
      await engine.initialize();
    }
    seq.mutateAll(selectedScale, selectedRoot);
    setTick((t) => t + 1);
  };

  const handleToggleStep = (trackId: string, stepIndex: number) => {
    seq.toggleStep(trackId, stepIndex);
    setTick((t) => t + 1);
  };

  const handleToggleMute = (trackId: string) => {
    seq.toggleMute(trackId);
    setTick((t) => t + 1);
  };

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-slate-950/80 backdrop-blur-md p-4 shadow-lg shadow-cyan-950/30">
      {/* Sequencer Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          {/* Transport Play/Stop */}
          <button
            onClick={handleTogglePlay}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-xs font-bold uppercase transition-all shadow-md ${
              seq.isPlaying
                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/40 animate-pulse'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/40'
            }`}
          >
            {seq.isPlaying ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" /> Stop
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" /> Play Loop
              </>
            )}
          </button>

          {/* BPM */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1">
            <span className="text-[10px] font-mono text-slate-400">BPM</span>
            <input
              type="number"
              min="50"
              max="220"
              value={seq.bpm}
              onChange={(e) => {
                seq.bpm = Number(e.target.value);
                setTick((t) => t + 1);
              }}
              className="w-12 bg-transparent text-cyan-300 font-mono text-xs font-bold focus:outline-none"
            />
          </div>
        </div>

        {/* Generative & Scale Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Root Note */}
          <select
            value={selectedRoot}
            onChange={(e) => setSelectedRoot(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-slate-200 text-xs font-mono rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-400"
          >
            {NOTE_NAMES.map((n) => (
              <option key={n} value={n}>
                Root: {n}
              </option>
            ))}
          </select>

          {/* Scale */}
          <select
            value={selectedScale}
            onChange={(e) => setSelectedScale(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-slate-200 text-xs font-mono rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-400"
          >
            {MUSICAL_SCALES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Algorithmic Mutate Button */}
          <button
            onClick={handleMutate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white rounded-lg text-xs font-mono font-bold shadow-lg shadow-pink-500/30 transition-all active:scale-95"
            title="Algorithmically generate new Euclidean beats and modal melodies"
          >
            <Sparkles className="w-3.5 h-3.5 animate-spin" />
            Mutate (Algorithmic Gen)
          </button>
        </div>
      </div>

      {/* 16-Step Matrix */}
      <div className="overflow-x-auto">
        <div className="min-w-[640px] space-y-1.5">
          {/* Step Numbers Header */}
          <div className="flex items-center gap-1 text-[9px] font-mono text-slate-500 pl-36">
            {Array.from({ length: 16 }).map((_, i) => (
              <div
                key={i}
                className={`w-7 text-center ${
                  i % 4 === 0 ? 'text-cyan-400 font-bold' : ''
                } ${seq.isPlaying && seq.currentStep === i ? 'text-pink-400 font-black' : ''}`}
              >
                {i + 1}
              </div>
            ))}
          </div>

          {/* Tracks */}
          {seq.tracks.map((track) => (
            <div key={track.id} className="flex items-center gap-2 group">
              {/* Track Info & Mute */}
              <div className="w-34 flex items-center justify-between bg-slate-900/90 rounded px-2 py-1.5 border border-slate-800">
                <span className="text-[11px] font-mono font-medium text-slate-300 truncate max-w-[85px]">
                  {track.name}
                </span>
                <button
                  onClick={() => handleToggleMute(track.id)}
                  className={`p-0.5 rounded transition-colors ${
                    track.muted
                      ? 'text-rose-400 bg-rose-950/50'
                      : 'text-slate-400 hover:text-cyan-300'
                  }`}
                  title={track.muted ? 'Unmute' : 'Mute'}
                >
                  {track.muted ? (
                    <VolumeX className="w-3 h-3" />
                  ) : (
                    <Volume2 className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* 16 Steps */}
              <div className="flex items-center gap-1 flex-1">
                {track.steps.map((active, stepIdx) => {
                  const isCurrent = seq.isPlaying && seq.currentStep === stepIdx;
                  const isBeatQuarter = stepIdx % 4 === 0;

                  return (
                    <button
                      key={stepIdx}
                      onClick={() => handleToggleStep(track.id, stepIdx)}
                      className={`h-7 w-7 rounded border text-[8px] font-mono font-bold flex items-center justify-center transition-all ${
                        active
                          ? track.type.startsWith('synth')
                            ? 'bg-purple-500 border-purple-400 text-white shadow-sm shadow-purple-500/50'
                            : 'bg-cyan-500 border-cyan-300 text-slate-950 shadow-sm shadow-cyan-500/50'
                          : isBeatQuarter
                          ? 'bg-slate-800/80 border-slate-700/80 text-slate-500 hover:bg-slate-700'
                          : 'bg-slate-900/60 border-slate-800/60 text-slate-600 hover:bg-slate-800'
                      } ${
                        isCurrent
                          ? 'ring-2 ring-pink-400 scale-105 z-10 brightness-150'
                          : ''
                      }`}
                    >
                      {active && track.notes && track.notes[stepIdx] ? (
                        <span className="scale-75 leading-none">
                          {track.notes[stepIdx].slice(0, 2)}
                        </span>
                      ) : active ? (
                        '●'
                      ) : (
                        ''
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
