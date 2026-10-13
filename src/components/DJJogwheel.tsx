import React, { useState, useRef, useEffect } from 'react';
import type { DeckAudio } from '../dj/DeckAudio';

interface DJJogwheelProps {
  deck: DeckAudio | null;
  accentColor: string;
  isPoweredOn?: boolean;
}

export const DJJogwheel: React.FC<DJJogwheelProps> = ({ deck, accentColor, isPoweredOn = true }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const vinylRef = useRef<HTMLDivElement>(null);
  const timeTextRef = useRef<HTMLSpanElement>(null);
  const modeBadgeRef = useRef<HTMLSpanElement>(null);
  const bpmTextRef = useRef<HTMLSpanElement>(null);
  const pitchTextRef = useRef<HTMLSpanElement>(null);

  const [isScratching, setIsScratching] = useState<boolean>(false);
  const [platterDiameter, setPlatterDiameter] = useState<number>(260);
  const platterRef = useRef<HTMLDivElement>(null);
  const lastAngleRef = useRef<number>(0);
  const scratchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rotationAngleRef = useRef<number>(0);
  const animFrame = useRef<number | null>(null);

  // Dynamically compute exact diameter from container bounds to guarantee a strict 1:1 circle
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // Expand radius by ~20-25% while maintaining safe padding from container boundaries
        const d = Math.floor(Math.min(rect.width, rect.height) - 10);
        setPlatterDiameter(Math.max(120, Math.min(420, d)));
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Ultra-smooth 60-120fps hardware-accelerated spin and LCD readout via direct DOM manipulation
  useEffect(() => {
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (!isPoweredOn) {
        if (timeTextRef.current && timeTextRef.current.textContent !== '--:--.-') {
          timeTextRef.current.textContent = '--:--.-';
        }
        if (bpmTextRef.current && bpmTextRef.current.textContent !== '---.-') {
          bpmTextRef.current.textContent = '---.-';
        }
        if (pitchTextRef.current && pitchTextRef.current.textContent !== '---%') {
          pitchTextRef.current.textContent = '---%';
        }
        if (modeBadgeRef.current) {
          modeBadgeRef.current.style.opacity = '0';
        }
        animFrame.current = requestAnimationFrame(loop);
        return;
      }

      if (modeBadgeRef.current) {
        modeBadgeRef.current.style.opacity = '1';
      }

      if (deck && deck.isPlaying && !isScratching && !deck.isScratching) {
        // 33.3 RPM rotation = ~200 degrees per second * tempoMultiplier
        const speed = 200 * deck.tempoMultiplier;
        rotationAngleRef.current = (rotationAngleRef.current + speed * dt) % 360;
        if (vinylRef.current) {
          vinylRef.current.style.transform = `rotate(${rotationAngleRef.current}deg)`;
        }
      }

      // Direct, zero-lag LCD readout updates
      if (deck) {
        const curSeconds = deck.playbackPosition;
        const mins = Math.floor(curSeconds / 60);
        const secs = Math.floor(curSeconds % 60);
        const ms = Math.floor((curSeconds % 1) * 10);
        const formatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;

        if (timeTextRef.current && timeTextRef.current.textContent !== formatted) {
          timeTextRef.current.textContent = formatted;
        }

        if (!deck.isScratching) {
          const modeStr = deck.isPlaying ? 'PLAY' : 'CUE';
          if (modeBadgeRef.current && modeBadgeRef.current.textContent !== modeStr) {
            modeBadgeRef.current.textContent = modeStr;
            modeBadgeRef.current.className = `text-[9px] sm:text-[10px] font-black tracking-widest uppercase px-2.5 py-0.5 rounded-full border ${
              deck.isPlaying
                ? 'bg-emerald-950/70 border-emerald-500/80 text-emerald-300'
                : 'bg-amber-950/70 border-amber-500/80 text-amber-300'
            }`;
          }

          const bpmStr = ((deck.track?.bpm || 120) * deck.tempoMultiplier).toFixed(1);
          if (bpmTextRef.current && bpmTextRef.current.textContent !== bpmStr) {
            bpmTextRef.current.textContent = bpmStr;
          }

          const pitchVal = (((deck.tempoMultiplier - 1.0) * 100).toFixed(1));
          const pitchStr = Number(pitchVal) > 0 ? `+${pitchVal}%` : `${pitchVal}%`;
          if (pitchTextRef.current && pitchTextRef.current.textContent !== pitchStr) {
            pitchTextRef.current.textContent = pitchStr;
          }
        }
      }

      animFrame.current = requestAnimationFrame(loop);
    };

    animFrame.current = requestAnimationFrame(loop);
    return () => {
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
    };
  }, [deck, isScratching, isPoweredOn]);

  // Real-time physical vinyl disc coupling during trackpad scratching and inertia coasting
  useEffect(() => {
    if (!deck) return;
    deck.onScratchDelta = (deltaDegrees: number, _dt: number, currentRPM: number) => {
      rotationAngleRef.current = (rotationAngleRef.current + deltaDegrees) % 360;
      if (vinylRef.current) {
        vinylRef.current.style.transform = `rotate(${rotationAngleRef.current}deg)`;
      }

      // Dynamic Central LCD HUD Readout
      if (bpmTextRef.current) {
        bpmTextRef.current.textContent = `${currentRPM.toFixed(1)} RPM`;
      }
      if (pitchTextRef.current) {
        const dir = deltaDegrees > 0 ? '▲ FWD' : deltaDegrees < 0 ? '▼ REV' : '■ HOLD';
        pitchTextRef.current.textContent = dir;
      }
      if (modeBadgeRef.current) {
        const isCoast = deck.isInertiaCoasting;
        modeBadgeRef.current.textContent = isCoast ? 'INERTIA' : 'SCRATCH';
        modeBadgeRef.current.className = `text-[9px] sm:text-[10px] font-black tracking-widest uppercase px-2.5 py-0.5 rounded-full border ${
          isCoast
            ? 'bg-amber-950/80 border-amber-400 text-amber-200 animate-pulse'
            : 'bg-red-950/80 border-red-500 text-red-200 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
        }`;
      }
    };
    return () => {
      deck.onScratchDelta = undefined;
    };
  }, [deck]);

  const lastTimeRef = useRef<number>(0);
  const moveHistoryRef = useRef<Array<{ angle: number; time: number; delta: number }>>([]);
  const wheelTimeoutRef = useRef<number | null>(null);
  const wheelVelocityRef = useRef<number>(0);
  const lastWheelTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (wheelTimeoutRef.current !== null) {
        clearTimeout(wheelTimeoutRef.current);
      }
    };
  }, []);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!deck || !isPoweredOn) return;
    e.preventDefault();

    const now = performance.now();
    const dtSeconds = Math.max(0.008, Math.min(0.05, (now - lastWheelTimeRef.current) / 1000));
    lastWheelTimeRef.current = now;

    const mult = e.deltaMode === 1 ? 24 : e.deltaMode === 2 ? 240 : 1;
    const dx = (e.deltaX || 0) * mult;
    const dy = (e.deltaY || 0) * mult;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;

    // Trackpad gesture: swiping forward/up or right scrubs forward; swiping backward/down or left scrubs reverse
    const delta = (dy * 1.2) - (dx * 0.8);

    rotationAngleRef.current = (rotationAngleRef.current + delta) % 360;
    if (vinylRef.current) {
      vinylRef.current.style.transform = `rotate(${rotationAngleRef.current}deg)`;
    }

    deck.scratchRotate(delta, dtSeconds);

    const instantVelocity = delta / dtSeconds;
    wheelVelocityRef.current = wheelVelocityRef.current * 0.35 + instantVelocity * 0.65;

    if (wheelTimeoutRef.current !== null) {
      clearTimeout(wheelTimeoutRef.current);
    }

    // Only when lifting finger (wheel stops for 65ms): trigger coasting inertia!
    wheelTimeoutRef.current = window.setTimeout(() => {
      const vel = wheelVelocityRef.current;
      wheelVelocityRef.current = 0;
      wheelTimeoutRef.current = null;
      if (Math.abs(vel) > 25) {
        deck.startInertialCoasting(vel);
      } else {
        deck.releaseScratch(false);
      }
    }, 65);
  };

  // Calculate angle of pointer relative to jogwheel center
  const getAngleFromCenter = (clientX: number, clientY: number) => {
    if (!platterRef.current) return 0;
    const rect = platterRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsScratching(true);
    lastAngleRef.current = getAngleFromCenter(e.clientX, e.clientY);
    lastTimeRef.current = performance.now();
    moveHistoryRef.current = [{ angle: lastAngleRef.current, time: lastTimeRef.current, delta: 0 }];
    if (deck) {
      deck.holdPlatter();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScratching || !deck) return;
    const now = performance.now();
    const dtSeconds = Math.max(0.005, (now - lastTimeRef.current) / 1000);
    lastTimeRef.current = now;

    const currentAngle = getAngleFromCenter(e.clientX, e.clientY);
    let delta = currentAngle - lastAngleRef.current;

    // Handle wrap-around across -180 / 180 boundary
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    // Subtle deadzone for micro-jitter
    if (Math.abs(delta) < 0.1) return;

    rotationAngleRef.current = (rotationAngleRef.current + delta) % 360;
    if (vinylRef.current) {
      vinylRef.current.style.transform = `rotate(${rotationAngleRef.current}deg)`;
    }
    lastAngleRef.current = currentAngle;

    moveHistoryRef.current.push({ angle: currentAngle, time: now, delta });
    moveHistoryRef.current = moveHistoryRef.current.filter((item) => now - item.time <= 100);

    // Immediate scratch manipulation of audio and playhead position
    deck.scratchRotate(delta, dtSeconds);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore if pointer capture already released
    }
    setIsScratching(false);
    if (scratchTimeoutRef.current) {
      clearTimeout(scratchTimeoutRef.current);
      scratchTimeoutRef.current = null;
    }
    if (deck) {
      const now = performance.now();
      const history = moveHistoryRef.current.filter((item) => now - item.time <= 100);
      let triggeredInertia = false;
      if (history.length >= 2) {
        const oldest = history[0];
        const newest = history[history.length - 1];
        const dt = (newest.time - oldest.time) / 1000;
        if (dt > 0.01) {
          let totalDelta = 0;
          for (let i = 1; i < history.length; i++) {
            totalDelta += history[i].delta;
          }
          const angularSpeed = totalDelta / dt;
          if (Math.abs(angularSpeed) > 25) {
            deck.startInertialCoasting(angularSpeed);
            triggeredInertia = true;
          }
        }
      }
      if (!triggeredInertia) {
        deck.releaseScratch(false);
      }
    }
  };

  // Time format mm:ss.ms
  const curSeconds = deck ? deck.playbackPosition : 0;
  const mins = Math.floor(curSeconds / 60);
  const secs = Math.floor(curSeconds % 60);
  const ms = Math.floor((curSeconds % 1) * 10);
  const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;

  const currentBPM = deck ? ((deck.track?.bpm || 120) * deck.tempoMultiplier).toFixed(1) : '120.0';
  const pitchPercent = deck ? (((deck.tempoMultiplier - 1.0) * 100).toFixed(1)) : '+0.0';

  const lcdDiameter = Math.round(platterDiameter * 0.44);

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className="flex-1 min-w-0 h-full flex items-center justify-center select-none py-1 w-full overflow-hidden"
    >
      {/* Flagship Large Jogwheel Platter Chassis - Strictly 1:1 Perfect Circle */}
      <div
        ref={platterRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`relative shrink-0 rounded-full p-2.5 sm:p-3 select-none transition-shadow ${
          isPoweredOn
            ? isScratching
              ? 'shadow-[0_0_24px_rgba(255,255,255,0.35),0_10px_24px_rgba(0,0,0,0.9)] cursor-grab active:cursor-grabbing touch-none'
              : 'shadow-[0_8px_20px_rgba(0,0,0,0.85),0_2px_6px_rgba(0,0,0,0.7)] cursor-grab active:cursor-grabbing touch-none'
            : 'shadow-none cursor-default pointer-events-none'
        }`}
        style={{
          width: `${platterDiameter}px`,
          height: `${platterDiameter}px`,
          maxWidth: `${platterDiameter}px`,
          maxHeight: `${platterDiameter}px`,
          aspectRatio: '1 / 1',
          background: 'radial-gradient(circle, #222534 0%, #11131c 65%, #08090f 100%)',
          border: '3px solid #2e3245',
        }}
        title={isPoweredOn ? 'Tactile Physical Jogwheel: Scratch, Backspin, or Pitch Bend (Never Pauses)' : 'Deck Off'}
      >
        {/* Rotating Outer Vinyl Ring with Concentric Micro-Grooves */}
        <div
          ref={vinylRef}
          className="relative w-full h-full rounded-full flex items-center justify-center border-2 border-[#3b3f56] shadow-inner will-change-transform"
          style={{
            background:
              'repeating-radial-gradient(circle, #0e1017, #0e1017 2px, #161824 3px, #161824 4.5px)',
          }}
        >
          {/* High-Luminance Neon Needle Beacon */}
          <div
            className={`absolute top-2 w-3.5 sm:w-4 h-8 sm:h-11 rounded-full transition-all ${
              isPoweredOn ? 'duration-75 delay-[250ms]' : 'duration-75 delay-0'
            }`}
            style={{
              backgroundColor: isPoweredOn ? accentColor : '#272938',
              boxShadow: isPoweredOn
                ? `0 0 16px ${accentColor}, 0 0 5px #ffffff`
                : 'none',
              opacity: isPoweredOn ? 1 : 0.2,
            }}
          />
          {/* Subtle Opposite Balance Marker */}
          <div
            className={`absolute bottom-2 w-2.5 sm:w-3 h-5 sm:h-6 rounded-full transition-all ${
              isPoweredOn ? 'duration-75 delay-[250ms]' : 'duration-75 delay-0'
            }`}
            style={{
              backgroundColor: isPoweredOn ? accentColor : '#272938',
              opacity: isPoweredOn ? 0.3 : 0.05,
            }}
          />

          {/* 4 Quadrant Optical Guide Ticks */}
          <div
            className={`absolute left-2 w-4 h-1.5 rounded-full transition-all ${
              isPoweredOn ? 'duration-75 delay-[250ms]' : 'duration-75 delay-0'
            }`}
            style={{
              backgroundColor: isPoweredOn ? accentColor : '#272938',
              opacity: isPoweredOn ? 0.2 : 0.05,
            }}
          />
          <div
            className={`absolute right-2 w-4 h-1.5 rounded-full transition-all ${
              isPoweredOn ? 'duration-75 delay-[250ms]' : 'duration-75 delay-0'
            }`}
            style={{
              backgroundColor: isPoweredOn ? accentColor : '#272938',
              opacity: isPoweredOn ? 0.2 : 0.05,
            }}
          />
        </div>

        {/* Center Digital LCD Display (Stationary) */}
        <div
          className={`absolute inset-0 m-auto rounded-full bg-[#05060a] border-2 border-[#202330] flex flex-col items-center justify-center shadow-[inset_0_4px_14px_rgba(0,0,0,0.95)] pointer-events-none z-10 text-center font-mono select-none transition-all ${
            isPoweredOn ? 'duration-75 delay-[250ms]' : 'duration-75 delay-0'
          }`}
          style={{
            width: `${lcdDiameter}px`,
            height: `${lcdDiameter}px`,
            maxWidth: `${lcdDiameter}px`,
            maxHeight: `${lcdDiameter}px`,
            aspectRatio: '1 / 1',
            opacity: isPoweredOn ? 1 : 0.45,
          }}
        >
          {/* Live Playhead Mode Badge */}
          <span
            ref={modeBadgeRef}
            className={`text-[9px] sm:text-[10px] font-black tracking-widest uppercase px-2.5 py-0.5 rounded-full border transition-opacity ${
              !isPoweredOn
                ? 'opacity-0'
                : deck?.isPlaying
                ? 'bg-emerald-950/70 border-emerald-500/80 text-emerald-300'
                : 'bg-amber-950/70 border-amber-500/80 text-amber-300'
            }`}
          >
            {deck?.isPlaying ? 'PLAY' : 'CUE'}
          </span>

          {/* Precision Time Elapsed Readout */}
          <span
            ref={timeTextRef}
            className={`text-sm sm:text-base md:text-lg font-black tracking-tight my-0.5 tabular-nums transition-colors ${
              isPoweredOn ? 'text-neutral-100 drop-shadow-md' : 'text-neutral-700'
            }`}
          >
            {isPoweredOn ? timeFormatted : '--:--.-'}
          </span>

          {/* BPM & Real Pitch Percent */}
          <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black text-neutral-300">
            <span
              ref={bpmTextRef}
              style={{ color: isPoweredOn ? accentColor : '#334155' }}
            >
              {isPoweredOn ? currentBPM : '---.-'}
            </span>
            <span className={isPoweredOn ? 'text-neutral-500' : 'text-neutral-700'}>·</span>
            <span
              ref={pitchTextRef}
              className={isPoweredOn ? 'opacity-80' : 'text-neutral-700'}
            >
              {isPoweredOn ? (Number(pitchPercent) > 0 ? `+${pitchPercent}%` : `${pitchPercent}%`) : '---%'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
