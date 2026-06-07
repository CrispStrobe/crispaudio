// ---------------------------------------------------------------------------
// EnvelopeDisplay -- reusable volume envelope from audio buffer
// ADSRDisplay   -- parametric ADSR curve shape visualization
// Extracted from SFXPanel for shared use.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { canvasBgFlat, canvasTextColor } from '../../lib/themeColors';

// ---------------------------------------------------------------------------
// EnvelopeDisplay (buffer-based)
// ---------------------------------------------------------------------------

export interface EnvelopeDisplayProps {
  buffer: Float32Array | null;
  sampleRate: number;
  title?: string;
}

export function EnvelopeDisplay({
  buffer,
  sampleRate,
  title,
}: EnvelopeDisplayProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('sfx.volumeEnvelope');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(400);

  // ResizeObserver to match canvas pixel width to container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const newW = Math.floor(entry.contentRect.width * dpr);
        if (newW > 0) setCanvasWidth(newW);
      }
    });

    ro.observe(container);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const initW = Math.floor((container.clientWidth || 400) * dpr);
    if (initW > 0) setCanvasWidth(initW);

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.width;
    const h = canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const lw = w / dpr;
    const lh = h / dpr;

    ctx.fillStyle = canvasBgFlat();
    ctx.fillRect(0, 0, lw, lh);

    if (!buffer || buffer.length === 0) return;

    const windowSize = Math.max(1, Math.floor(buffer.length / lw));
    const envelope: number[] = [];
    for (let i = 0; i < lw; i++) {
      let sum = 0;
      const start = i * windowSize;
      const end = Math.min(start + windowSize, buffer.length);
      for (let j = start; j < end; j++) {
        sum += buffer[j] * buffer[j];
      }
      envelope.push(Math.sqrt(sum / (end - start)));
    }

    const maxEnv = Math.max(...envelope);

    // Fill area
    ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
    ctx.beginPath();
    ctx.moveTo(0, lh);
    for (let i = 0; i < envelope.length; i++) {
      const norm = maxEnv > 0 ? envelope[i] / maxEnv : 0;
      ctx.lineTo(i, lh - norm * lh * 0.8);
    }
    ctx.lineTo(lw, lh);
    ctx.closePath();
    ctx.fill();

    // Stroke
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < envelope.length; i++) {
      const norm = maxEnv > 0 ? envelope[i] / maxEnv : 0;
      const y = lh - norm * lh * 0.8;
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();

    // Time labels
    ctx.fillStyle = canvasTextColor();
    ctx.font = '10px monospace';
    const duration = buffer.length / sampleRate;
    ctx.fillText('0s', 2, lh - 2);
    ctx.fillText(`${duration.toFixed(2)}s`, lw - 36, lh - 2);
  }, [buffer, sampleRate, canvasWidth]);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvasHeight = Math.floor(48 * dpr); // h-12 = 3rem = 48px

  return (
    <div ref={containerRef}>
      <h3 className="text-sm font-semibold mb-2 text-white">{resolvedTitle}</h3>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className="w-full h-12 rounded border border-gray-700"
        style={{ display: 'block' }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ADSRDisplay (parametric -- draws ADSR shape from synth params)
// ---------------------------------------------------------------------------

export interface ADSRDisplayProps {
  attack: number;
  sustain: number;
  decay: number;
  punch: number;
  title?: string;
}

export function ADSRDisplay({
  attack,
  sustain,
  decay,
  punch,
  title,
}: ADSRDisplayProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('sfx.adsrShape');
  const resolvedNoEnvelope = t('sfx.noEnvelope');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(300);

  // ResizeObserver to match canvas pixel width to container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const newW = Math.floor(entry.contentRect.width * dpr);
        if (newW > 0) setCanvasWidth(newW);
      }
    });

    ro.observe(container);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const initW = Math.floor((container.clientWidth || 300) * dpr);
    if (initW > 0) setCanvasWidth(initW);

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.width;
    const h = canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const lw = w / dpr;
    const lh = h / dpr;

    const pad = 8;
    const drawW = lw - pad * 2;
    const drawH = lh - pad * 2;

    ctx.fillStyle = canvasBgFlat();
    ctx.fillRect(0, 0, lw, lh);

    // Normalize durations so they fill the canvas proportionally.
    // attack, sustain, decay are in the 0-3 range from synth params.
    const totalTime = attack + sustain + decay;
    if (totalTime <= 0) {
      ctx.fillStyle = canvasTextColor();
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(resolvedNoEnvelope, lw / 2, lh / 2);
      ctx.textAlign = 'left';
      return;
    }

    const aFrac = attack / totalTime;
    const sFrac = sustain / totalTime;
    // dFrac is remainder

    const aEnd = pad + aFrac * drawW;
    const sEnd = aEnd + sFrac * drawW;
    const dEnd = pad + drawW; // always reaches right edge

    // Peak amplitude (1.0 baseline, punch adds extra)
    const sustainLevel = 1.0;
    const punchLevel = sustainLevel + Math.min(punch, 2) * 0.3; // punch adds up to 60% extra
    const baseY = pad + drawH; // bottom

    // Convert amplitude (0..max) to canvas Y
    const maxAmp = Math.max(punchLevel, 1.2);
    const ampToY = (amp: number) => baseY - (amp / maxAmp) * drawH;

    // Build path points
    const points: [number, number][] = [];

    // Start at zero
    points.push([pad, baseY]);

    // Attack: ramp from 0 up to punch level (or sustain level if no punch)
    if (punch > 0.01) {
      // Attack ramps to punch spike
      points.push([aEnd, ampToY(punchLevel)]);
      // Quick drop from punch to sustain level at start of sustain phase
      const punchDropX = aEnd + Math.min(sFrac * drawW * 0.15, 8);
      points.push([punchDropX, ampToY(sustainLevel)]);
      // Sustain hold
      points.push([sEnd, ampToY(sustainLevel)]);
    } else {
      // No punch: attack ramps to sustain level
      points.push([aEnd, ampToY(sustainLevel)]);
      // Sustain hold
      points.push([sEnd, ampToY(sustainLevel)]);
    }

    // Decay: ramp down to zero
    points.push([dEnd, baseY]);

    // Fill area
    ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.fill();

    // Stroke
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.stroke();

    // Phase labels
    ctx.fillStyle = canvasTextColor();
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    if (aFrac > 0.05) {
      ctx.fillText('A', pad + aFrac * drawW * 0.5, baseY - 3);
    }
    if (sFrac > 0.05) {
      ctx.fillText('S', aEnd + sFrac * drawW * 0.5, baseY - 3);
    }
    const dFracCalc = 1 - aFrac - sFrac;
    if (dFracCalc > 0.05) {
      ctx.fillText('D', sEnd + dFracCalc * drawW * 0.5, baseY - 3);
    }

    // Punch indicator
    if (punch > 0.01) {
      ctx.fillStyle = '#fb923c';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('P', aEnd + 2, ampToY(punchLevel) - 3);
    }

    // Dashed sustain level line
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, ampToY(sustainLevel));
    ctx.lineTo(pad + drawW, ampToY(sustainLevel));
    ctx.stroke();
    ctx.setLineDash([]);
  }, [attack, sustain, decay, punch, resolvedNoEnvelope, canvasWidth]);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvasHeight = Math.floor(48 * dpr);

  return (
    <div ref={containerRef}>
      <h3 className="text-sm font-semibold mb-2 text-white">{resolvedTitle}</h3>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className="w-full h-12 rounded border border-gray-700"
        style={{ display: 'block' }}
      />
    </div>
  );
}
