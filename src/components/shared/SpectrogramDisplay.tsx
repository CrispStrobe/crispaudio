import { memo, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { computeSpectrogram } from '../../audio/utils/spectrogram';

export const SpectrogramDisplay = memo(function SpectrogramDisplay({ buffer, sampleRate, title }: {
  buffer: Float32Array | null; sampleRate: number; title: string;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysis = useMemo(() => buffer ? computeSpectrogram(buffer, sampleRate) : null, [buffer, sampleRate]);
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#090f20'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!analysis?.columns) return;
    const { columns, bins, db } = analysis;
    const pixels = ctx.createImageData(columns, canvas.height);
    for (let x = 0; x < columns; x++) for (let y = 0; y < canvas.height; y++) {
      // Peak aggregation retains narrow spectral lines when shrinking bins.
      const lo = Math.floor((canvas.height - y - 1) * bins / canvas.height);
      const hi = Math.max(lo + 1, Math.ceil((canvas.height - y) * bins / canvas.height));
      let level = -90;
      for (let k = lo; k < Math.min(hi, bins); k++) level = Math.max(level, db[x * bins + k]);
      const v = Math.max(0, Math.min(1, (level + 90) / 90));
      const i = (y * columns + x) * 4;
      pixels.data[i] = Math.round(8 + 247 * Math.max(0, (v - .35) / .65));
      pixels.data[i + 1] = Math.round(15 + 220 * v * v);
      pixels.data[i + 2] = Math.round(30 + 150 * Math.sin(v * Math.PI));
      pixels.data[i + 3] = 255;
    }
    const raster = document.createElement('canvas'); raster.width = columns; raster.height = canvas.height;
    raster.getContext('2d')?.putImageData(pixels, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(raster, 0, 0, canvas.width, canvas.height);
  }, [analysis]);
  return <figure className="spectrogram min-w-0">
    <figcaption className="text-sm font-semibold mb-2">{title}</figcaption>
    <div className="flex gap-2">
      <div className="flex flex-col justify-between text-[10px] text-gray-400 tabular-nums text-right w-12 shrink-0">
        <span>{(sampleRate / 2000).toFixed(1)} kHz</span><span>{(sampleRate / 4000).toFixed(1)} kHz</span><span>0 Hz</span>
      </div>
      <div className="relative flex-1 min-w-0">
        <canvas ref={canvasRef} width={512} height={160} role="img" aria-label={title} className="w-full h-40 rounded border border-gray-700"/>
        {!buffer && <span className="absolute inset-0 grid place-items-center text-xs text-gray-400">{t('sfx.noSignal')}</span>}
      </div>
    </div>
    <div className="flex justify-between ml-14 text-[10px] text-gray-400 tabular-nums"><span>0 s</span><span>{analysis?.duration.toFixed(2) ?? '0.00'} s</span></div>
    <p className="text-xs text-gray-400 mt-2">{t('analysis.scale')}{analysis?.sampled ? ` · ${t('analysis.sampled')}` : ''}</p>
  </figure>;
});
