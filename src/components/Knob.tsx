import React, { useState, useRef, useCallback, useEffect } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  onChange: (value: number) => void;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  isPoweredOn?: boolean;
}

export const Knob: React.FC<KnobProps> = ({
  label,
  value,
  min,
  max,
  step = 0.01,
  defaultValue,
  unit = '',
  onChange,
  color = '#38bdf8',
  size = 'md',
  isPoweredOn = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const lastY = useRef<number>(0);
  const valueRef = useRef<number>(value);
  valueRef.current = value;

  // Motorized aircraft control power transition:
  // When powered off: smoothly glides to min (lowest position / -135deg).
  // When powered on: smoothly restores to user value.
  const [displayValue, setDisplayValue] = useState<number>(isPoweredOn ? value : min);

  useEffect(() => {
    if (!isPoweredOn) {
      setDisplayValue(min);
    } else {
      setDisplayValue(value);
    }
  }, [isPoweredOn, value, min]);

  // Normalized 0 to 1 based on motorized displayValue
  const effectiveVal = isDragging ? value : displayValue;
  const normalized = Math.max(0, Math.min(1, (effectiveVal - min) / (max - min)));
  // Angle: -135 deg (bottom-left) to +135 deg (bottom-right)
  const angle = -135 + normalized * 270;

  // Pointer Capture based drag: silky smooth, never drops events
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    setIsDragging(true);
    lastY.current = e.clientY;
    document.body.style.cursor = 'ns-resize';
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      e.preventDefault();

      // Dragging UP (e.clientY is smaller) => dy > 0 (Rotate Right / Clockwise)
      // Dragging DOWN (e.clientY is larger) => dy < 0 (Rotate Left / Counter-Clockwise)
      const dy = lastY.current - e.clientY;
      lastY.current = e.clientY;

      if (dy === 0) return;

      const range = max - min;
      // 100px vertical drag for full sweep (or 300px with Shift for fine tuning)
      const sensitivity = e.shiftKey ? 300 : 100;
      const delta = (dy / sensitivity) * range;

      let newVal = valueRef.current + delta;
      newVal = Math.max(min, Math.min(max, newVal));

      if (step) {
        newVal = Math.round(newVal / step) * step;
      }

      valueRef.current = newVal;
      onChange(Number(newVal.toFixed(3)));
    },
    [isDragging, min, max, step, onChange]
  );

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    setIsDragging(false);
    document.body.style.cursor = '';
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
    // Wheel up = Rotate Right (+), Wheel down = Rotate Left (-)
    const delta = -Math.sign(e.deltaY) * (range / 30);
    let newVal = value + delta;
    newVal = Math.max(min, Math.min(max, newVal));
    if (step) {
      newVal = Math.round(newVal / step) * step;
    }
    onChange(Number(newVal.toFixed(3)));
  };

  // Exact polar to cartesian coordinate conversion (56x56 viewBox)
  const cx = 28;
  const cy = 28;
  const r = 21;

  const polarToCartesian = (deg: number) => {
    // 0 deg is 12 o'clock, +deg is clockwise
    const rad = ((deg - 90) * Math.PI) / 180.0;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  };

  // Generate SVG path for arc between two angles
  const describeArc = (startAngle: number, endAngle: number) => {
    const start = polarToCartesian(startAngle);
    const end = polarToCartesian(endAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
  };

  // Background track arc (-135 to +135 deg)
  const trackPath = describeArc(-135, 135);

  const formatDisplayValue = (val: number) => {
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
    if (Number.isInteger(val)) return `${val}`;
    return `${val < 10 ? val.toFixed(1) : val.toFixed(0)}`;
  };

  const isSmall = size === 'sm';
  const isLarge = size === 'lg';

  const dialSizeClass = isSmall
    ? 'w-10 h-10'
    : isLarge
    ? 'w-15 h-15 sm:w-16 sm:h-16'
    : 'w-12 h-12 sm:w-13 sm:h-13';

  const centerCapClass = isSmall
    ? 'w-6 h-6'
    : isLarge
    ? 'w-9 h-9 sm:w-10 sm:h-10'
    : 'w-7 h-7 sm:w-8 sm:h-8';

  const notchClass = isSmall
    ? 'w-1 h-2 -translate-y-1.5'
    : isLarge
    ? 'w-1.5 h-3 -translate-y-2.5'
    : 'w-1.5 h-2.5 -translate-y-2';

  return (
    <div className="w-full flex flex-col items-center select-none group touch-none">
      {/* Label */}
      <span
        className={`text-[10px] sm:text-[11px] uppercase font-mono font-black tracking-wider text-center truncate leading-none mb-1 transition-colors ${
          isPoweredOn ? 'text-neutral-400' : 'text-neutral-600'
        }`}
      >
        {label}
      </span>

      {/* Dial */}
      <div
        className={`relative ${dialSizeClass} flex items-center justify-center shrink-0 ${
          isPoweredOn ? 'cursor-ns-resize' : 'cursor-default pointer-events-none'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        title="Click & Drag UP to rotate right (+), DOWN to rotate left (-). Wheel scroll or double-click to reset."
      >
        {/* SVG Arc Display */}
        <svg
          className={`${dialSizeClass} pointer-events-none`}
          viewBox="0 0 56 56"
        >
          {/* Background Track Arc */}
          <path
            d={trackPath}
            fill="none"
            stroke="#1c1e29"
            strokeWidth={isSmall ? '5' : isLarge ? '5' : '4.5'}
            strokeLinecap="round"
          />

          {/* Active LED Glow Arc */}
          {isPoweredOn && (
            <path
              d={trackPath}
              fill="none"
              stroke={color}
              strokeWidth={isSmall ? '5' : isLarge ? '5' : '4.5'}
              strokeLinecap="round"
              strokeDasharray={99}
              strokeDashoffset={99 * (1 - normalized)}
              className="transition-[stroke-dashoffset,stroke] duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]"
              style={{
                filter: `drop-shadow(0 0 4px ${color})`,
              }}
            />
          )}
        </svg>

        {/* Center Knob Dial with Motorized Cockpit Transition */}
        <div
          className={`absolute ${centerCapClass} rounded-full bg-[#0a0b10] border ${
            isDragging ? 'border-neutral-200 shadow-lg shadow-white/30 scale-105' : 'border-[#262838]'
          } flex items-center justify-center pointer-events-none transition-transform ${
            isDragging ? 'duration-75' : 'duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]'
          } shadow-md`}
          style={{
            transform: `rotate(${angle}deg)`,
          }}
        >
          {/* Top Notch Pointer */}
          <div
            className={`${notchClass} rounded-full transition-colors duration-75`}
            style={{ backgroundColor: isPoweredOn ? color : '#374151' }}
          />
        </div>
      </div>

      {/* Value */}
      <span
        className={`text-[10px] font-mono font-bold text-center leading-none mt-1 transition-colors duration-75 ${
          isPoweredOn ? 'text-neutral-300' : 'text-neutral-600'
        }`}
      >
        {isPoweredOn ? formatDisplayValue(value) : 'MIN'}
        {isPoweredOn ? unit : ''}
      </span>
    </div>
  );
};
