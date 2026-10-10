import React, { useRef, useEffect, useState } from 'react';
import { AudioEngine } from '../audio/AudioEngine';

interface ChassisOLEDProps {
  accentColor?: string;
}

export const ChassisOLED: React.FC<ChassisOLEDProps> = ({ accentColor = '#38bdf8' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [chordName, setChordName] = useState<string>('Em');
  const [energyLevel, setEnergyLevel] = useState<number>(50);
  const [bpm, setBpm] = useState<number>(110);
  const [styleName, setStyleName] = useState<string>('GROOVE');

  useEffect(() => {
    const engine = AudioEngine.getInstance();
    const update = () => {
      if (engine.accompaniment) {
        setChordName(engine.accompaniment.detectedChord.name);
        setEnergyLevel(Math.round(engine.accompaniment.userEnergy * 100));
        setBpm(engine.accompaniment.bpm);
        setStyleName(engine.accompaniment.style.toUpperCase());
      }
    };

    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, []);

  // Smooth oscilloscope rendering loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const engine = AudioEngine.getInstance();
    const timeData = new Uint8Array(256);

    const render = () => {
      animId = requestAnimationFrame(render);
      const w = canvas.width;
      const h = canvas.height;

      // Deep OLED black background
      ctx.fillStyle = '#06070a';
      ctx.fillRect(0, 0, w, h);

      // Subtle horizontal baseline
      ctx.strokeStyle = '#181a24';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (!engine.analyser || !engine.isInitialized) {
        ctx.strokeStyle = '#33384a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        return;
      }

      engine.analyser.getByteTimeDomainData(timeData);

      // Draw crisp OLED waveform
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.8;
      ctx.shadowBlur = 4;
      ctx.shadowColor = accentColor;

      ctx.beginPath();
      const sliceWidth = w / 256;
      let x = 0;

      for (let i = 0; i < 256; i++) {
        const v = timeData[i] / 128.0;
        const y = (v * h) / 2;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [accentColor]);

  return (
    <div className="relative rounded-xl border border-[#232530] bg-[#07080d] p-3 shadow-inner">
      {/* Top OLED Status Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-[#181a24] text-[10px] font-mono">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-neutral-400 font-bold uppercase tracking-wider">LIVE ACCOMPANIST</span>
          <span className="px-1.5 py-0.5 rounded bg-[#13151f] text-emerald-300 border border-emerald-900/60 font-bold">
            {styleName}
          </span>
        </div>

        <div className="flex items-center gap-3 text-neutral-400">
          <div>
            CHORD: <span className="text-amber-400 font-black">{chordName}</span>
          </div>
          <div>
            DYN: <span className="text-cyan-400 font-bold">{energyLevel}%</span>
          </div>
          <div>
            TEMPO: <span className="text-neutral-200 font-bold">{bpm}</span>
          </div>
        </div>
      </div>

      {/* Main Waveform Screen */}
      <div className="relative w-full h-20 pt-1">
        <canvas
          ref={canvasRef}
          width={600}
          height={80}
          className="w-full h-full block rounded"
        />
        <div className="absolute bottom-1 left-2 pointer-events-none text-[8px] font-mono text-neutral-600">
          ANALOG MODELING &middot; ZERO SAMPLES &middot; LIVE ACOUSTICS
        </div>
      </div>
    </div>
  );
};
