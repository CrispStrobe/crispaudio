import { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { canvasBgGradient, canvasBgFlat, canvasGridColor, canvasTextColor, canvasEmptyColor } from '../../lib/themeColors';

export const VoiceWaveform = memo(function VoiceWaveform({ buffer, color, title, isPlaying, duration }: {
  buffer: AudioBuffer | null;
  color: string;
  title: string;
  isPlaying?: boolean;
  duration?: number;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

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

    if (!buffer) {
      ctx.fillStyle = canvasEmptyColor();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('voice.noAudio'), w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    if (isPlaying) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
    }

    const data = buffer.getChannelData(0);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const step = data.length / w;
    for (let i = 0; i < w; i++) {
      const sample = data[Math.floor(i * step)] || 0;
      const y = (sample * h * 0.4) + (h / 2);
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [buffer, color, isPlaying, t]);

  // Playhead animation
  useEffect(() => {
    const el = playheadRef.current;
    if (!el) return;

    if (isPlaying && duration && duration > 0) {
      startTimeRef.current = performance.now();
      const tick = () => {
        const elapsed = (performance.now() - startTimeRef.current) / 1000;
        const progress = Math.min(elapsed / duration, 1);
        el.style.left = `${progress * 100}%`;
        el.style.display = 'block';
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          el.style.display = 'none';
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      el.style.display = 'none';
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, duration]);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-white">{title}</h3>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={400}
          height={120}
          className="w-full h-24 rounded border border-gray-700"
        />
        <div
          ref={playheadRef}
          className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
          style={{ display: 'none', left: 0 }}
        />
      </div>
    </div>
  );
});

export const VoiceSpectrum = memo(function VoiceSpectrum({ buffer }: { buffer: AudioBuffer | null }) {
  const { t } = useTranslation();
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

    if (!buffer) {
      ctx.fillStyle = canvasEmptyColor();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('voice.noAudio'), w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const data = buffer.getChannelData(0);
    const numBars = 32;
    const chunkSize = Math.max(1, Math.floor(data.length / numBars));
    const barW = Math.floor(w / numBars) - 1;

    // Compute RMS per chunk
    const bars: number[] = [];
    let maxRms = 0;
    for (let i = 0; i < numBars; i++) {
      let sum = 0;
      for (let j = 0; j < chunkSize; j++) {
        const s = data[i * chunkSize + j] ?? 0;
        sum += s * s;
      }
      const r = Math.sqrt(sum / chunkSize);
      bars.push(r);
      if (r > maxRms) maxRms = r;
    }

    if (maxRms === 0) return;

    for (let i = 0; i < numBars; i++) {
      const norm = bars[i] / maxRms;
      const barH = Math.min(h, norm * h * 0.85);
      const hue = 240 - (i / numBars) * 120;
      const lightness = 40 + norm * 30;
      ctx.fillStyle = `hsl(${hue}, 70%, ${lightness}%)`;
      ctx.fillRect(i * (barW + 1), h - barH, barW, barH);
    }
  }, [buffer, t]);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-white">{t('voice.frequencySpectrum')}</h3>
      <canvas
        ref={canvasRef}
        width={200}
        height={100}
        className="w-full h-20 rounded border border-gray-700"
      />
    </div>
  );
});

export const VoiceLevels = memo(function VoiceLevels({ buffer }: { buffer: AudioBuffer | null }) {
  const { t } = useTranslation();
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

    if (!buffer) {
      ctx.fillStyle = canvasEmptyColor();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('voice.noAudio'), w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const data = buffer.getChannelData(0);
    let peak = 0;
    let rmsSum = 0;
    for (let i = 0; i < data.length; i++) {
      const s = Math.abs(data[i]);
      if (s > peak) peak = s;
      rmsSum += s * s;
    }
    const rms = Math.sqrt(rmsSum / data.length);

    const dbRange = 60;
    const peakDb = peak > 0 ? 20 * Math.log10(peak) : -100;
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -100;
    const peakH = Math.max(0, (peakDb + dbRange) / dbRange) * h;
    const rmsH = Math.max(0, (rmsDb + dbRange) / dbRange) * h;

    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(0, h - rmsH, w * 0.4, rmsH);

    ctx.fillStyle = peak > 0.95 ? '#ef4444' : '#10b981';
    ctx.fillRect(w * 0.5, h - peakH, w * 0.4, peakH);

    ctx.fillStyle = canvasTextColor();
    ctx.font = '10px monospace';
    ctx.fillText('RMS', 2, 12);
    ctx.fillText('PEAK', w * 0.5 + 2, 12);
    ctx.fillText(`${rmsDb.toFixed(1)}dB`, 2, h - 2);
    ctx.fillText(`${peakDb.toFixed(1)}dB`, w * 0.5 + 2, h - 2);
  }, [buffer, t]);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-white">{t('voice.signalLevel')}</h3>
      <canvas
        ref={canvasRef}
        width={200}
        height={100}
        className="w-full h-20 rounded border border-gray-700"
      />
    </div>
  );
});
