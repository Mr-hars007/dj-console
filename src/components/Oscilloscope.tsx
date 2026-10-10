import React, { useRef, useEffect, useState } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import { Activity, BarChart2 } from 'lucide-react';

export const Oscilloscope: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewMode, setViewMode] = useState<'both' | 'wave' | 'fft'>('both');

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const engine = AudioEngine.getInstance();
    const bufferLength = 512;
    const timeData = new Uint8Array(bufferLength);
    const freqData = new Uint8Array(bufferLength);

    const render = () => {
      animId = requestAnimationFrame(render);

      const w = canvas.width;
      const h = canvas.height;

      // Dark CRT background with scanline grid
      ctx.fillStyle = '#060913';
      ctx.fillRect(0, 0, w, h);

      // Subtle grid
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < w; x += 30) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += 20) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      if (!engine.analyser || !engine.isInitialized) {
        // Idle straight line
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        return;
      }

      engine.analyser.getByteTimeDomainData(timeData);
      engine.analyser.getByteFrequencyData(freqData);

      // Draw FFT Bars
      if (viewMode === 'both' || viewMode === 'fft') {
        const barCount = 48;
        const barWidth = (w / barCount) - 1.5;
        for (let i = 0; i < barCount; i++) {
          const freqIndex = Math.floor((i / barCount) * 180);
          const val = freqData[freqIndex] / 255;
          const barHeight = val * (viewMode === 'fft' ? h * 0.85 : h * 0.45);

          const grad = ctx.createLinearGradient(0, h, 0, h - barHeight);
          grad.addColorStop(0, 'rgba(0, 243, 255, 0.2)');
          grad.addColorStop(1, 'rgba(255, 0, 127, 0.85)');

          ctx.fillStyle = grad;
          ctx.fillRect(i * (barWidth + 1.5), h - barHeight, barWidth, barHeight);
        }
      }

      // Draw Oscilloscope Waveform
      if (viewMode === 'both' || viewMode === 'wave') {
        const waveYOffset = viewMode === 'both' ? h * 0.35 : h * 0.5;
        const waveScale = viewMode === 'both' ? 0.6 : 0.85;

        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#00f3ff';

        ctx.beginPath();
        const sliceWidth = w / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = timeData[i] / 128.0; // 0 to 2
          const y = waveYOffset + (v - 1.0) * (h * 0.5 * waveScale);

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [viewMode]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-cyan-500/30 bg-slate-950/80 backdrop-blur-md p-3 shadow-lg shadow-cyan-950/30">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span className="text-xs font-mono font-bold tracking-widest text-cyan-300 uppercase">
            Realtime Oscilloscope / FFT
          </span>
        </div>
        <div className="flex items-center gap-1 bg-slate-900/80 rounded-lg p-0.5 border border-slate-800">
          <button
            onClick={() => setViewMode('both')}
            className={`px-2 py-0.5 text-[10px] rounded font-mono transition-colors ${
              viewMode === 'both' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Dual
          </button>
          <button
            onClick={() => setViewMode('wave')}
            className={`px-2 py-0.5 text-[10px] rounded font-mono transition-colors ${
              viewMode === 'wave' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Wave
          </button>
          <button
            onClick={() => setViewMode('fft')}
            className={`px-2 py-0.5 text-[10px] rounded font-mono transition-colors ${
              viewMode === 'fft' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart2 className="w-3 h-3 inline" /> FFT
          </button>
        </div>
      </div>

      <div className="relative w-full h-28 rounded-lg overflow-hidden border border-slate-800/80">
        <canvas
          ref={canvasRef}
          width={460}
          height={112}
          className="w-full h-full block"
        />
        <div className="absolute top-1 left-2 pointer-events-none text-[9px] font-mono text-cyan-400/50">
          0 Hz ─────── 20 kHz
        </div>
        <div className="absolute top-1 right-2 pointer-events-none text-[9px] font-mono text-pink-400/50">
          LIVE ANALYZER
        </div>
      </div>
    </div>
  );
};
