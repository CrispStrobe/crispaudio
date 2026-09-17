import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { canvasBgGradient, canvasGridColor, canvasEmptyColor } from '../../lib/themeColors';

export const SfxWaveform = memo(function SfxWaveform({
  buffer,
  isPlaying,
  title,
  duration,
  noSignalText = 'No signal',
}: {
  buffer: Float32Array | null;
  isPlaying?: boolean;
  title: string;
  duration?: number;
  noSignalText?: string;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, offset: 0 });

  const MAX_ZOOM = 16;

  // Clamp scroll offset within valid range for a given zoom
  const clampOffset = useCallback((offset: number, zoom: number) => {
    const viewSize = 1 / zoom;
    return Math.max(0, Math.min(offset, 1 - viewSize));
  }, []);

  // Handle zoom change (shared by wheel and buttons)
  const applyZoom = useCallback((newZoom: number, pivotNorm?: number) => {
    const clamped = Math.max(1, Math.min(MAX_ZOOM, newZoom));
    setZoomLevel((prevZoom) => {
      const pivot = pivotNorm ?? (scrollOffset + (1 / prevZoom) / 2);
      const newViewSize = 1 / clamped;
      const newOffset = clampOffset(pivot - newViewSize / 2, clamped);
      setScrollOffset(newOffset);
      return clamped;
    });
  }, [scrollOffset, clampOffset]);

  // Mouse wheel zoom (Ctrl or Shift held)
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!e.ctrlKey && !e.shiftKey) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const pivotX = (e.clientX - rect.left) / rect.width;
    const pivotNorm = scrollOffset + pivotX / zoomLevel;
    const factor = e.deltaY < 0 ? 1.25 : 0.8;
    applyZoom(zoomLevel * factor, pivotNorm);
  }, [zoomLevel, scrollOffset, applyZoom]);

  // Drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (zoomLevel <= 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, offset: scrollOffset };
  }, [zoomLevel, scrollOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - dragStartRef.current.x) / rect.width;
    const newOffset = clampOffset(dragStartRef.current.offset - dx / zoomLevel, zoomLevel);
    setScrollOffset(newOffset);
  }, [isDragging, zoomLevel, clampOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Pointer wrappers so panning works with touch/pen as well as mouse.
  // Capture the pointer so a pan keeps tracking off-canvas.
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (zoomLevel <= 1) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    handleMouseDown(e);
  }, [zoomLevel, handleMouseDown]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    handleMouseUp();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, [handleMouseUp]);

  // Draw the static waveform (zoomed view)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = canvasBgGradient(ctx, h);
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = canvasGridColor();
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = (i / 4) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (!buffer || buffer.length === 0) {
      ctx.fillStyle = canvasEmptyColor();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(noSignalText, w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    // Calculate visible sample range
    const viewSize = 1 / zoomLevel;
    const startSample = Math.floor(scrollOffset * buffer.length);
    const endSample = Math.min(buffer.length, Math.ceil((scrollOffset + viewSize) * buffer.length));
    const visibleLength = endSample - startSample;

    if (isPlaying) {
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 10;
    }

    ctx.strokeStyle = isPlaying ? '#10b981' : '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const step = visibleLength / w;
    for (let i = 0; i < w; i++) {
      const idx = startSample + Math.floor(i * step);
      const sample = buffer[Math.min(idx, buffer.length - 1)] || 0;
      const y = (sample * h * 0.4) + (h / 2);
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [buffer, isPlaying, noSignalText, zoomLevel, scrollOffset]);

  // Draw minimap
  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas || zoomLevel <= 1) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    if (buffer && buffer.length > 0) {
      // Draw full waveform in minimap
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const step = buffer.length / w;
      for (let i = 0; i < w; i++) {
        const sample = buffer[Math.floor(i * step)] || 0;
        const y = (sample * h * 0.4) + (h / 2);
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      ctx.stroke();

      // Draw visible region highlight
      const viewSize = 1 / zoomLevel;
      const rx = scrollOffset * w;
      const rw = viewSize * w;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.fillRect(rx, 0, rw, h);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx, 0, rw, h);
    }
  }, [buffer, zoomLevel, scrollOffset]);

  // View changes must not restart the elapsed playback clock.
  useEffect(() => {
    if (isPlaying && duration && duration > 0) {
      startTimeRef.current = performance.now();
    }
  }, [isPlaying, duration]);

  // Animate playhead during playback
  useEffect(() => {
    const el = playheadRef.current;
    if (!el) return;

    if (isPlaying && duration && duration > 0) {
      const tick = () => {
        rafRef.current = null;
        if (document.visibilityState === 'hidden') return;
        const elapsed = (performance.now() - startTimeRef.current) / 1000;
        const progress = Math.min(elapsed / duration, 1);
        // Convert global progress to zoomed view position
        const viewSize = 1 / zoomLevel;
        const viewProgress = (progress - scrollOffset) / viewSize;
        if (viewProgress >= 0 && viewProgress <= 1) {
          el.style.left = `${viewProgress * 100}%`;
          el.style.display = 'block';
        } else {
          el.style.display = 'none';
        }
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          el.style.display = 'none';
        }
      };

      const onVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        } else if (rafRef.current === null) {
          // Audio continues while hidden; catch up without resetting the clock.
          tick();
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      onVisibilityChange();
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
    } else {
      el.style.display = 'none';
    }
  }, [isPlaying, duration, zoomLevel, scrollOffset]);

  const handleZoomIn = useCallback(() => {
    applyZoom(zoomLevel * 1.5);
  }, [zoomLevel, applyZoom]);

  const handleZoomOut = useCallback(() => {
    applyZoom(zoomLevel / 1.5);
  }, [zoomLevel, applyZoom]);

  const handleZoomReset = useCallback(() => {
    setZoomLevel(1);
    setScrollOffset(0);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <div className="flex items-center gap-1">
          {zoomLevel > 1 && (
            <button
              onClick={handleZoomReset}
              className="px-1.5 py-0.5 text-[10px] font-mono text-blue-300 bg-blue-900/40 rounded hover:bg-blue-800/60 transition-colors"
              title={t('sfx.zoomReset')}
            >
              {zoomLevel.toFixed(1)}x
            </button>
          )}
          <button
            onClick={handleZoomOut}
            disabled={zoomLevel <= 1}
            className="p-0.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-default transition-colors"
            title={t('sfx.zoomOut')}
            aria-label={t('sfx.zoomOut')}
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={handleZoomIn}
            disabled={zoomLevel >= MAX_ZOOM}
            className="p-0.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-default transition-colors"
            title={t('sfx.zoomIn')}
            aria-label={t('sfx.zoomIn')}
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={400}
          height={120}
          className={`w-full h-24 rounded border border-gray-700 ${zoomLevel > 1 ? 'cursor-grab' : ''} ${isDragging ? 'cursor-grabbing' : ''}`}
          style={{ touchAction: zoomLevel > 1 ? 'none' : 'auto' }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handleMouseMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <div
          ref={playheadRef}
          className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
          style={{ display: 'none', left: 0 }}
        />
      </div>
      {zoomLevel > 1 && (
        <canvas
          ref={minimapRef}
          width={400}
          height={16}
          className="w-full mt-1 rounded border border-gray-700/50"
          style={{ height: '16px' }}
        />
      )}
    </div>
  );
});
