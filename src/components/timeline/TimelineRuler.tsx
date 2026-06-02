// ---------------------------------------------------------------------------
// CrispAudio — TimelineRuler
// Time ruler drawn on a canvas. Scrolls in sync with TimelineCanvas.
// ---------------------------------------------------------------------------

import React, { useRef, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { RULER_HEIGHT } from '../../hooks/useTimeline';

interface TimelineRulerProps {
  width: number; // canvas CSS + buffer width
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return a "nice" tick interval (seconds) given the pixels-per-second zoom.
 * We target roughly 80–120 px between major ticks.
 */
function chooseMajorInterval(zoomLevel: number): number {
  const targetPx = 100;
  const secondsPerTarget = targetPx / zoomLevel;
  // Round to a nice value
  const nice = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300];
  for (const n of nice) {
    if (n >= secondsPerTarget) return n;
  }
  return 300;
}

function formatRulerTime(seconds: number, interval: number): string {
  if (interval < 1) {
    return seconds.toFixed(interval < 0.1 ? 2 : 1);
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const TimelineRuler: React.FC<TimelineRulerProps> = ({ width }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { zoomLevel, scrollOffset, playheadPosition, setPlayheadPosition } =
    useProjectStore();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cssWidth = width;
    const cssHeight = RULER_HEIGHT;

    // Resize if needed
    if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // Background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // Bottom border
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cssHeight - 0.5);
    ctx.lineTo(cssWidth, cssHeight - 0.5);
    ctx.stroke();

    const majorInterval = chooseMajorInterval(zoomLevel);
    const minorInterval = majorInterval / 5;

    // Time range visible
    const timeStart = scrollOffset;
    const timeEnd = scrollOffset + cssWidth / zoomLevel;

    // First tick aligned to interval
    const firstMajor = Math.floor(timeStart / majorInterval) * majorInterval;
    const firstMinor = Math.floor(timeStart / minorInterval) * minorInterval;

    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';

    // Minor ticks
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let t = firstMinor; t <= timeEnd + minorInterval; t += minorInterval) {
      const x = (t - scrollOffset) * zoomLevel;
      if (x < 0 || x > cssWidth) continue;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, cssHeight - 6);
      ctx.lineTo(x + 0.5, cssHeight - 1);
      ctx.stroke();
    }

    // Major ticks + labels
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    for (let t = firstMajor; t <= timeEnd + majorInterval; t += majorInterval) {
      const x = (t - scrollOffset) * zoomLevel;
      if (x < -20 || x > cssWidth + 20) continue;

      // Tick line
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 4);
      ctx.lineTo(x + 0.5, cssHeight - 1);
      ctx.stroke();

      // Label
      if (x >= 0) {
        const label = formatRulerTime(t, majorInterval);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(label, x + 3, 14);
      }
    }

    // Playhead indicator (triangle)
    const phX = (playheadPosition - scrollOffset) * zoomLevel;
    if (phX >= 0 && phX <= cssWidth) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(phX, 0);
      ctx.lineTo(phX - 5, 10);
      ctx.lineTo(phX + 5, 10);
      ctx.closePath();
      ctx.fill();

      // Thin line down
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(phX + 0.5, 10);
      ctx.lineTo(phX + 0.5, cssHeight);
      ctx.stroke();
    }
  }, [zoomLevel, scrollOffset, playheadPosition, width]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = scrollOffset + x / zoomLevel;
      setPlayheadPosition(Math.max(0, time));
    },
    [scrollOffset, zoomLevel, setPlayheadPosition],
  );

  return (
    <canvas
      ref={canvasRef}
      className="block cursor-pointer"
      style={{ width, height: RULER_HEIGHT }}
      onClick={handleClick}
      aria-label="Timeline ruler"
    />
  );
};

export default TimelineRuler;
