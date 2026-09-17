// ---------------------------------------------------------------------------
// CrispAudio — TimelineRuler
// Time ruler drawn on a canvas. Scrolls in sync with TimelineCanvas.
// ---------------------------------------------------------------------------

import React, { useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineCanvasInvalidation } from './useTimelineCanvasInvalidation';
import { useTimelineCanvasPlayhead } from './useTimelineCanvasPlayhead';
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
  const { t } = useTranslation();
  const zoomLevel = useProjectStore((s) => s.zoomLevel);
  const scrollOffset = useProjectStore((s) => s.scrollOffset);
  const setPlayheadPosition = useProjectStore((s) => s.setPlayheadPosition);
  const playheadRef = useTimelineCanvasPlayhead(width);

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

    const isLight = document.documentElement.classList.contains('light');

    // Background
    ctx.fillStyle = isLight ? '#e2e8f0' : '#1e293b';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // Bottom border
    ctx.strokeStyle = isLight ? '#94a3b8' : '#334155';
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
    ctx.fillStyle = isLight ? '#475569' : '#94a3b8';

    // Minor ticks
    ctx.strokeStyle = isLight ? '#94a3b8' : '#334155';
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
    ctx.strokeStyle = isLight ? '#64748b' : '#475569';
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

  }, [zoomLevel, scrollOffset, width]);

  useTimelineCanvasInvalidation(draw);

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
    <div className="relative overflow-hidden" style={{ width, height: RULER_HEIGHT }}>
    <canvas
      ref={canvasRef}
      className="block cursor-pointer"
      style={{ width, height: RULER_HEIGHT }}
      onClick={handleClick}
      aria-label={t('timeline.ruler')}
    />
    <div ref={playheadRef} data-timeline-playhead aria-hidden="true" className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none">
      <div className="absolute top-0 -left-[5px] border-x-[5px] border-x-transparent border-t-[10px] border-t-red-500" />
    </div>
    </div>
  );
};

export default TimelineRuler;
