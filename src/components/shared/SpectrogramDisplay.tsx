import { memo, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { computeSpectrogram } from '../../audio/utils/spectrogram';
import {frequencyPosition,positionFrequency,type FrequencyScale} from '../../audio/utils/frequencyAxis';

export const SpectrogramDisplay = memo(function SpectrogramDisplay({ buffer, sampleRate, title,fftSize=1024,windowType='hann',floor=-90,band,onBandChange,frequencyScale='linear' }: {
  buffer: Float32Array | null; sampleRate: number; title: string;fftSize?:number;windowType?:'hann'|'hamming';floor?:number;band?:{low:number;high:number};onBandChange?:(band:{low:number;high:number})=>void;frequencyScale?:FrequencyScale;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null),drag=useRef<{id:number;y:number;band?:{low:number;high:number}}|null>(null);
  const frequency=(y:number)=>{const rect=canvasRef.current!.getBoundingClientRect();return Math.round(positionFrequency(1-(y-rect.top)/rect.height,sampleRate/2,frequencyScale));};
  const analysis = useMemo(() => buffer ? computeSpectrogram(buffer, sampleRate,{fftSize,windowType,floor}) : null, [buffer, sampleRate,fftSize,windowType,floor]);
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#090f20'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!analysis?.columns) return;
    const { columns, bins, db } = analysis;
    const pixels = ctx.createImageData(columns, canvas.height);
    for (let x = 0; x < columns; x++) for (let y = 0; y < canvas.height; y++) {
      // Peak aggregation retains narrow spectral lines when shrinking bins.
      const lo = Math.floor(positionFrequency((canvas.height-y-1)/canvas.height,sampleRate/2,frequencyScale)*analysis.fftSize/sampleRate);
      const hi = Math.max(lo + 1, Math.ceil(positionFrequency((canvas.height-y)/canvas.height,sampleRate/2,frequencyScale)*analysis.fftSize/sampleRate));
      let level = floor;
      for (let k = lo; k < Math.min(hi, bins); k++) level = Math.max(level, db[x * bins + k]);
      const v = Math.max(0, Math.min(1, (level - floor) / -floor));
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
  }, [analysis,floor,sampleRate,frequencyScale]);
  return <figure className="spectrogram min-w-0">
    <figcaption className="text-sm font-semibold mb-2">{title}</figcaption>
    <div className="flex gap-2">
      <div className="flex flex-col justify-between text-[10px] text-gray-400 tabular-nums text-right w-12 shrink-0">
        <span>{(sampleRate / 2000).toFixed(1)} kHz</span><span>{(positionFrequency(.5,sampleRate/2,frequencyScale)/1000).toFixed(1)} kHz</span><span>0 Hz</span>
      </div>
      <div className="relative flex-1 min-w-0">
        <canvas ref={canvasRef} width={512} height={160} role="img" aria-label={title} className={`w-full h-40 rounded border border-gray-700 ${onBandChange?'touch-none':''}`} onPointerDown={event=>{if(!onBandChange||event.button!==0||drag.current)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,y:event.clientY,band};}} onPointerMove={event=>{const current=drag.current;if(!onBandChange||!current||current.id!==event.pointerId)return;const a=frequency(current.y),b=frequency(event.clientY);onBandChange({low:Math.min(a,b),high:Math.max(a,b)});}} onPointerUp={event=>{if(drag.current?.id!==event.pointerId)return;drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}} onPointerCancel={event=>{if(drag.current?.id!==event.pointerId)return;if(drag.current?.band)onBandChange?.(drag.current.band);drag.current=null;}} onLostPointerCapture={event=>{if(drag.current?.id!==event.pointerId)return;if(drag.current?.band)onBandChange?.(drag.current.band);drag.current=null;}}/>
        {band&&band.high>=band.low&&<div data-spectral-band className="absolute inset-x-0 bg-indigo-400/20 border-y border-indigo-300 pointer-events-none" style={{top:`${100*(1-frequencyPosition(band.high,sampleRate/2,frequencyScale))}%`,height:`${100*(frequencyPosition(band.high,sampleRate/2,frequencyScale)-frequencyPosition(band.low,sampleRate/2,frequencyScale))}%`}}/>}
        {!buffer && <span className="absolute inset-0 grid place-items-center text-xs text-gray-400">{t('sfx.noSignal')}</span>}
      </div>
    </div>
    <div className="flex justify-between ml-14 text-[10px] text-gray-400 tabular-nums"><span>0 s</span><span>{analysis?.duration.toFixed(2) ?? '0.00'} s</span></div>
    <p className="text-xs text-gray-400 mt-2">{t('analysis.scale',{window:windowType==='hamming'?'Hamming':'Hann',floor})}{frequencyScale==='log'?` · ${t('analysis.logFrequency')}`:''}{analysis?.sampled ? ` · ${t('analysis.sampled')}` : ''}</p>
  </figure>;
});
