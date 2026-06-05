import React, { useEffect, useRef, useMemo } from 'react';

export interface WaveformPeaks {
  min: Float32Array;
  max: Float32Array;
}

export interface SelectionRegion {
  start: number; // 0..1 normalized
  end: number;   // 0..1 normalized
}

interface WaveformDisplayProps {
  samples?: Float32Array;
  peaks?: WaveformPeaks;
  color?: string;
  height?: number;
  selection?: SelectionRegion;
  className?: string;
}

function buildPeaks(samples: Float32Array, numBins: number): WaveformPeaks {
  const min = new Float32Array(numBins);
  const max = new Float32Array(numBins);
  const binSize = samples.length / numBins;

  for (let b = 0; b < numBins; b++) {
    let lo = Infinity;
    let hi = -Infinity;
    const start = Math.floor(b * binSize);
    const end = Math.floor((b + 1) * binSize);
    for (let i = start; i < end && i < samples.length; i++) {
      const s = samples[i];
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
    min[b] = lo === Infinity ? 0 : lo;
    max[b] = hi === -Infinity ? 0 : hi;
  }

  return { min, max };
}

export const WaveformDisplay: React.FC<WaveformDisplayProps> = ({
  samples,
  peaks: externalPeaks,
  color = '#6366f1',
  height = 80,
  selection,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(0);

  // Derive peaks from samples when no pre-computed peaks supplied
  const peaks = useMemo<WaveformPeaks | null>(() => {
    if (externalPeaks) return externalPeaks;
    if (!samples || samples.length === 0) return null;
    // Will be computed per canvas width inside the draw effect
    return null;
  }, [externalPeaks, samples]);

  const draw = (canvas: HTMLCanvasElement) => {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, 0, w, h);

    const isLight = document.documentElement.classList.contains('light');

    // Center line
    ctx.strokeStyle = isLight ? '#94a3b8' : '#374151';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Subtle grid lines at ±50%
    ctx.strokeStyle = isLight ? '#cbd5e1' : '#1f2937';
    ctx.lineWidth = 1;
    [0.25, 0.75].forEach(y => {
      ctx.beginPath();
      ctx.moveTo(0, y * h);
      ctx.lineTo(w, y * h);
      ctx.stroke();
    });

    // Resolve peaks
    let p: WaveformPeaks | null = peaks;
    if (!p && samples && samples.length > 0) {
      p = buildPeaks(samples, w);
    }

    if (!p) {
      ctx.fillStyle = '#374151';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No audio', w / 2, h / 2 + 4);
      ctx.textAlign = 'left';
      return;
    }

    const numBins = p.min.length;
    const binW = w / numBins;
    const mid = h / 2;
    const amp = mid * 0.92;

    // Fill area (min/max silhouette)
    const fillColor = color;
    const fillAlpha = 0.25;
    ctx.fillStyle = fillColor + Math.round(fillAlpha * 255).toString(16).padStart(2, '0');
    ctx.beginPath();
    // Top contour (max values, left→right)
    ctx.moveTo(0, mid - p.max[0] * amp);
    for (let i = 1; i < numBins; i++) {
      ctx.lineTo(i * binW, mid - p.max[i] * amp);
    }
    // Bottom contour (min values, right→left)
    for (let i = numBins - 1; i >= 0; i--) {
      ctx.lineTo(i * binW, mid - p.min[i] * amp);
    }
    ctx.closePath();
    ctx.fill();

    // Stroke outline
    ctx.strokeStyle = fillColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid - p.max[0] * amp);
    for (let i = 1; i < numBins; i++) {
      ctx.lineTo(i * binW, mid - p.max[i] * amp);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, mid - p.min[0] * amp);
    for (let i = 1; i < numBins; i++) {
      ctx.lineTo(i * binW, mid - p.min[i] * amp);
    }
    ctx.stroke();

    // Selection overlay
    if (selection) {
      const sx = selection.start * w;
      const ex = selection.end * w;
      ctx.fillStyle = 'rgba(99,102,241,0.18)';
      ctx.fillRect(sx, 0, ex - sx, h);
      ctx.strokeStyle = 'rgba(99,102,241,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, 0); ctx.lineTo(sx, h);
      ctx.moveTo(ex, 0); ctx.lineTo(ex, h);
      ctx.stroke();
    }
  };

  // ResizeObserver to redraw on width change
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const newW = Math.floor(entry.contentRect.width);
        if (newW !== widthRef.current && newW > 0) {
          widthRef.current = newW;
          canvas.width = newW;
          canvas.height = height;
          draw(canvas);
        }
      }
    });

    ro.observe(container);
    // Initial size
    const initW = Math.floor(container.clientWidth) || 400;
    widthRef.current = initW;
    canvas.width = initW;
    canvas.height = height;
    draw(canvas);

    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw on data/selection changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples, peaks, color, height, selection]);

  return (
    <div ref={containerRef} className={`w-full overflow-hidden rounded ${className}`} style={{ height }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: `${height}px` }}
        className="rounded"
      />
    </div>
  );
};

export default WaveformDisplay;
