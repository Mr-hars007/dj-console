import React, { useRef, useEffect } from 'react';
import type { DeckAudio } from '../dj/DeckAudio';

interface DJWaveformProps {
  deck: DeckAudio | null;
  color: string;
  isPoweredOn?: boolean;
}

export const DJWaveform: React.FC<DJWaveformProps> = ({ deck, color, isPoweredOn = true }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overviewCacheRef = useRef<{ buffer: AudioBuffer; canvas: HTMLCanvasElement } | null>(null);

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      animId = requestAnimationFrame(render);
      const w = canvas.width;
      const h = canvas.height;

      if (!isPoweredOn) {
        ctx.fillStyle = '#050508';
        ctx.fillRect(0, 0, w, h);
        return;
      }

      // Dark background with subtle grid
      ctx.fillStyle = '#07080d';
      ctx.fillRect(0, 0, w, h);

      // Main scrolling waveform vertical bounds
      const miniH = 22;
      const mainH = h - miniH;

      if (!deck || !deck.buffer) {
        // When no track is loaded, center the horizontal grid line perfectly in the canvas
        const emptyCenterY = Math.floor(h / 2);
        ctx.strokeStyle = '#1c1f2e';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, emptyCenterY);
        ctx.lineTo(w, emptyCenterY);
        ctx.stroke();

        ctx.fillStyle = '#374151';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NO TRACK', w / 2, emptyCenterY + 3);
        return;
      }

      const centerY = Math.floor(miniH + mainH / 2);

      // Center baseline line (strictly aligned to waveform peaks)
      ctx.strokeStyle = '#1c1f2e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(w, centerY);
      ctx.stroke();

      const buffer = deck.buffer;
      const duration = buffer.duration;
      const curPos = deck.updateCurrentPosition();
      const channelData = buffer.getChannelData(0);

      // Draw cached overall waveform mini-strip at the top (O(1) frame draw instead of O(N) scanning)
      if (!overviewCacheRef.current || overviewCacheRef.current.buffer !== buffer || overviewCacheRef.current.canvas.width !== w) {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = w;
        offCanvas.height = miniH;
        const offCtx = offCanvas.getContext('2d');
        if (offCtx) {
          offCtx.fillStyle = '#0f1118';
          offCtx.fillRect(0, 0, w, miniH);

          const step = Math.ceil(channelData.length / w);
          offCtx.fillStyle = '#262938';
          for (let x = 0; x < w; x++) {
            let max = 0;
            const startIdx = x * step;
            for (let j = 0; j < step; j += 4) {
              const val = Math.abs(channelData[startIdx + j] || 0);
              if (val > max) max = val;
            }
            const barH = max * (miniH - 2);
            offCtx.fillRect(x, miniH - barH, 1, barH);
          }
        }
        overviewCacheRef.current = { buffer, canvas: offCanvas };
      }

      if (overviewCacheRef.current) {
        ctx.drawImage(overviewCacheRef.current.canvas, 0, 0);
      }

      // Progress overlay on mini-strip
      const progX = (curPos / duration) * w;
      ctx.fillStyle = color;
      ctx.fillRect(progX - 1.5, 0, 3, miniH);

      // CUE Indicator on complete song waveform mini-strip
      if (deck.hasCue && duration > 0) {
        const miniCueX = (deck.cuePosition / duration) * w;

        // Subtle amber glow behind line
        ctx.fillStyle = 'rgba(245, 158, 11, 0.4)';
        ctx.fillRect(Math.floor(miniCueX) - 2, 0, 5, miniH);

        // Solid amber vertical needle
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(Math.floor(miniCueX) - 0.5, 0, 2, miniH);

        // Hardware CUE Flag / Tab at the top of the mini-strip
        const badgeW = 12;
        const badgeH = 8;
        const badgeX = Math.max(0, Math.min(w - badgeW, miniCueX - badgeW / 2));
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(badgeX, 0, badgeW, badgeH);

        // "C" label
        ctx.fillStyle = '#05060b';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('C', badgeX + badgeW / 2, badgeH / 2 + 0.5);
      }

      // Hot Cues on complete song waveform mini-strip
      if (deck.hotCues && duration > 0) {
        deck.hotCues.forEach((hc) => {
          if (!hc.active) return;
          const hcMiniX = (hc.time / duration) * w;
          ctx.fillStyle = hc.color;
          ctx.fillRect(Math.floor(hcMiniX) - 0.5, 0, 1.5, miniH);

          // Small triangle indicator at bottom of mini-strip
          ctx.beginPath();
          ctx.moveTo(hcMiniX - 2.5, miniH);
          ctx.lineTo(hcMiniX + 2.5, miniH);
          ctx.lineTo(hcMiniX, miniH - 4);
          ctx.closePath();
          ctx.fill();
        });
      }

      // Active Loop Region on complete song overview mini-strip
      if (deck.loopActive && deck.loopEnd > deck.loopStart && duration > 0) {
        const miniLoopStart = (deck.loopStart / duration) * w;
        const miniLoopEnd = (deck.loopEnd / duration) * w;
        ctx.fillStyle = 'rgba(245, 158, 11, 0.4)';
        ctx.fillRect(miniLoopStart, 0, Math.max(2, miniLoopEnd - miniLoopStart), miniH);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(miniLoopStart, 0, 1.5, miniH);
        ctx.fillRect(miniLoopEnd - 1, 0, 1.5, miniH);
      }

      // Draw main zooming/scrolling waveform below mini-strip
      const zoomSeconds = 8; // Visible window: 8 seconds
      const samplesPerPixel = Math.floor((zoomSeconds * buffer.sampleRate) / w);
      const centerSample = Math.floor(curPos * buffer.sampleRate);
      const halfW = Math.floor(w / 2);

      // 1. Scrolling Waveform Peaks
      ctx.fillStyle = color;
      for (let x = 0; x < w; x++) {
        const sampleOffset = (x - halfW) * samplesPerPixel;
        const sampleIdx = centerSample + sampleOffset;

        if (sampleIdx >= 0 && sampleIdx < channelData.length) {
          let maxVal = 0;
          for (let s = 0; s < samplesPerPixel; s += 8) {
            const val = Math.abs(channelData[sampleIdx + s] || 0);
            if (val > maxVal) maxVal = val;
          }
          const peakHeight = Math.max(1, maxVal * (mainH / 2 - 4));
          ctx.fillRect(x, centerY - peakHeight, 1, peakHeight * 2);
        }
      }

      // 2. High-Precision Beat Grid Lines (Mathematically aligned to detected BPM and kick downbeat phase)
      const rawBpm = deck.track?.bpm || 120;
      const secondsPerBeat = 60.0 / rawBpm;
      const firstBeatOffset = deck.track?.firstBeatOffset ?? 0;

      const windowStart = curPos - zoomSeconds / 2;
      const windowEnd = curPos + zoomSeconds / 2;
      const kStart = Math.floor((windowStart - firstBeatOffset) / secondsPerBeat);
      const kEnd = Math.ceil((windowEnd - firstBeatOffset) / secondsPerBeat);

      for (let k = kStart; k <= kEnd; k++) {
        const beatTime = firstBeatOffset + k * secondsPerBeat;
        if (beatTime < 0 || beatTime > duration) continue;

        const x = halfW + ((beatTime - curPos) / zoomSeconds) * w;
        if (x >= 0 && x <= w) {
          const isDownbeat = ((k % 4) + 4) % 4 === 0;

          if (isDownbeat) {
            // Downbeat (Beat 1 of 4): High-contrast white line with hardware tick
            ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
            ctx.fillRect(Math.floor(x), miniH, 1, mainH);

            // Illuminated hardware top tick pip at upper edge
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fillRect(Math.floor(x) - 0.5, miniH, 2, 5);
          } else {
            // Beats 2, 3, 4: Crisp translucent hint line
            ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
            ctx.fillRect(Math.floor(x), miniH, 1, mainH);

            // Subtle top tick pip
            ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
            ctx.fillRect(Math.floor(x), miniH, 1, 3);
          }
        }
      }

      // Loop region overlay (strictly aligned to beatgrid boxes)
      if (deck.loopActive && deck.loopEnd > deck.loopStart) {
        const loopStartPx = halfW + ((deck.loopStart - curPos) / zoomSeconds) * w;
        const loopEndPx = halfW + ((deck.loopEnd - curPos) / zoomSeconds) * w;
        const loopWidthPx = Math.max(2, loopEndPx - loopStartPx);

        // Translucent amber region fill
        ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
        ctx.fillRect(loopStartPx, miniH, loopWidthPx, mainH);

        // High-contrast amber boundary needles
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(Math.floor(loopStartPx), miniH, 1.5, mainH);
        ctx.fillRect(Math.floor(loopEndPx) - 0.5, miniH, 1.5, mainH);

        // Top Hardware Loop Boundary Tags (IN & OUT)
        if (loopStartPx >= -20 && loopStartPx <= w + 20) {
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(Math.floor(loopStartPx), miniH, 14, 8);
          ctx.fillStyle = '#05060b';
          ctx.font = 'bold 7px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('IN', Math.floor(loopStartPx) + 7, miniH + 4.5);
        }
        if (loopEndPx >= -20 && loopEndPx <= w + 20) {
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(Math.floor(loopEndPx) - 15, miniH, 15, 8);
          ctx.fillStyle = '#05060b';
          ctx.font = 'bold 7px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('OUT', Math.floor(loopEndPx) - 7.5, miniH + 4.5);
        }
      }

      // CUE Indicator on main zoomed scrolling waveform
      if (deck.hasCue) {
        const cuePixelX = halfW + ((deck.cuePosition - curPos) / zoomSeconds) * w;

        // Draw when visible within viewport margins
        if (cuePixelX >= -50 && cuePixelX <= w + 50) {
          ctx.save();

          // 1. Soft amber illumination glow along the needle
          ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
          ctx.fillRect(cuePixelX - 3, miniH, 6, mainH);

          // 2. High-contrast amber vertical cue needle
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cuePixelX, miniH);
          ctx.lineTo(cuePixelX, h);
          ctx.stroke();

          // 3. Hardware CUE Flag Badge at the top
          const flagW = 28;
          const flagH = 13;
          const flagLeft = cuePixelX - flagW / 2;
          const flagTop = miniH + 1;

          // Flag background
          ctx.fillStyle = '#f59e0b';
          if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(flagLeft, flagTop, flagW, flagH, 2);
            ctx.fill();
          } else {
            ctx.fillRect(flagLeft, flagTop, flagW, flagH);
          }

          // Flag pointer pointing down toward needle
          ctx.beginPath();
          ctx.moveTo(cuePixelX - 4, flagTop + flagH);
          ctx.lineTo(cuePixelX + 4, flagTop + flagH);
          ctx.lineTo(cuePixelX, flagTop + flagH + 4);
          ctx.closePath();
          ctx.fillStyle = '#f59e0b';
          ctx.fill();

          // Flag Text: "CUE"
          ctx.fillStyle = '#05060b';
          ctx.font = '900 8px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('CUE', cuePixelX, flagTop + flagH / 2 + 0.5);

          // 4. Bottom arrow pointer at floor of waveform
          ctx.beginPath();
          ctx.moveTo(cuePixelX - 4, h);
          ctx.lineTo(cuePixelX + 4, h);
          ctx.lineTo(cuePixelX, h - 5);
          ctx.closePath();
          ctx.fillStyle = '#f59e0b';
          ctx.fill();

          ctx.restore();
        }
      }

      // Hot Cues on main zoomed waveform
      if (deck.hotCues) {
        deck.hotCues.forEach((hc) => {
          if (!hc.active) return;
          const hcPixelX = halfW + ((hc.time - curPos) / zoomSeconds) * w;
          if (hcPixelX >= -40 && hcPixelX <= w + 40) {
            ctx.save();

            // Vertical line
            ctx.strokeStyle = hc.color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(hcPixelX, miniH);
            ctx.lineTo(hcPixelX, h);
            ctx.stroke();

            // Hot Cue Flag Badge
            const flagW = 18;
            const flagH = 11;
            const flagLeft = hcPixelX - flagW / 2;
            const flagTop = miniH + 1;

            ctx.fillStyle = hc.color;
            if (typeof ctx.roundRect === 'function') {
              ctx.beginPath();
              ctx.roundRect(flagLeft, flagTop, flagW, flagH, 2);
              ctx.fill();
            } else {
              ctx.fillRect(flagLeft, flagTop, flagW, flagH);
            }

            ctx.fillStyle = '#05060b';
            ctx.font = '900 8px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`C${hc.id}`, hcPixelX, flagTop + flagH / 2 + 0.5);

            ctx.restore();
          }
        });
      }

      // Red Center Playhead Needle
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(halfW, miniH);
      ctx.lineTo(halfW, h);
      ctx.stroke();

      // Top triangle on playhead needle
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(halfW - 4, miniH);
      ctx.lineTo(halfW + 4, miniH);
      ctx.lineTo(halfW, miniH + 4);
      ctx.closePath();
      ctx.fill();
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [deck, color, isPoweredOn]);

  const isDraggingWaveformRef = useRef(false);
  const isDraggingOverviewRef = useRef(false);
  const lastXRef = useRef(0);
  const lastTimeRef = useRef(0);
  const moveHistoryRef = useRef<Array<{ x: number; time: number }>>([]);
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
    if (!deck || !deck.buffer || !isPoweredOn) return;
    e.preventDefault();

    const now = performance.now();
    const dt = Math.max(0.008, Math.min(0.05, (now - lastWheelTimeRef.current) / 1000));
    lastWheelTimeRef.current = now;

    const mult = e.deltaMode === 1 ? 24 : e.deltaMode === 2 ? 240 : 1;
    const dx = (e.deltaX || 0) * mult;
    const dy = (e.deltaY || 0) * mult;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;

    // Trackpad gesture: swiping forward/up or right scrubs forward; swiping backward/down or left scrubs reverse
    const deltaDegrees = (dy * 1.2) - (dx * 0.8);
    deck.scratchRotate(deltaDegrees, dt);

    const instantVelocity = deltaDegrees / dt;
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

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!deck || !deck.buffer) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}

    const rect = canvas.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const clickX = e.clientX - rect.left;

    lastXRef.current = e.clientX;
    lastTimeRef.current = performance.now();
    moveHistoryRef.current = [{ x: e.clientX, time: lastTimeRef.current }];

    if (clickY <= 24) {
      // Clicked on mini-overview strip: scrub across entire track
      isDraggingOverviewRef.current = true;
      const rawTime = (clickX / rect.width) * deck.buffer.duration;
      if (deck.hasCue) {
        const cueX = (deck.cuePosition / deck.buffer.duration) * rect.width;
        if (Math.abs(clickX - cueX) < 8) {
          deck.seekTo(deck.cuePosition);
          return;
        }
      }
      deck.seekTo(rawTime);
    } else {
      // Clicked on main waveform: hold audio and begin waveform scrubbing
      isDraggingWaveformRef.current = true;
      deck.holdPlatter();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!deck || !deck.buffer) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    if (isDraggingOverviewRef.current) {
      // Continuous scrub across overview strip
      const currentX = e.clientX - rect.left;
      const targetTime = Math.max(0, Math.min(deck.buffer.duration, (currentX / rect.width) * deck.buffer.duration));
      deck.seekTo(targetTime);
    } else if (isDraggingWaveformRef.current) {
      // Continuous drag/move of the main zoomed waveform
      const now = performance.now();
      const dt = Math.max(0.005, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      const dx = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;

      moveHistoryRef.current.push({ x: e.clientX, time: now });
      moveHistoryRef.current = moveHistoryRef.current.filter((item) => now - item.time <= 100);

      if (Math.abs(dx) < 0.2) return;

      const zoomSeconds = 8;
      // Dragging right scrubs forward (+delta), dragging left scrubs reverse (-delta)
      const deltaSeconds = (dx / rect.width) * zoomSeconds;
      deck.scrubDelta(deltaSeconds, dt);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
    } catch (_) {}

    if (isDraggingWaveformRef.current && deck) {
      const now = performance.now();
      const history = moveHistoryRef.current.filter((item) => now - item.time <= 100);
      let triggeredInertia = false;
      if (history.length >= 2 && canvasRef.current) {
        const oldest = history[0];
        const newest = history[history.length - 1];
        const dt = (newest.time - oldest.time) / 1000;
        if (dt > 0.01) {
          const totalDx = newest.x - oldest.x;
          const rect = canvasRef.current.getBoundingClientRect();
          const zoomSeconds = 8;
          const velocitySecPerSec = (totalDx / rect.width / dt) * zoomSeconds;
          const angularSpeed = (velocitySecPerSec / 1.8) * 360; // deg/sec
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

    isDraggingWaveformRef.current = false;
    isDraggingOverviewRef.current = false;
  };

  return (
    <div
      onWheel={handleWheel}
      className={`relative w-full h-22 sm:h-24 md:h-26 border border-[#232534] bg-[#07080d] shadow-inner select-none touch-none transition-opacity duration-300 ${
        isPoweredOn
          ? 'cursor-grab active:cursor-grabbing'
          : 'opacity-25 grayscale pointer-events-none'
      }`}
      title={
        isPoweredOn
          ? 'Click & Drag or 2-finger scroll to scrub waveform (Top strip = full overview, Main wave = precision scrub)'
          : 'Deck Off'
      }
    >
      <canvas
        ref={canvasRef}
        width={800}
        height={104}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="w-full h-full block touch-none select-none"
      />
    </div>
  );
};
