import React, { useRef, useState, useCallback, useEffect } from 'react';

interface DJHardwareFaderProps {
  orientation: 'vertical' | 'horizontal';
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  onChange: (value: number) => void;
  accentColor?: string;
  scale?: 'volume' | 'tempo' | 'crossfader';
  heightPx?: number;
  widthPx?: number;
  className?: string;
  title?: string;
  isPoweredOn?: boolean;
}

export const DJHardwareFader: React.FC<DJHardwareFaderProps> = ({
  orientation,
  value,
  min,
  max,
  step = 0.01,
  defaultValue,
  onChange,
  accentColor = '#ffffff',
  scale = 'volume',
  heightPx,
  widthPx,
  className = '',
  title = '',
  isPoweredOn = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

  // Motorized aircraft-style motorized fader power glide:
  // When off: vertical volume/tempo faders glide down to min (lowest),
  // while the crossfader glides to its center home detent (0.0).
  // When on: smoothly glides back to user-adjusted value.
  const offRestValue = scale === 'crossfader' ? (defaultValue !== undefined ? defaultValue : 0) : min;
  const [displayValue, setDisplayValue] = useState<number>(isPoweredOn ? value : offRestValue);

  useEffect(() => {
    if (!isPoweredOn) {
      setDisplayValue(offRestValue);
    } else {
      setDisplayValue(value);
    }
  }, [isPoweredOn, value, offRestValue]);

  const effectiveVal = isDragging ? value : displayValue;

  // Normalized 0 to 1
  const normalized = Math.max(0, Math.min(1, (effectiveVal - min) / (max - min)));

  const isClippedAtDetent =
    (scale === 'tempo' && Math.abs(value - 1.0) < 0.003) ||
    (scale === 'crossfader' && Math.abs(value - 0.0) < 0.015) ||
    (scale === 'volume' && (Math.abs(value - 1.0) < 0.015 || Math.abs(value - 0.0) < 0.015)) ||
    (defaultValue !== undefined && Math.abs(value - defaultValue) < 0.004);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();

      let ratio = 0;
      if (orientation === 'vertical') {
        const capH = 22;
        const availableH = Math.max(1, rect.height - capH);
        const y = clientY - rect.top - capH / 2;
        const clampedY = Math.max(0, Math.min(availableH, y));
        ratio = 1 - clampedY / availableH;
      } else {
        const capW = 24;
        const availableW = Math.max(1, rect.width - capW);
        const x = clientX - rect.left - capW / 2;
        const clampedX = Math.max(0, Math.min(availableW, x));
        ratio = clampedX / availableW;
      }

      let rawVal = min + ratio * (max - min);
      const range = max - min;

      // Subtle magnetic snap / clipping threshold: ~1.2% - 2.5% of travel range
      const snapThreshold =
        range * (scale === 'tempo' ? 0.014 : scale === 'crossfader' ? 0.035 : 0.02);

      // Candidate magnetic snap points
      const snapPoints: number[] = [];
      if (defaultValue !== undefined) {
        snapPoints.push(defaultValue);
      }
      if (scale === 'tempo' && !snapPoints.includes(1.0)) {
        snapPoints.push(1.0); // 0.0% center pitch detent
      }
      if (scale === 'crossfader') {
        if (!snapPoints.includes(0.0)) snapPoints.push(0.0); // Center detent
        if (!snapPoints.includes(-1.0)) snapPoints.push(-1.0); // Deck A full
        if (!snapPoints.includes(1.0)) snapPoints.push(1.0); // Deck B full
      }
      if (scale === 'volume') {
        if (!snapPoints.includes(1.0)) snapPoints.push(1.0); // Unity 0 dB
        if (!snapPoints.includes(0.0)) snapPoints.push(0.0); // Mute
      }

      let newVal = rawVal;
      let snapped = false;

      for (const pt of snapPoints) {
        const dist = Math.abs(rawVal - pt);
        // Magnetic clip capture zone: locks right to the notch
        if (dist <= snapThreshold) {
          newVal = pt;
          snapped = true;
          break;
        } else if (dist < snapThreshold * 1.8) {
          // Subtle physical magnetic attraction curve pulling towards notch
          const pullFactor = Math.pow(1 - (dist - snapThreshold) / (snapThreshold * 0.8), 2) * 0.45;
          newVal = newVal + (pt - newVal) * pullFactor;
        }
      }

      if (!snapped && step) {
        newVal = Math.round(newVal / step) * step;
      }

      newVal = Math.max(min, Math.min(max, newVal));
      onChange(Number(newVal.toFixed(4)));
    },
    [orientation, min, max, step, defaultValue, scale, onChange]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    setIsDragging(true);
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    setIsDragging(false);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (defaultValue !== undefined) {
      onChange(defaultValue);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const range = max - min;
    const dir = orientation === 'vertical' ? -Math.sign(e.deltaY) : Math.sign(e.deltaY);
    let newVal = value + dir * (range / 50);

    // Snap to default if nearby
    if (defaultValue !== undefined && Math.abs(newVal - defaultValue) < range * 0.02) {
      newVal = defaultValue;
    }
    newVal = Math.max(min, Math.min(max, newVal));
    if (step) {
      newVal = Math.round(newVal / step) * step;
    }
    onChange(Number(newVal.toFixed(4)));
  };

  // ----------------------------------------------------------------------
  // VERTICAL DJ FADER (Channel Volume or Pitch/Tempo)
  // ----------------------------------------------------------------------
  if (orientation === 'vertical') {
    const faderH = heightPx || 120;
    // Cap height = 22px. Thumb position bottom-based: 0% = bottom, 100% = top
    // Travel range = faderH - 22
    const travelRange = faderH - 22;
    const thumbBottomPx = normalized * travelRange;

    // Scale graduation lines for volume (0 to 1) or tempo (-50% to +50%)
    const volumeTicks = [
      { label: '10', pos: 1.0 },
      { label: '8', pos: 0.8 },
      { label: '6', pos: 0.6 },
      { label: '4', pos: 0.4 },
      { label: '2', pos: 0.2 },
      { label: '0', pos: 0.0 },
    ];

    const tempoTicks = [
      { label: '+10', pos: 1.0 },
      { label: '+6', pos: 0.8 },
      { label: '0', pos: 0.5 },
      { label: '-6', pos: 0.2 },
      { label: '-10', pos: 0.0 },
    ];

    const ticks = scale === 'tempo' ? tempoTicks : volumeTicks;

    return (
      <div
        className={`relative flex items-center justify-center select-none group touch-none cursor-pointer ${className}`}
        style={{ height: `${faderH}px`, width: widthPx ? `${widthPx}px` : '46px' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        title={title || (scale === 'tempo' ? 'Tempo / Pitch Fader' : 'Volume Fader')}
      >
        {/* Left Side Graduation Marks */}
        <div
          className="absolute left-1 top-0 bottom-0 flex flex-col justify-between py-1 pointer-events-none"
          style={{ height: `${faderH}px` }}
        >
          {ticks.map((t, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <span className="text-[7px] font-mono font-bold text-neutral-500 w-3 text-right">
                {t.label}
              </span>
              <div
                className={`h-[1px] bg-neutral-600 ${
                  t.label === '0' || t.label === '10' ? 'w-2 bg-neutral-400' : 'w-1'
                }`}
              />
            </div>
          ))}
        </div>

        {/* Center Recessed Hardware Track Slot */}
        <div
          ref={trackRef}
          className="relative w-2 rounded-full overflow-hidden shadow-inner border border-[#1b1d28]"
          style={{
            height: `${faderH}px`,
            background: 'linear-gradient(180deg, #050608 0%, #0c0d14 50%, #050608 100%)',
          }}
        >
          {/* Subtle center hairline slot */}
          <div className="absolute inset-x-0 mx-auto w-[1px] h-full bg-[#1e202e]" />

          {/* Active Level Underglow Stripe */}
          <div
            className={`absolute bottom-0 w-full ${
              isDragging ? 'transition-all duration-75' : 'transition-[height,background-color,box-shadow,opacity] duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]'
            }`}
            style={{
              height: `${thumbBottomPx + 11}px`,
              backgroundColor: isPoweredOn ? accentColor : 'transparent',
              opacity: isPoweredOn ? 0.35 : 0,
              boxShadow: isPoweredOn ? `0 0 8px ${accentColor}` : 'none',
            }}
          />
        </div>

        {/* Right Side Graduation Ticks */}
        <div
          className="absolute right-1 top-0 bottom-0 flex flex-col justify-between py-1 pointer-events-none"
          style={{ height: `${faderH}px` }}
        >
          {ticks.map((t, idx) => (
            <div key={idx} className="flex items-center gap-1 justify-end">
              <div
                className={`h-[1px] bg-neutral-600 ${
                  t.label === '0' || t.label === '10' ? 'w-2 bg-neutral-400' : 'w-1'
                }`}
              />
            </div>
          ))}
        </div>

        {/* Tactile DJ Console Fader Cap */}
        <div
          className={`absolute left-0 right-0 mx-auto w-8 sm:w-9 h-[22px] rounded-xs pointer-events-none ${
            isDragging
              ? 'transition-shadow shadow-[0_0_12px_rgba(255,255,255,0.4),0_6px_14px_rgba(0,0,0,0.9)] scale-[1.03]'
              : 'transition-[bottom,shadow] duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] shadow-[0_4px_10px_rgba(0,0,0,0.9),0_1px_3px_rgba(0,0,0,0.8)]'
          }`}
          style={{
            bottom: `${thumbBottomPx}px`,
            background:
              'linear-gradient(180deg, #2a2c3a 0%, #151722 25%, #0f1018 75%, #1c1e2a 100%)',
            borderTop: '1px solid #4a4d62',
            borderBottom: '2px solid #050609',
            borderLeft: '1px solid #232533',
            borderRight: '1px solid #232533',
          }}
        >
          {/* Top Bevel Highlight */}
          <div className="w-full h-[1px] bg-white/20" />

          {/* Side Grip Ridges */}
          <div className="absolute inset-y-1 left-0.5 w-[2px] flex flex-col justify-between py-0.5 opacity-40">
            <div className="w-full h-[1px] bg-white" />
            <div className="w-full h-[1px] bg-white" />
            <div className="w-full h-[1px] bg-white" />
          </div>
          <div className="absolute inset-y-1 right-0.5 w-[2px] flex flex-col justify-between py-0.5 opacity-40">
            <div className="w-full h-[1px] bg-white" />
            <div className="w-full h-[1px] bg-white" />
            <div className="w-full h-[1px] bg-white" />
          </div>

          {/* Center White High-Contrast Indicator Line */}
          <div
            className={`absolute inset-x-1.5 top-1/2 -translate-y-1/2 h-[2px] rounded-full flex items-center justify-center transition-all ${
              isPoweredOn
                ? 'bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]'
                : 'bg-neutral-600 shadow-none'
            }`}
          >
            {/* Accent color center dot (lights up with deck/theme color) */}
            <div
              className="w-1.5 h-1.5 rounded-full transition-all"
              style={{
                backgroundColor: isPoweredOn ? accentColor : '#334155',
                boxShadow: !isPoweredOn
                  ? 'none'
                  : isClippedAtDetent
                  ? `0 0 8px ${accentColor}, 0 0 12px ${accentColor}`
                  : `0 0 3px ${accentColor}`,
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------------
  // HORIZONTAL DJ CROSSFADER
  // ----------------------------------------------------------------------
  const faderH = heightPx || 38;
  const faderCapW = 24; // Cap width 24px

  return (
    <div
      ref={trackRef}
      className={`relative w-full flex items-center justify-center select-none group touch-none cursor-pointer py-1 ${className}`}
      style={{ height: `${faderH}px` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
      title={title || 'DJ Crossfader'}
    >
      {/* Recessed Horizontal Track Faceplate */}
      <div
        className="relative w-full h-2.5 rounded-full overflow-hidden shadow-inner border border-[#1d1f2c]"
        style={{
          background: 'linear-gradient(180deg, #050608 0%, #0d0f17 50%, #050608 100%)',
        }}
      >
        {/* Center zero line detent */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-neutral-600/70" />

        {/* Graduated Track Ticks */}
        <div className="absolute inset-0 flex justify-between px-6 items-center pointer-events-none opacity-30">
          <div className="w-[1px] h-full bg-white" />
          <div className="w-[1px] h-full bg-white" />
          <div className="w-[1px] h-full bg-white" />
          <div className="w-[1px] h-full bg-white" />
          <div className="w-[1px] h-full bg-white" />
        </div>
      </div>

      {/* Tactile Pro Crossfader Cap */}
      <div
        className={`absolute top-0.5 bottom-0.5 w-[22px] sm:w-[24px] rounded-xs pointer-events-none -translate-x-1/2 ${
          isDragging
            ? 'transition-shadow shadow-[0_0_12px_rgba(255,255,255,0.4),0_6px_14px_rgba(0,0,0,0.9)] scale-[1.04]'
            : 'transition-[left,shadow] duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] shadow-[0_4px_10px_rgba(0,0,0,0.9),0_1px_3px_rgba(0,0,0,0.8)]'
        }`}
        style={{
          left: `calc(${faderCapW / 2}px + ${normalized} * (100% - ${faderCapW}px))`,
          background:
            'linear-gradient(180deg, #2c2e3c 0%, #161824 25%, #10111a 75%, #1c1e2a 100%)',
          borderTop: '1px solid #4a4d62',
          borderBottom: '2px solid #050609',
          borderLeft: '1px solid #232533',
          borderRight: '1px solid #232533',
        }}
      >
        {/* Top & Bottom Bevel Line */}
        <div className="w-full h-[1px] bg-white/20" />

        {/* Vertical Center Indicator Stripe */}
        <div
          className="absolute inset-y-1.5 left-1/2 -translate-x-1/2 w-[2px] rounded-full transition-all"
          style={{
            backgroundColor: !isPoweredOn
              ? '#52525b'
              : isClippedAtDetent && accentColor
              ? accentColor
              : '#ffffff',
            boxShadow: !isPoweredOn
              ? 'none'
              : isClippedAtDetent && accentColor
              ? `0 0 6px ${accentColor}`
              : '0 0 4px rgba(255,255,255,0.9)',
          }}
        />

        {/* Tactile Finger Grip Ridges */}
        <div className="absolute inset-x-1 top-1 h-[2px] bg-white/10" />
        <div className="absolute inset-x-1 bottom-1 h-[2px] bg-white/10" />
      </div>
    </div>
  );
};
