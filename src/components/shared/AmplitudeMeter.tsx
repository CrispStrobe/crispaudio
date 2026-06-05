import React, { useEffect, useRef } from 'react';

interface AmplitudeMeterProps {
  rms: number;   // 0..1 linear
  peak: number;  // 0..1 linear
  orientation?: 'horizontal' | 'vertical';
  height?: number;
  className?: string;
}

const DB_MIN = -60;
const DB_MAX = 0;
const DB_RANGE = DB_MAX - DB_MIN;

function linToDb(linear: number): number {
  if (linear <= 0) return DB_MIN;
  return Math.max(DB_MIN, 20 * Math.log10(linear));
}

function dbToNorm(db: number): number {
  return Math.max(0, Math.min(1, (db - DB_MIN) / DB_RANGE));
}

// Color stops matching green→yellow→red
function levelColor(norm: number): string {
  if (norm > 0.9) return '#ef4444'; // red
  if (norm > 0.75) return '#f97316'; // orange
  if (norm > 0.6) return '#f59e0b'; // yellow
  return '#22c55e'; // green
}

const DB_MARKS = [-60, -48, -36, -24, -18, -12, -6, -3, 0];

export const AmplitudeMeter: React.FC<AmplitudeMeterProps> = ({
  rms,
  peak,
  orientation = 'horizontal',
  height = 28,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const peakHoldRef = useRef<number>(0);
  const peakTimerRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const propsRef = useRef({ rms, peak });

  useEffect(() => {
    propsRef.current = { rms, peak };
  }, [rms, peak]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const syncSize = () => {
      if (orientation === 'horizontal') {
        canvas.width = container.clientWidth || 200;
        canvas.height = height;
      } else {
        canvas.width = 24;
        canvas.height = height;
      }
    };
    syncSize();

    const ro = new ResizeObserver(syncSize);
    ro.observe(container);

    const PEAK_HOLD_FRAMES = 60;
    const PEAK_DECAY = 0.008;
    let peakDecay = 0;
    let peakTimer = 0;

    const drawHorizontal = (ctx: CanvasRenderingContext2D) => {
      const { rms: r, peak: p } = propsRef.current;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = '#0f1117';
      ctx.fillRect(0, 0, w, h);

      const rmsDb = linToDb(r);
      const peakDb = linToDb(p);
      const rmsNorm = dbToNorm(rmsDb);
      const peakNorm = dbToNorm(peakDb);

      // Meter track (leave room for labels at bottom)
      const trackH = h - 14;
      const trackY = 0;

      // Background track
      ctx.fillStyle = document.documentElement.classList.contains('light') ? '#cbd5e1' : '#1f2937';
      ctx.roundRect(0, trackY, w, trackH, 2);
      ctx.fill();

      // RMS fill with gradient
      const rmsW = rmsNorm * w;
      if (rmsW > 0) {
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, '#22c55e');
        grad.addColorStop(0.6, '#22c55e');
        grad.addColorStop(0.75, '#f59e0b');
        grad.addColorStop(0.9, '#f97316');
        grad.addColorStop(1, '#ef4444');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(0, trackY, rmsW, trackH, 2);
        ctx.fill();
      }

      // Peak hold
      if (peakNorm >= peakHoldRef.current) {
        peakHoldRef.current = peakNorm;
        peakTimer = 0;
        peakDecay = 0;
      } else {
        peakTimer++;
        if (peakTimer > PEAK_HOLD_FRAMES) {
          peakDecay += PEAK_DECAY;
          peakHoldRef.current = Math.max(0, peakHoldRef.current - peakDecay);
        }
      }

      if (peakHoldRef.current > 0.01) {
        const px = peakHoldRef.current * w - 1;
        ctx.fillStyle = levelColor(peakHoldRef.current);
        ctx.fillRect(px, trackY, 2, trackH);
      }

      // Instantaneous peak tick
      if (peakNorm > 0.01) {
        const px = peakNorm * w - 1;
        ctx.fillStyle = levelColor(peakNorm) + 'aa';
        ctx.fillRect(px, trackY, 1, trackH);
      }

      // dB scale markings
      ctx.fillStyle = '#6b7280';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      for (const db of DB_MARKS) {
        const norm = dbToNorm(db);
        const x = norm * w;
        // tick
        ctx.fillStyle = db === 0 ? '#ef444488' : '#374151';
        ctx.fillRect(x, trackY, 1, trackH);
        // label
        if (db !== DB_MIN) {
          ctx.fillStyle = '#6b7280';
          ctx.fillText(db === 0 ? '0' : String(db), x, h - 2);
        }
      }

      // dB readout
      ctx.fillStyle = rmsNorm > 0.9 ? '#ef4444' : '#9ca3af';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${rmsDb.toFixed(1)} dBFS`, w - 2, h - 2);
    };

    const drawVertical = (ctx: CanvasRenderingContext2D) => {
      const { rms: r, peak: p } = propsRef.current;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = '#0f1117';
      ctx.fillRect(0, 0, w, h);

      const rmsDb = linToDb(r);
      const peakDb = linToDb(p);
      const rmsNorm = dbToNorm(rmsDb);
      const peakNorm = dbToNorm(peakDb);

      const trackW = w - 10;
      const trackX = 0;

      // Background
      ctx.fillStyle = document.documentElement.classList.contains('light') ? '#cbd5e1' : '#1f2937';
      ctx.roundRect(trackX, 0, trackW, h, 2);
      ctx.fill();

      // RMS fill
      const rmsH = rmsNorm * h;
      if (rmsH > 0) {
        const grad = ctx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, '#22c55e');
        grad.addColorStop(0.6, '#22c55e');
        grad.addColorStop(0.75, '#f59e0b');
        grad.addColorStop(0.9, '#f97316');
        grad.addColorStop(1, '#ef4444');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(trackX, h - rmsH, trackW, rmsH, 2);
        ctx.fill();
      }

      // Peak hold
      if (peakNorm >= peakHoldRef.current) {
        peakHoldRef.current = peakNorm;
        peakTimerRef.current = 0;
      } else {
        peakTimerRef.current++;
        if (peakTimerRef.current > PEAK_HOLD_FRAMES) {
          peakHoldRef.current = Math.max(0, peakHoldRef.current - PEAK_DECAY);
        }
      }

      if (peakHoldRef.current > 0.01) {
        const py = h - peakHoldRef.current * h;
        ctx.fillStyle = levelColor(peakHoldRef.current);
        ctx.fillRect(trackX, py, trackW, 2);
      }

      // Scale ticks + labels
      ctx.fillStyle = '#6b7280';
      ctx.font = '8px monospace';
      ctx.textAlign = 'left';
      for (const db of DB_MARKS) {
        const norm = dbToNorm(db);
        const y = h - norm * h;
        ctx.fillStyle = '#374151';
        ctx.fillRect(trackX, y, trackW, 1);
        if (db % 12 === 0 || db === 0 || db === -6) {
          ctx.fillStyle = '#6b7280';
          ctx.fillText(String(db), trackW + 2, y + 3);
        }
      }
    };

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (orientation === 'horizontal') {
        drawHorizontal(ctx);
      } else {
        drawVertical(ctx);
      }
    };

    loop();

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [orientation, height]);

  const containerStyle: React.CSSProperties =
    orientation === 'vertical'
      ? { width: 34, height, display: 'inline-block' }
      : { width: '100%', height };

  return (
    <div ref={containerRef} className={`overflow-hidden rounded ${className}`} style={containerStyle}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: `${height}px` }}
        className="rounded"
      />
    </div>
  );
};

export default AmplitudeMeter;
