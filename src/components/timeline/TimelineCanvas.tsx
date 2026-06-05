// ---------------------------------------------------------------------------
// CrispAudio — TimelineCanvas
// Canvas-based waveform renderer and interaction handler.
// This is the core of the timeline editor.
// ---------------------------------------------------------------------------

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useLayoutEffect,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { AudioSegment, TimelineTrack, AudioSource } from '../../types/audio';
import { useProjectStore } from '../../stores/projectStore';
import { useTimeline, TRACK_HEIGHT } from '../../hooks/useTimeline';

// ── Constants ─────────────────────────────────────────────────────────────────

function getTrackColors() {
  const isLight = document.documentElement.classList.contains('light');
  return {
    even: isLight ? '#e2e8f0' : '#1e293b',
    odd: isLight ? '#dce5f0' : '#172032',
  };
}
const WAVEFORM_LINE_WIDTH = 1;
const PLAYHEAD_COLOR = '#ef4444';
const SELECTION_COLOR = 'rgba(99, 102, 241, 0.18)';
const SNAP_GRID_COLOR = 'rgba(99, 102, 241, 0.08)';

// Segment swatch fallback colors (cycled by track index)
const SEGMENT_PALETTE = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
];

function segmentColor(seg: AudioSegment, trackIndex: number): string {
  return seg.color || SEGMENT_PALETTE[trackIndex % SEGMENT_PALETTE.length];
}

// ── Context menu state ────────────────────────────────────────────────────────

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  segmentId: string | null;
  time: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TimelineCanvasProps {
  /** Total width of the canvas area in CSS px (excluding track header). */
  width: number;
  /** Called when the canvas height changes (for parent layout). */
  onHeightChange?: (height: number) => void;
}

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({
  width,
  onHeightChange,
}) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    segmentId: null,
    time: 0,
  });

  const store = useProjectStore();
  const {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    getCursor,
    timeToPixels,
    canvasXToTime,
    canvasYToTrackIndex,
    snapTime,
  } = useTimeline();

  const { tracks } = store.project;
  const totalHeight = Math.max(3, tracks.length) * TRACK_HEIGHT;

  useEffect(() => {
    onHeightChange?.(totalHeight);
  }, [totalHeight, onHeightChange]);

  // ── Drawing ───────────────────────────────────────────────────────────────

  const drawWaveform = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      source: AudioSource,
      seg: AudioSegment,
      segLeft: number,
      segRight: number,
      segTop: number,
      segBottom: number,
      baseColor: string,
    ) => {
      const { peaks } = source;
      const { min: peakMin, max: peakMax } = peaks;
      const peakCount = peakMax.length;

      const segWidth = segRight - segLeft;
      const segHeight = segBottom - segTop;
      const midY = segTop + segHeight / 2;
      const halfHeight = (segHeight - 12) / 2; // 6px padding top/bottom

      if (segWidth < 2 || peakCount === 0) return;

      // How many peak samples map to 1 canvas pixel?
      // sourceOffset + duration determine which part of the peaks array to show
      const sourceTotal = source.duration;
      const samplesPerPeak = sourceTotal / peakCount;

      const visibleStart = seg.sourceOffset; // seconds into source
      const visibleEnd = seg.sourceOffset + seg.duration;

      const peakStart = (visibleStart / sourceTotal) * peakCount;
      const peakEnd = Math.min(peakCount, (visibleEnd / sourceTotal) * peakCount);
      const peakRange = peakEnd - peakStart;

      const pixelsPerPeakSample = segWidth / peakRange;

      // Draw waveform using min/max peaks
      ctx.save();
      ctx.beginPath();
      // Clip to segment bounds
      ctx.rect(segLeft, segTop, segWidth, segHeight);
      ctx.clip();

      // Waveform fill
      ctx.fillStyle = hexToRgba(baseColor, 0.3);
      ctx.beginPath();

      // Draw upper envelope (max)
      ctx.moveTo(segLeft, midY);
      for (let px = 0; px <= segWidth; px++) {
        const peakIdx = Math.floor(peakStart + (px / segWidth) * peakRange);
        const clampedIdx = Math.min(peakCount - 1, Math.max(0, peakIdx));
        const maxVal = peakMax[clampedIdx];
        const y = midY - maxVal * halfHeight;
        if (px === 0) {
          ctx.moveTo(segLeft + px, y);
        } else {
          ctx.lineTo(segLeft + px, y);
        }
      }

      // Draw lower envelope (min) in reverse
      for (let px = segWidth; px >= 0; px--) {
        const peakIdx = Math.floor(peakStart + (px / segWidth) * peakRange);
        const clampedIdx = Math.min(peakCount - 1, Math.max(0, peakIdx));
        const minVal = peakMin[clampedIdx];
        const y = midY - minVal * halfHeight; // min is negative
        ctx.lineTo(segLeft + px, y);
      }

      ctx.closePath();
      ctx.fill();

      // Waveform outline stroke (max line)
      ctx.strokeStyle = hexToRgba(baseColor, 0.85);
      ctx.lineWidth = WAVEFORM_LINE_WIDTH;
      ctx.beginPath();
      for (let px = 0; px <= segWidth; px++) {
        const peakIdx = Math.floor(peakStart + (px / segWidth) * peakRange);
        const clampedIdx = Math.min(peakCount - 1, Math.max(0, peakIdx));
        const maxVal = peakMax[clampedIdx];
        const y = midY - maxVal * halfHeight;
        if (px === 0) {
          ctx.moveTo(segLeft + px, y);
        } else {
          ctx.lineTo(segLeft + px, y);
        }
      }
      ctx.stroke();

      // Min line
      ctx.beginPath();
      for (let px = 0; px <= segWidth; px++) {
        const peakIdx = Math.floor(peakStart + (px / segWidth) * peakRange);
        const clampedIdx = Math.min(peakCount - 1, Math.max(0, peakIdx));
        const minVal = peakMin[clampedIdx];
        const y = midY - minVal * halfHeight;
        if (px === 0) {
          ctx.moveTo(segLeft + px, y);
        } else {
          ctx.lineTo(segLeft + px, y);
        }
      }
      ctx.stroke();

      ctx.restore();
      void samplesPerPeak; // suppress unused warning
      void pixelsPerPeakSample;
    },
    [],
  );

  const drawFadeOverlay = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      seg: AudioSegment,
      segLeft: number,
      segRight: number,
      segTop: number,
      segBottom: number,
      baseColor: string,
    ) => {
      const segHeight = segBottom - segTop;

      // Fade in
      if (seg.fadeInDuration > 0) {
        const fadeInEndX = segLeft + seg.fadeInDuration * store.zoomLevel;
        const clampedFadeInEnd = Math.min(fadeInEndX, segRight);
        const fadeWidth = clampedFadeInEnd - segLeft;

        if (fadeWidth > 0) {
          const grad = ctx.createLinearGradient(segLeft, 0, clampedFadeInEnd, 0);
          grad.addColorStop(0, hexToRgba(baseColor, 0.6));
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(segLeft, segTop, fadeWidth, segHeight);

          // Curve indicator line
          ctx.strokeStyle = hexToRgba(baseColor, 0.9);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(segLeft, segBottom);
          drawFadeCurveSegment(ctx, seg.fadeInCurve, segLeft, segTop, clampedFadeInEnd, segBottom, 'in');
          ctx.stroke();
        }
      }

      // Fade out
      if (seg.fadeOutDuration > 0) {
        const fadeOutStartX = segRight - seg.fadeOutDuration * store.zoomLevel;
        const clampedFadeOutStart = Math.max(fadeOutStartX, segLeft);
        const fadeWidth = segRight - clampedFadeOutStart;

        if (fadeWidth > 0) {
          const grad = ctx.createLinearGradient(clampedFadeOutStart, 0, segRight, 0);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(1, hexToRgba(baseColor, 0.6));
          ctx.fillStyle = grad;
          ctx.fillRect(clampedFadeOutStart, segTop, fadeWidth, segHeight);

          // Curve indicator line
          ctx.strokeStyle = hexToRgba(baseColor, 0.9);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          drawFadeCurveSegment(ctx, seg.fadeOutCurve, clampedFadeOutStart, segBottom, segRight, segTop, 'out');
          ctx.stroke();
        }
      }
    },
    [store.zoomLevel],
  );

  const drawSegment = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      seg: AudioSegment,
      track: TimelineTrack,
      trackIndex: number,
      isSelected: boolean,
    ) => {
      const segLeft = timeToPixels(seg.startTime);
      const segRight = timeToPixels(seg.startTime + seg.duration);
      const segTop = trackIndex * TRACK_HEIGHT + 4;
      const segBottom = trackIndex * TRACK_HEIGHT + TRACK_HEIGHT - 4;

      // Cull off-screen segments
      const canvasWidth = canvasRef.current?.width ?? 0;
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvasWidth / dpr;
      if (segRight < 0 || segLeft > cssWidth) return;

      const baseColor = segmentColor(seg, trackIndex);
      const segHeight = segBottom - segTop;

      // Background
      ctx.fillStyle = hexToRgba(baseColor, isSelected ? 0.4 : 0.25);
      ctx.beginPath();
      roundRect(ctx, segLeft, segTop, segRight - segLeft, segHeight, 3);
      ctx.fill();

      // Border
      ctx.strokeStyle = isSelected
        ? baseColor
        : hexToRgba(baseColor, 0.7);
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.beginPath();
      roundRect(ctx, segLeft, segTop, segRight - segLeft, segHeight, 3);
      ctx.stroke();

      // Color header bar
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      roundRectTop(ctx, segLeft, segTop, segRight - segLeft, 6, 3);
      ctx.fill();

      // Waveform
      const source = store.sources.get(seg.sourceId);
      if (source && segRight - segLeft > 4) {
        drawWaveform(ctx, source, seg, segLeft, segRight, segTop + 6, segBottom, baseColor);
      }

      // Fade overlays
      drawFadeOverlay(ctx, seg, segLeft, segRight, segTop, segBottom, baseColor);

      // Segment name label
      if (segRight - segLeft > 30) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(segLeft + 4, segTop, segRight - segLeft - 8, segHeight);
        ctx.clip();
        ctx.font = '10px Inter, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(seg.name || 'Segment', segLeft + 6, segTop + 16);
        ctx.restore();
      }

      // Selected glow border
      if (isSelected) {
        ctx.shadowColor = baseColor;
        ctx.shadowBlur = 6;
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        roundRect(ctx, segLeft, segTop, segRight - segLeft, segHeight, 3);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      void track;
    },
    [timeToPixels, store.sources, drawWaveform, drawFadeOverlay],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cssWidth = width;
    const cssHeight = totalHeight;

    if (
      canvas.width !== Math.round(cssWidth * dpr) ||
      canvas.height !== Math.round(cssHeight * dpr)
    ) {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // ── Track backgrounds ─────────────────────────────────────────────────
    for (let i = 0; i < Math.max(tracks.length, 1); i++) {
      const tc = getTrackColors();
      ctx.fillStyle = i % 2 === 0 ? tc.even : tc.odd;
      ctx.fillRect(0, i * TRACK_HEIGHT, cssWidth, TRACK_HEIGHT);

      // Track divider
      ctx.strokeStyle = tc.even; // segment border matches track bg
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, (i + 1) * TRACK_HEIGHT - 0.5);
      ctx.lineTo(cssWidth, (i + 1) * TRACK_HEIGHT - 0.5);
      ctx.stroke();
    }

    // ── Snap grid lines ───────────────────────────────────────────────────
    if (store.snapEnabled && store.zoomLevel > 30) {
      const snapInterval = Math.max(0.1, 100 / store.zoomLevel);
      const gridStart = Math.floor(store.scrollOffset / snapInterval) * snapInterval;
      ctx.strokeStyle = SNAP_GRID_COLOR;
      ctx.lineWidth = 1;
      const timeEnd = store.scrollOffset + cssWidth / store.zoomLevel;
      for (let t = gridStart; t <= timeEnd; t += snapInterval) {
        const x = Math.round(timeToPixels(t)) + 0.5;
        if (x < 0 || x > cssWidth) continue;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cssHeight);
        ctx.stroke();
      }
    }

    // ── Selection highlight ───────────────────────────────────────────────
    if (store.selection) {
      const selLeft = timeToPixels(store.selection.startTime);
      const selRight = timeToPixels(store.selection.endTime);
      if (selRight > 0 && selLeft < cssWidth) {
        ctx.fillStyle = SELECTION_COLOR;
        ctx.fillRect(
          Math.max(0, selLeft),
          0,
          Math.min(cssWidth, selRight) - Math.max(0, selLeft),
          cssHeight,
        );
      }
    }

    // ── Segments ──────────────────────────────────────────────────────────
    const selectedIds = new Set(store.selection?.segmentIds ?? []);

    for (let ti = 0; ti < tracks.length; ti++) {
      const track = tracks[ti];
      for (const seg of track.segments) {
        drawSegment(ctx, seg, track, ti, selectedIds.has(seg.id));
      }
    }

    // ── Playhead ──────────────────────────────────────────────────────────
    const phX = timeToPixels(store.playheadPosition);
    if (phX >= 0 && phX <= cssWidth) {
      ctx.strokeStyle = PLAYHEAD_COLOR;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(phX + 0.5, 0);
      ctx.lineTo(phX + 0.5, cssHeight);
      ctx.stroke();

      // Small circle at top
      ctx.fillStyle = PLAYHEAD_COLOR;
      ctx.beginPath();
      ctx.arc(phX, 4, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [
    width,
    totalHeight,
    tracks,
    store.snapEnabled,
    store.zoomLevel,
    store.scrollOffset,
    store.selection,
    store.playheadPosition,
    timeToPixels,
    drawSegment,
  ]);

  // ── RAF loop ──────────────────────────────────────────────────────────────

  useLayoutEffect(() => {
    const loop = () => {
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  // ── Mouse wheel zoom ──────────────────────────────────────────────────────

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom centered on cursor
        const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const timeAtCursor = store.scrollOffset + cursorX / store.zoomLevel;

        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const newZoom = Math.max(10, Math.min(2000, store.zoomLevel * factor));

        // Keep time-at-cursor stable
        const newScroll = Math.max(0, timeAtCursor - cursorX / newZoom);
        store.setZoomLevel(newZoom);
        store.setScrollOffset(newScroll);
      } else {
        // Horizontal scroll
        const delta = e.deltaY / store.zoomLevel;
        store.setScrollOffset(Math.max(0, store.scrollOffset + delta));
      }
    },
    [store],
  );

  // ── Mouse move for cursor ─────────────────────────────────────────────────

  const [cursor, setCursor] = useState('default');

  const handleMouseMoveWithCursor = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      onMouseMove(e);

      const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setCursor(getCursor(cx, cy));
    },
    [onMouseMove, getCursor],
  );

  // ── Context menu ──────────────────────────────────────────────────────────

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const time = canvasXToTime(cx);
      const trackIndex = canvasYToTrackIndex(cy);
      const track = tracks[trackIndex];
      let segmentId: string | null = null;

      if (track) {
        for (const seg of track.segments) {
          if (time >= seg.startTime && time <= seg.startTime + seg.duration) {
            segmentId = seg.id;
            break;
          }
        }
      }

      setContextMenu({ visible: true, x: e.clientX, y: e.clientY, segmentId, time });
    },
    [canvasXToTime, canvasYToTrackIndex, tracks],
  );

  const closeMenu = useCallback(() =>
    setContextMenu((m) => ({ ...m, visible: false })), []);

  const handleSplit = useCallback(() => {
    if (contextMenu.segmentId) {
      store.splitSegment(contextMenu.segmentId, contextMenu.time);
    }
    closeMenu();
  }, [contextMenu, store, closeMenu]);

  const handleDeleteSeg = useCallback(() => {
    if (contextMenu.segmentId) {
      store.removeSegment(contextMenu.segmentId);
    }
    closeMenu();
  }, [contextMenu, store, closeMenu]);

  const handleCopySeg = useCallback(() => {
    if (contextMenu.segmentId) {
      store.selectSegment(contextMenu.segmentId);
      store.copy();
    }
    closeMenu();
  }, [contextMenu, store, closeMenu]);

  const handleCutSeg = useCallback(() => {
    if (contextMenu.segmentId) {
      store.selectSegment(contextMenu.segmentId);
      store.cut();
    }
    closeMenu();
  }, [contextMenu, store, closeMenu]);

  const handlePasteHere = useCallback(() => {
    store.paste(snapTime(contextMenu.time));
    closeMenu();
  }, [contextMenu.time, store, closeMenu, snapTime]);

  // ── Dismiss context menu on outside click ─────────────────────────────────

  useEffect(() => {
    if (!contextMenu.visible) return;
    const dismiss = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-timeline-menu]')) {
        closeMenu();
      }
    };
    window.addEventListener('mousedown', dismiss);
    return () => window.removeEventListener('mousedown', dismiss);
  }, [contextMenu.visible, closeMenu]);

  return (
    <div ref={containerRef} className="relative" style={{ height: totalHeight }}>
      <canvas
        ref={canvasRef}
        className="block"
        style={{ cursor, width, height: totalHeight }}
        onMouseDown={onMouseDown}
        onMouseMove={handleMouseMoveWithCursor}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onContextMenu={handleContextMenu}
      />

      {/* Context menu */}
      {contextMenu.visible && (
        <div
          data-timeline-menu
          className="fixed z-50 bg-gray-800 border border-gray-600 rounded shadow-xl py-1 min-w-[160px] text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.segmentId ? (
            <>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-200"
                onClick={handleSplit}
              >
                {t('timeline.split')}
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-200"
                onClick={handleCopySeg}
              >
                {t('timeline.copy')}
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-200"
                onClick={handleCutSeg}
              >
                {t('timeline.cut')}
              </button>
              <div className="h-px bg-gray-700 my-1" />
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-red-400"
                onClick={handleDeleteSeg}
              >
                {t('timeline.delete')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-200"
              onClick={handlePasteHere}
            >
              {t('timeline.paste')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TimelineCanvas;

// ── Drawing utilities ─────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const len = h.length;
  if (len === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function roundRectTop(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function drawFadeCurveSegment(
  ctx: CanvasRenderingContext2D,
  curve: 'linear' | 'exponential' | 'scurve',
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  direction: 'in' | 'out',
): void {
  const w = x2 - x1;
  const steps = Math.max(4, Math.round(w / 4));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let gain: number;

    switch (curve) {
      case 'linear':
        gain = direction === 'in' ? t : 1 - t;
        break;
      case 'exponential':
        gain = direction === 'in'
          ? Math.pow(Math.max(0, t), 2)
          : Math.pow(Math.max(0, 1 - t), 2);
        break;
      case 'scurve':
        gain = direction === 'in'
          ? t * t * (3 - 2 * t)
          : 1 - t * t * (3 - 2 * t);
        break;
    }

    const x = x1 + t * w;
    // y1 is bottom (amplitude=1 at end of fade-in, amplitude=0 at start)
    // y2 is top
    const y = y1 + (y2 - y1) * gain;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
}
