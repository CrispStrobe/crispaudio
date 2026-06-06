// ---------------------------------------------------------------------------
// AmplitudeDisplay -- reusable RMS/Peak dB meter from audio buffer
// Extracted from SFXPanel for shared use.
// (Distinct from AmplitudeMeter.tsx which takes pre-computed rms/peak props.)
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react';
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
      ctx.fillText(resolvedNoSignal, w / 2, h / 2);
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
    const peakH = Math.max(0, (peakDb + dbRange) / dbRange) * h;
    const rmsH = Math.max(0, (rmsDb + dbRange) / dbRange) * h;

    // RMS bar
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(0, h - rmsH, w * 0.4, rmsH);

    // Peak bar
    ctx.fillStyle = peak > 0.95 ? '#ef4444' : '#10b981';
    ctx.fillRect(w * 0.5, h - peakH, w * 0.4, peakH);

    // Labels
    ctx.fillStyle = canvasTextColor();
    ctx.font = '10px monospace';
    ctx.fillText('RMS', 2, 12);
    ctx.fillText('PEAK', w * 0.5 + 2, 12);
    ctx.fillText(`${rmsDb.toFixed(1)}dB`, 2, h - 2);
    ctx.fillText(`${peakDb.toFixed(1)}dB`, w * 0.5 + 2, h - 2);
  }, [buffer, resolvedNoSignal]);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-white">{resolvedTitle}</h3>
      <canvas
        ref={canvasRef}
        width={200}
        height={100}
        className="w-full h-20 rounded border border-gray-700"
      />
    </div>
  );
}
