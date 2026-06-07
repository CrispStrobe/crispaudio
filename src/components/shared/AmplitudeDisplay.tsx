// ---------------------------------------------------------------------------
// AmplitudeDisplay -- reusable RMS/Peak dB meter from audio buffer
// Extracted from SFXPanel for shared use.
// (Distinct from AmplitudeMeter.tsx which takes pre-computed rms/peak props.)
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { canvasBgFlat, canvasTextColor, canvasEmptyColor } from '../../lib/themeColors';

export interface AmplitudeDisplayProps {
  buffer: Float32Array | null;
  title?: string;
  noSignalText?: string;
}

export function AmplitudeDisplay({
  buffer,
  title,
  noSignalText,
}: AmplitudeDisplayProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('sfx.signalLevel');
  const resolvedNoSignal = noSignalText ?? t('sfx.noSignal');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(200);

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
    const initW = Math.floor((container.clientWidth || 200) * dpr);
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

    if (!buffer || buffer.length === 0) {
      ctx.fillStyle = canvasEmptyColor();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(resolvedNoSignal, lw / 2, lh / 2);
      ctx.textAlign = 'left';
      return;
    }

    let peak = 0;
    let rmsSum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.abs(buffer[i]);
      if (s > peak) peak = s;
      rmsSum += s * s;
    }
    const rms = Math.sqrt(rmsSum / buffer.length);

    const dbRange = 60;
    const peakDb = peak > 0 ? 20 * Math.log10(peak) : -100;
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -100;
    const peakH = Math.max(0, (peakDb + dbRange) / dbRange) * lh;
    const rmsH = Math.max(0, (rmsDb + dbRange) / dbRange) * lh;

    // RMS bar
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(0, lh - rmsH, lw * 0.4, rmsH);

    // Peak bar
    ctx.fillStyle = peak > 0.95 ? '#ef4444' : '#10b981';
    ctx.fillRect(lw * 0.5, lh - peakH, lw * 0.4, peakH);

    // Labels
    ctx.fillStyle = canvasTextColor();
    ctx.font = '10px monospace';
    ctx.fillText('RMS', 2, 12);
    ctx.fillText('PEAK', lw * 0.5 + 2, 12);
    ctx.fillText(`${rmsDb.toFixed(1)}dB`, 2, lh - 2);
    ctx.fillText(`${peakDb.toFixed(1)}dB`, lw * 0.5 + 2, lh - 2);
  }, [buffer, resolvedNoSignal, canvasWidth]);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvasHeight = Math.floor(80 * dpr);

  return (
    <div ref={containerRef}>
      <h3 className="text-sm font-semibold mb-2 text-white">{resolvedTitle}</h3>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className="w-full h-20 rounded border border-gray-700"
        style={{ display: 'block' }}
      />
    </div>
  );
}
