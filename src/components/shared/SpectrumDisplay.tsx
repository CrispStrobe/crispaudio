// ---------------------------------------------------------------------------
// SpectrumDisplay -- reusable frequency spectrum bar chart
// Extracted from SFXPanel for shared use.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { computeSpectrumBars } from '../../audio/utils/fft';
import { canvasBgFlat, canvasTextColor, canvasEmptyColor } from '../../lib/themeColors';

export interface SpectrumDisplayProps {
  buffer: Float32Array | null;
  numBars?: number;
  title?: string;
  noSignalText?: string;
}

export function SpectrumDisplay({
  buffer,
  numBars = 32,
  title,
  noSignalText,
}: SpectrumDisplayProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('sfx.frequencySpectrum');
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
    // Initial size
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
    const h = canvas.height;
    const w = canvas.width;

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

    const bars = computeSpectrumBars(buffer, numBars);
    const maxVal = Math.max(...bars);
    if (maxVal === 0) return;

    const barW = Math.floor(lw / numBars) - 1;
    for (let i = 0; i < numBars; i++) {
      const norm = bars[i] / maxVal;
      const barH = Math.min(lh, norm * lh * 0.85);
      const x = i * (barW + 1);
      const hue = 240 - (i / numBars) * 120;
      const lightness = 40 + norm * 30;
      ctx.fillStyle = `hsl(${hue}, 70%, ${lightness}%)`;
      ctx.fillRect(x, lh - barH, barW, barH);
    }

    // Freq labels
    ctx.fillStyle = canvasTextColor();
    ctx.font = '9px monospace';
    ctx.fillText('20Hz', 2, lh - 2);
    ctx.fillText('1kHz', lw * 0.4, lh - 2);
    ctx.fillText('20kHz', lw - 32, lh - 2);
  }, [buffer, numBars, resolvedNoSignal, canvasWidth]);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvasHeight = Math.floor(80 * dpr); // h-20 = 5rem = 80px

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
