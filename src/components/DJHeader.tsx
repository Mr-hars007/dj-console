import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DJMixer } from '../dj/DJMixer';
import { Power, Disc, CircleDot, Volume2, Volume1, VolumeX, Headphones, Smartphone, Monitor, Palette } from 'lucide-react';
import { RGB_THEMES } from './HardwareHeader';
import type { RGBTheme } from './HardwareHeader';

function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

interface DJHeaderProps {
  activeTheme: RGBTheme;
  onSelectTheme: (theme: RGBTheme) => void;
  masterEnergy?: number;
  onOpenAudioConfig?: () => void;
  isMobileMode?: boolean;
  onToggleMobileMode?: () => void;
  activeMobileDeck?: 'A' | 'B';
  onSelectMobileDeck?: (deck: 'A' | 'B') => void;
}

export const DJHeader: React.FC<DJHeaderProps> = ({
  activeTheme,
  onSelectTheme,
  masterEnergy,
  onOpenAudioConfig,
  isMobileMode = false,
  onToggleMobileMode,
}) => {
  const mixer = DJMixer.getInstance();
  const [isPowerOn, setIsPowerOn] = useState(mixer.isPoweredOn);
  const [isRecording, setIsRecording] = useState(mixer.isRecording);
  const [masterVol, setMasterVol] = useState(mixer.masterVolume);
  const [prevNonZeroVol, setPrevNonZeroVol] = useState(1.0);
  const [isVolDragging, setIsVolDragging] = useState(false);
  const [isThemePopupOpen, setIsThemePopupOpen] = useState(false);
  const themePopupRef = useRef<HTMLDivElement>(null);
  const masterTrackRef = useRef<HTMLDivElement>(null);
  const energy = masterEnergy ?? 0;

  // Close theme popup on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themePopupRef.current && !themePopupRef.current.contains(e.target as Node)) {
        setIsThemePopupOpen(false);
      }
    };
    if (isThemePopupOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isThemePopupOpen]);

  useEffect(() => {
    const unsub = mixer.subscribe(() => {
      setIsPowerOn(mixer.isPoweredOn);
      setIsRecording(mixer.isRecording);
      setMasterVol(mixer.masterVolume);
    });
    return unsub;
  }, [mixer]);

  const updateMasterVolFromPointer = useCallback(
    (clientX: number) => {
      const track = masterTrackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const clampedX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const ratio = clampedX / rect.width;
      let raw = ratio * 1.2; // range 0 to 1.2

      // Subtle magnetic clipping physics: snaps to 100% (1.0) and 0% (0.0)
      if (Math.abs(raw - 1.0) < 0.035) {
        raw = 1.0;
      } else if (raw < 0.03) {
        raw = 0.0;
      } else {
        raw = Math.round(raw / 0.01) * 0.01;
      }

      raw = Math.max(0, Math.min(1.2, Number(raw.toFixed(2))));
      setMasterVol(raw);
      if (raw > 0) setPrevNonZeroVol(raw);
      mixer.setMasterVolume(raw);
    },
    [mixer]
  );

  const toggleMute = () => {
    if (!isPowerOn) return;
    if (masterVol > 0) {
      setPrevNonZeroVol(masterVol);
      setMasterVol(0);
      mixer.setMasterVolume(0);
    } else {
      const restored = prevNonZeroVol > 0 ? prevNonZeroVol : 1.0;
      setMasterVol(restored);
      mixer.setMasterVolume(restored);
    }
  };

  const togglePower = async () => {
    await mixer.togglePower();
  };

  const toggleRecording = () => {
    if (!isPowerOn || !mixer.isInitialized) return;
    if (mixer.isRecording) {
      mixer.stopRecording();
    } else {
      mixer.startRecording();
    }
  };

  return (
    <header className="relative w-full py-2 px-3 sm:px-5 border-b border-[#24273c]/80 bg-[#0d0f1b]/80 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.5)] z-50 shrink-0 overflow-visible">
      {/* Layer 1: Diffused Ambient RGB Aura (Behind Controls, Audio-Reactive, Paired Color A + Color B) */}
      <div
        className="absolute inset-0 pointer-events-none -z-10 transition-opacity duration-200"
        style={{
          opacity: isPowerOn ? (activeTheme.id === 'stealth' ? 0.05 : 1) : 0,
        }}
      >
        {/* Left Ambient Aura (Deck A Color) */}
        <div
          className="absolute inset-0 transition-opacity duration-150"
          style={{
            background: `radial-gradient(ellipse 45% 90% at 12% 20%, ${hexToRgba(activeTheme.colorA, 0.16 + energy * 0.22)} 0%, transparent 75%)`,
          }}
        />
        {/* Right Ambient Aura (Deck B Color) */}
        <div
          className="absolute inset-0 transition-opacity duration-150"
          style={{
            background: `radial-gradient(ellipse 45% 90% at 88% 20%, ${hexToRgba(activeTheme.colorB, 0.16 + energy * 0.22)} 0%, transparent 75%)`,
          }}
        />
        {/* Horizontal panoramic ambient bridge blending Color A and Color B */}
        <div
          className="absolute inset-0 transition-opacity duration-150"
          style={{
            background: `linear-gradient(90deg, ${hexToRgba(activeTheme.colorA, 0.1 + energy * 0.14)} 0%, ${hexToRgba(activeTheme.colorA, 0.03 + energy * 0.05)} 25%, transparent 50%, ${hexToRgba(activeTheme.colorB, 0.03 + energy * 0.05)} 75%, ${hexToRgba(activeTheme.colorB, 0.1 + energy * 0.14)} 100%)`,
          }}
        />
      </div>

      {/* Layer 2: Glowing Bottom LED Light-Guide Strip (Dual-Color Laser Seam) */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px] pointer-events-none transition-all duration-150"
        style={{
          background:
            !isPowerOn
              ? '#141522'
              : activeTheme.id === 'stealth'
              ? 'linear-gradient(90deg, transparent 0%, #3f3f46 30%, #3f3f46 70%, transparent 100%)'
              : `linear-gradient(90deg, ${activeTheme.colorA} 0%, ${hexToRgba(activeTheme.colorA, 0.6)} 25%, rgba(255,255,255,0.4) 50%, ${hexToRgba(activeTheme.colorB, 0.6)} 75%, ${activeTheme.colorB} 100%)`,
          boxShadow:
            !isPowerOn || activeTheme.id === 'stealth'
              ? 'none'
              : `0 0 ${8 + energy * 12}px ${hexToRgba(activeTheme.colorA, 0.5)}, 0 0 ${12 + energy * 16}px ${hexToRgba(activeTheme.colorB, 0.5)}`,
        }}
      />

      {/* Layer 3: Foreground Content (Sitting above RGB layers with contrast-shielded pods) */}
      <div className="relative z-10 w-full flex items-center justify-between gap-3">
        {/* Brand & Hardware Power */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <button
            onClick={togglePower}
            className={`relative group flex items-center justify-center ${
              isMobileMode ? 'w-[68px] h-9 ml-0.5 sm:ml-1' : 'w-9 h-9 sm:w-9.5 sm:h-9.5'
            } rounded-lg border transition-colors duration-150 cursor-pointer ${
              isPowerOn
                ? 'border-[#2e3248] bg-[#0c0d16] text-rose-500 hover:border-[#3d4260]'
                : 'border-[#222538] bg-[#0c0d16] text-rose-400/80 hover:text-rose-400 hover:border-rose-900/60'
            }`}
            title={isPowerOn ? 'Power Off' : 'Power On (Standby Backlight)'}
          >
            <Power
              className="w-4.5 h-4.5"
            />
          </button>

          <div className="flex items-center justify-center gap-2.5 bg-[#090a14]/90 backdrop-blur-md px-3 py-1.5 h-9 sm:h-9.5 rounded-lg border border-[#202334] shadow-sm shrink-0">
            <span
              className="font-mono font-black text-sm tracking-widest uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
              style={{ color: activeTheme.colorA }}
            >
              DJ
            </span>

            {/* Red Hardware Tally Light (Subtle studio LED) */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-[#24273c]" title={isPowerOn ? 'LIVE' : 'STANDBY'}>
              <div
                className={`w-2 h-2 rounded-full transition-all duration-75 ${
                  isPowerOn
                    ? 'bg-rose-500 shadow-[0_0_4px_rgba(244,63,94,0.4)]'
                    : 'bg-rose-950/60 border border-rose-900/40 opacity-40'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Theme Selector Pop-Up Trigger - Only visible when DJ is powered on */}
          {isPowerOn && (
            <div className="relative" ref={themePopupRef}>
              <button
                onClick={() => setIsThemePopupOpen(!isThemePopupOpen)}
                className={`flex items-center justify-center gap-1.5 h-9 sm:h-9.5 ${
                  isMobileMode ? 'w-[68px]' : 'w-26 sm:w-28'
                } rounded-lg border transition-all cursor-pointer shadow-sm active:scale-95 ${
                  isThemePopupOpen
                    ? 'bg-[#181a28] border-[#3e4360] text-white'
                    : 'bg-[#090a14]/90 backdrop-blur-md border-[#202334] text-neutral-300 hover:text-white hover:border-[#33374f]'
                }`}
                title="Aura & LED Theme"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${activeTheme.colorA} 50%, ${activeTheme.colorB} 50%)`,
                    boxShadow: activeTheme.id === 'stealth' ? 'none' : `0 0 6px ${activeTheme.colorA}`,
                  }}
                />
                <Palette className="w-4 h-4 text-rose-400" />
                {!isMobileMode && (
                  <span className="hidden sm:inline font-mono text-[11px] font-bold text-neutral-300">THEME</span>
                )}
              </button>

              {/* Theme Pop-up Menu */}
              {isThemePopupOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 py-1.5 rounded-xl bg-[#0d0f1b]/95 backdrop-blur-xl border border-[#2a2e45] shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1 border-b border-[#1f2235] text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-wider">
                    AURA & LED THEME
                  </div>
                  <div className="py-1 max-h-60 overflow-y-auto">
                    {RGB_THEMES.map((t) => {
                      const isSelected = t.id === activeTheme.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => {
                            onSelectTheme(t);
                            setIsThemePopupOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs font-mono transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#1c2033] text-white font-bold'
                              : 'text-neutral-300 hover:bg-[#151726] hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{
                                background: `linear-gradient(135deg, ${t.colorA} 50%, ${t.colorB} 50%)`,
                                boxShadow: isSelected ? `0 0 6px ${t.colorA}` : 'none',
                              }}
                            />
                            <span className="truncate">{t.name}</span>
                          </div>
                          {isSelected && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Master Output Volume Control Pod (Hidden on Mobile / Single-Deck mode) */}
          {!isMobileMode && (
            <div
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border shadow-sm transition-all ${
                isPowerOn
                  ? 'bg-[#090a14]/90 backdrop-blur-md border-[#202334]'
                  : 'bg-[#10121d] border-[#222638]'
              }`}
            >
              <button
                onClick={toggleMute}
                disabled={!isPowerOn}
                className={`transition-colors flex items-center justify-center ${
                  isPowerOn
                    ? 'text-neutral-300 hover:text-white cursor-pointer'
                    : 'text-neutral-500 cursor-default pointer-events-none'
                }`}
                title={!isPowerOn ? 'Master Volume (Powered Off)' : masterVol === 0 ? 'Unmute' : 'Mute'}
              >
                {!isPowerOn ? (
                  <Volume2 className="w-3.5 h-3.5 text-neutral-500" />
                ) : masterVol === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                ) : masterVol > 0.5 ? (
                  <Volume2 className="w-3.5 h-3.5 text-neutral-200" />
                ) : (
                  <Volume1 className="w-3.5 h-3.5 text-neutral-200" />
                )}
              </button>

              {/* Precision Track */}
              <div
                ref={masterTrackRef}
                onPointerDown={(e) => {
                  if (!isPowerOn) return;
                  e.preventDefault();
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch (_) {}
                  setIsVolDragging(true);
                  updateMasterVolFromPointer(e.clientX);
                }}
                onPointerMove={(e) => {
                  if (!isPowerOn) return;
                  if (isVolDragging) updateMasterVolFromPointer(e.clientX);
                }}
                onPointerUp={(e) => {
                  try {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  } catch (_) {}
                  setIsVolDragging(false);
                }}
                onDoubleClick={() => {
                  if (!isPowerOn) return;
                  setMasterVol(1.0);
                  mixer.setMasterVolume(1.0);
                }}
                className={`relative w-24 sm:w-32 h-4 flex items-center select-none group touch-none ${
                  isPowerOn ? 'cursor-pointer' : 'cursor-default pointer-events-none'
                }`}
                title={
                  !isPowerOn
                    ? 'Master Volume (Powered Off)'
                    : `Master Volume: ${Math.round(masterVol * 100)}% (Double click for 100%)`
                }
              >
                {/* Recessed Track Well */}
                <div
                  className={`w-full h-2 rounded-full overflow-hidden relative shadow-inner border ${
                    isPowerOn ? 'bg-[#050609] border-[#1d1f2c]' : 'bg-[#08090f] border-[#1a1c29]'
                  }`}
                >
                  {/* Active illuminated LED level fill */}
                  <div
                    className={`h-full rounded-full overflow-hidden relative ${
                      isVolDragging ? 'transition-all duration-75' : 'transition-[width,opacity,box-shadow] duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]'
                    }`}
                    style={{
                      width: isPowerOn ? `${Math.min(100, (masterVol / 1.2) * 100)}%` : '0%',
                      opacity: isPowerOn ? 1 : 0,
                      boxShadow:
                        !isPowerOn
                          ? 'none'
                          : masterVol > 1.0
                          ? '0 0 8px rgba(239, 68, 68, 0.5)'
                          : masterVol > 0.85
                          ? '0 0 8px rgba(234, 179, 8, 0.5)'
                          : masterVol > 0
                          ? '0 0 8px rgba(0, 255, 136, 0.4)'
                          : undefined,
                    }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 w-20 sm:w-26"
                      style={{
                        background:
                          'linear-gradient(90deg, #10b981 0%, #00ff88 55%, #eab308 80%, #ef4444 100%)',
                      }}
                    />
                  </div>
                  {/* 100% Unity tick mark */}
                  <div
                    className={`absolute top-0 bottom-0 w-[1px] ${
                      isPowerOn ? 'bg-neutral-500/60' : 'bg-neutral-600/40'
                    }`}
                    style={{ left: `${(1.0 / 1.2) * 100}%` }}
                  />
                </div>

                {/* Tactile Slider Cap */}
                <div
                  className={`absolute top-0 bottom-0 w-3 rounded-xs pointer-events-none -translate-x-1/2 flex items-center justify-center ${
                    !isPowerOn
                      ? 'shadow-none transition-[left,background,border] duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]'
                      : isVolDragging
                      ? 'transition-shadow shadow-[0_0_10px_rgba(255,255,255,0.4)] scale-110'
                      : 'transition-[left,shadow,background,border] duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] shadow-[0_2px_6px_rgba(0,0,0,0.9)]'
                  }`}
                  style={{
                    left: isPowerOn ? `${(masterVol / 1.2) * 100}%` : '0%',
                    background: isPowerOn
                      ? 'linear-gradient(180deg, #323546 0%, #171824 50%, #10111a 100%)'
                      : 'linear-gradient(180deg, #242738 0%, #141622 100%)',
                    borderTop: isPowerOn ? '1px solid #4f536c' : '1px solid #32364c',
                    borderBottom: isPowerOn ? '1px solid #050609' : '1px solid #0b0c13',
                    borderLeft: isPowerOn ? '1px solid #232533' : '1px solid #212435',
                    borderRight: isPowerOn ? '1px solid #232533' : '1px solid #212435',
                  }}
                >
                  <div
                    className={`w-[1px] h-2.5 rounded-full ${
                      !isPowerOn
                        ? 'bg-neutral-500'
                        : Math.abs(masterVol - 1.0) < 0.01
                        ? 'bg-emerald-400 shadow-[0_0_4px_#00ff88]'
                        : 'bg-white'
                    }`}
                  />
                </div>
              </div>

              {/* Numeric Readout */}
              <span
                className={`text-[10px] font-mono font-black w-8 text-right ${
                  isPowerOn
                    ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]'
                    : 'text-neutral-500 drop-shadow-none'
                }`}
              >
                {!isPowerOn ? 'OFF' : masterVol === 0 ? '0%' : `${Math.round(masterVol * 100)}%`}
              </span>
            </div>
          )}

          {/* Master DJ Mix Recorder Button */}
          <button
            onClick={toggleRecording}
            disabled={!isPowerOn}
            className={`flex items-center justify-center gap-1.5 h-9 sm:h-9.5 ${
              isMobileMode ? 'w-[68px]' : 'w-26 sm:w-28'
            } rounded-lg border transition-all cursor-pointer shadow-sm active:scale-95 ${
              !isPowerOn
                ? 'bg-[#10121d] border-[#222638] text-neutral-500 cursor-default pointer-events-none'
                : isRecording
                ? 'border-rose-500/80 bg-rose-950/40 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.35)]'
                : 'bg-[#090a14]/90 border-[#23263b] text-neutral-300 hover:text-white hover:border-[#383d58]'
            }`}
            title={!isPowerOn ? 'Record (Powered Off)' : isRecording ? 'Stop Recording (Saving mix)' : 'Start Recording Master Mix'}
          >
            {isRecording ? (
              <Disc className="w-4 h-4 fill-current animate-spin text-rose-400" />
            ) : (
              <CircleDot className={`w-4 h-4 ${isPowerOn ? 'text-rose-400' : 'text-neutral-500'}`} />
            )}
            {!isMobileMode && (
              <span className="hidden sm:inline font-mono text-[11px] font-bold text-neutral-300">
                {isRecording ? 'LIVE' : 'REC'}
              </span>
            )}
          </button>

          {/* Mobile / Full Console Mode Toggle Button (Rightmost button) */}
          {onToggleMobileMode && (
            <button
              onClick={onToggleMobileMode}
              className={`flex items-center justify-center gap-1.5 h-9 sm:h-9.5 ${
                isMobileMode ? 'w-[68px] mr-0.5 sm:mr-1' : 'w-26 sm:w-28'
              } rounded-lg border font-mono text-[11px] font-black transition-all cursor-pointer shadow-sm active:scale-95 ${
                !isPowerOn
                  ? 'border-[#222638] bg-[#10121d] text-neutral-500 hover:text-neutral-400 hover:border-[#2e334a]'
                  : isMobileMode
                  ? 'border-[#3a3f58] bg-[#161826] text-neutral-200 hover:text-white hover:border-[#4c5272]'
                  : 'border-[#23263b] bg-[#090a14]/90 text-neutral-400 hover:text-neutral-200 hover:border-[#383d58]'
              }`}
              style={{
                background:
                  !isPowerOn
                    ? '#10121d'
                    : isMobileMode
                    ? 'linear-gradient(180deg, #1f2233 0%, #131522 100%)'
                    : undefined,
                boxShadow:
                  !isPowerOn
                    ? 'none'
                    : isMobileMode
                    ? 'inset 0 1px 1px rgba(255,255,255,0.08), inset 0 -1px 2px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.5)'
                    : undefined,
              }}
              title={isMobileMode ? 'Switch to Full Console (2 Decks)' : 'Switch to Mobile Mode (1 Deck)'}
            >
              {!isMobileMode && (
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${
                    !isPowerOn
                      ? 'bg-[#202334] opacity-30 ring-0 shadow-none'
                      : isMobileMode
                      ? 'bg-rose-400 shadow-[0_0_5px_rgba(244,63,94,0.55)] ring-1 ring-rose-300/40'
                      : 'bg-[#2a2e42] ring-0 shadow-none'
                  }`}
                />
              )}
              {isMobileMode ? (
                <Smartphone
                  className={`w-4 h-4 transition-colors ${
                    !isPowerOn ? 'text-neutral-500' : 'text-rose-400'
                  }`}
                />
              ) : (
                <Monitor className={`w-3.5 h-3.5 ${!isPowerOn ? 'text-neutral-500' : 'text-rose-400'}`} />
              )}
              {!isMobileMode && (
                <span className="hidden sm:inline">2 DECKS</span>
              )}
            </button>
          )}

          {/* Headphone Audio Routing Config Pod (Only shown in full desktop mode) */}
          {!isMobileMode && onOpenAudioConfig && (
            <button
              onClick={onOpenAudioConfig}
              className={`flex items-center justify-center gap-1.5 h-9 sm:h-9.5 w-26 sm:w-28 rounded-lg border font-mono text-[11px] font-black transition-all cursor-pointer shadow-sm active:scale-95 ${
                !isPowerOn
                  ? 'border-[#222638] bg-[#10121d] text-neutral-500 hover:text-neutral-400 hover:border-[#2e334a]'
                  : 'border-[#23263b] bg-[#090a14]/90 text-neutral-300 hover:text-white hover:border-[#383d58]'
              }`}
              title="Audio Routing & Headphone Preview Settings"
            >
              <Headphones
                className={`w-3.5 h-3.5 transition-colors duration-75 ${
                  isPowerOn ? 'text-rose-400' : 'text-neutral-500'
                }`}
              />
              <span className="hidden sm:inline">ROUTING</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
