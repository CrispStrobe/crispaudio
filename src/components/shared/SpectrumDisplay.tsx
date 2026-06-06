// ---------------------------------------------------------------------------
// SpectrumDisplay -- reusable frequency spectrum bar chart
// Extracted from SFXPanel for shared use.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react';
import { computeSpectrumBars } from '../../audio/utils/fft';
import { canvasBgFlat, canvasTextColor, canvasEmptyColor } from '../../lib/themeColors';

export interface SpectrumDisplayProps {
  buffer: Float32Array | null;
  numBars?: number;
  title?: string;
}

export function SpectrumDisplay({
  buffer,
  numBars = 32,
  title = 'Frequency Spectrum',
}: SpectrumDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = canvasBgFlat();
    ctx.fillRect(0, 0, w, h);

    if (!buffer || buffer.length === 0) {
      ctx.fillStyle = canvasEmptyColor();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No signal', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const bars = computeSpectrumBars(buffer, numBars);
    const maxVal = Math.max(...bars);
    if (maxVal === 0) return;

    const barW = Math.floor(w / numBars) - 1;
    for (let i = 0; i < numBars; i++) {
      const norm = bars[i] / maxVal;
      const barH = Math.min(h, norm * h * 0.85);
      const x = i * (barW + 1);
      const hue = 240 - (i / numBars) * 120;
      const lightness = 40 + norm * 30;
      ctx.fillStyle = `hsl(${hue}, 70%, ${lightness}%)`;
      ctx.fillRect(x, h - barH, barW, barH);
    }

    // Freq labels
    ctx.fillStyle = canvasTextColor();
    ctx.font = '9px monospace';
    ctx.fillText('20Hz', 2, h - 2);
    ctx.fillText('1kHz', w * 0.4, h - 2);
    ctx.fillText('20kHz', w - 32, h - 2);
  }, [buffer, numBars]);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-white">{title}</h3>
      <canvas
        ref={canvasRef}
        width={200}
        height={100}
        className="w-full h-20 rounded border border-gray-700"
      />
    </div>
  );
}
