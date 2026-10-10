import React, { useState, useEffect } from 'react';
import { DJMixer } from '../dj/DJMixer';
import { Headphones, Speaker, Sliders, Maximize2, X, Check } from 'lucide-react';

interface AudioRoutingConfigModalProps {
  isStandbyMode?: boolean;
  accentColor?: string;
  onPowerOn?: () => void;
  onClose?: () => void;
  autoFullscreen?: boolean;
  onChangeAutoFullscreen?: (val: boolean) => void;
}

export const AudioRoutingConfigModal: React.FC<AudioRoutingConfigModalProps> = ({
  isStandbyMode = false,
  accentColor = '#00ff88',
  onPowerOn,
  onClose,
  autoFullscreen = false,
  onChangeAutoFullscreen,
}) => {
  const mixer = DJMixer.getInstance();

  const [routingMode, setRoutingMode] = useState<
    'separate-devices' | 'split-stereo' | 'multichannel' | 'stereo'
  >(mixer.routingMode);

  useEffect(() => {
    const update = () => {
      setRoutingMode(mixer.routingMode);
    };

    const unsubscribe = mixer.subscribe(update);
    return unsubscribe;
  }, [mixer]);

  // Allow user to press Enter to Power On when in standby mode
  useEffect(() => {
    if (!isStandbyMode || !onPowerOn) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        onPowerOn();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStandbyMode, onPowerOn]);

  const handleSelectMode = (mode: 'stereo' | 'separate-devices' | 'split-stereo' | 'multichannel') => {
    setRoutingMode(mode);
    mixer.setRoutingMode(mode);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none">
      {/* Matte Black Precision Chassis */}
      <div className="w-full max-w-md rounded-2xl border border-[#1b1d28] bg-[#090a0f] text-neutral-200 shadow-[0_25px_60px_rgba(0,0,0,0.95)] p-5 space-y-4 relative">
        {/* Chassis Top Plate: Status Tally + Title */}
        <div className="flex items-center justify-between pb-3 border-b border-[#161822]">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isStandbyMode
                  ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse'
                  : ''
              }`}
              style={{
                backgroundColor: !isStandbyMode ? accentColor : undefined,
                boxShadow: !isStandbyMode ? `0 0 8px ${accentColor}` : undefined,
              }}
            />
            <span className="font-mono font-black text-xs tracking-widest text-neutral-300 uppercase">
              {isStandbyMode ? 'SYSTEM STANDBY' : 'AUDIO ROUTING'}
            </span>
          </div>

          {!isStandbyMode && onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-[#161822] transition-colors cursor-pointer border border-transparent hover:border-[#262838]"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 3-Way Hardware Selector Module (Matte Black Tactical Chips) */}
        <div className="grid grid-cols-3 gap-2 bg-[#050609] p-1.5 rounded-xl border border-[#151722] shadow-inner">
          {/* 1. Stereo */}
          <button
            type="button"
            onClick={() => handleSelectMode('stereo')}
            className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-lg transition-all cursor-pointer border ${
              routingMode === 'stereo'
                ? 'border-[#2d3248] bg-[#121420] text-white shadow-sm'
                : 'border-transparent bg-transparent text-neutral-500 hover:text-neutral-300 hover:bg-[#0c0d14]'
            }`}
          >
            <Speaker className={`w-4 h-4 mb-1 ${routingMode === 'stereo' ? 'text-emerald-400' : 'text-neutral-500'}`} />
            <span className="font-mono font-black text-[10px] tracking-wider uppercase">STEREO</span>
            <span className="text-[8px] font-mono text-neutral-500 uppercase tracking-tighter">MAIN OUT</span>
          </button>

          {/* 2. Cue Split / Splitter Cable */}
          <button
            type="button"
            onClick={() => handleSelectMode('split-stereo')}
            className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-lg transition-all cursor-pointer border ${
              routingMode === 'split-stereo'
                ? 'border-[#2d3248] bg-[#121420] text-white shadow-sm'
                : 'border-transparent bg-transparent text-neutral-500 hover:text-neutral-300 hover:bg-[#0c0d14]'
            }`}
          >
            <Headphones className={`w-4 h-4 mb-1 ${routingMode === 'split-stereo' ? 'text-amber-400' : 'text-neutral-500'}`} />
            <span className="font-mono font-black text-[10px] tracking-wider uppercase">CUE SPLIT</span>
            <span className="text-[8px] font-mono text-neutral-500 uppercase tracking-tighter">SPLITTER CABLE</span>
          </button>

          {/* 3. Multi-Device / Multi-Out (Under Development) */}
          <button
            type="button"
            onClick={() => handleSelectMode('separate-devices')}
            className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-lg transition-all cursor-pointer border ${
              routingMode === 'separate-devices' || routingMode === 'multichannel'
                ? 'border-[#2d3248] bg-[#121420] text-white shadow-sm'
                : 'border-transparent bg-transparent text-neutral-500 hover:text-neutral-300 hover:bg-[#0c0d14]'
            }`}
          >
            <Sliders className={`w-4 h-4 mb-1 ${routingMode === 'separate-devices' || routingMode === 'multichannel' ? 'text-cyan-400' : 'text-neutral-500'}`} />
            <span className="font-mono font-black text-[10px] tracking-wider uppercase">MULTI-DEV</span>
            <span className="text-[7.5px] font-mono text-amber-500/90 font-bold uppercase tracking-tighter">UNDER DEV</span>
          </button>
        </div>

        {/* Device Routing Bay */}
        {routingMode === 'split-stereo' && (
          <div className="p-3 rounded-xl bg-[#06070a] border border-[#171924] space-y-2 shadow-inner">
            <span className="text-[9px] font-mono font-bold text-neutral-400 uppercase tracking-wider block">
              HARDWARE SPLITTER CABLE ROUTING:
            </span>
            <div className="grid grid-cols-2 gap-2 text-[9.5px] font-mono pt-0.5 text-neutral-300">
              <div className="flex items-center gap-1.5 p-2 rounded bg-[#0b0c14] border border-[#1a1c28]">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span>LEFT CH: MASTER OUT</span>
              </div>
              <div className="flex items-center gap-1.5 p-2 rounded bg-[#0b0c14] border border-[#1a1c28]">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span>RIGHT CH: CUE PHONES</span>
              </div>
            </div>
            <p className="text-[8.5px] font-mono text-neutral-500 pt-1 leading-relaxed">
              Connect a standard DJ mono-split cable to your 3.5mm jack for simultaneous headphone cueing and master sound system output with zero extra hardware.
            </p>
          </div>
        )}

        {(routingMode === 'separate-devices' || routingMode === 'multichannel') && (
          <div className="p-3.5 rounded-xl bg-[#06070a] border border-amber-900/30 space-y-2 text-center">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[9px] font-mono font-bold uppercase tracking-wider">
              <span>FEATURE UNDER ACTIVE DEVELOPMENT</span>
            </div>
            <p className="text-[9.5px] font-mono text-neutral-400 leading-relaxed pt-1">
              Multi-channel soundcard routing and dual-device output are currently in development. Please use standard <strong>Stereo</strong> or <strong>Cue Split (Splitter Cable)</strong> for live headphone auditioning.
            </p>
          </div>
        )}

        {/* Go Fullscreen Toggle Pill (Standby Mode) */}
        {isStandbyMode && (
          <div
            onClick={() => onChangeAutoFullscreen && onChangeAutoFullscreen(!autoFullscreen)}
            className="flex items-center justify-between p-2.5 rounded-xl bg-[#06070a] border border-[#171924] cursor-pointer hover:border-[#262838] transition-all"
          >
            <div className="flex items-center gap-2">
              <Maximize2 className="w-3.5 h-3.5 text-neutral-400" />
              <span className="font-mono font-bold text-[10px] text-neutral-300 uppercase tracking-wider">
                FULLSCREEN
              </span>
            </div>
            <div
              className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                autoFullscreen
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                  : 'border-[#282a3c] bg-[#10111a] text-transparent'
              }`}
            >
              <Check className="w-3 h-3 stroke-[3]" />
            </div>
          </div>
        )}

        {/* Action Button: Authentic Hardware [ POWER ON ] or [ APPLY ] */}
        {isStandbyMode ? (
          <button
            onClick={onPowerOn}
            className="w-full py-3 px-4 rounded-xl font-mono font-black text-xs uppercase tracking-widest transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2 border border-[#3b1d22] text-white hover:text-white"
            style={{
              background: 'radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.35) 0%, rgba(185, 28, 28, 0.15) 60%, #12090b 100%)',
              boxShadow: 'inset 0 0 12px rgba(239, 68, 68, 0.4), 0 0 14px rgba(239, 68, 68, 0.25)',
              textShadow: '0 0 6px rgba(239, 68, 68, 0.8)',
            }}
          >
            <span>LAUNCH DJ</span>
          </button>
        ) : (
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-[#121420] hover:bg-[#1a1d2c] border border-[#262838] hover:border-[#383d54] text-neutral-200 hover:text-white font-mono font-black text-[11px] uppercase tracking-wider transition-all cursor-pointer shadow-sm"
          >
            APPLY
          </button>
        )}
      </div>
    </div>
  );
};
