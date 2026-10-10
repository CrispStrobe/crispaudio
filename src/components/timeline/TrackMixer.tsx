import { signalLevels } from '../../lib/mixer';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { X, SlidersHorizontal } from 'lucide-react';
import { ToolButton } from '../common/ToolButton';
import { EffectChainEditor } from './EffectChainEditor';
import { projectHistoryGesture, useProjectStore } from '../../stores/projectStore';
import type { TimelineEngine } from '../../audio/engine/TimelineEngine';
import type { TimelineTrack } from '../../types/audio';

const db = (gain: number) => gain > 0 ? 20 * Math.log10(gain) : -Infinity;
const textDb = (gain: number) => gain > 0 ? `${db(gain).toFixed(1)} dB` : '−∞ dB';

function Meter({engine, id}: {engine: RefObject<TimelineEngine | null>; id: string}) {
  const canvas = useRef<HTMLCanvasElement>(null), hold = useRef(0), clipped = useRef(false);
  const {t} = useTranslation();
  useEffect(() => {
    let frame = 0;
    const samples = new Float32Array(2048);
    const tick = () => {
      const node = engine.current?.getMeter(id);
      samples.fill(0);
      let peak = 0, power = 0;
      for (const channel of node ?? []) {
        channel.getFloatTimeDomainData(samples);
        const levels = signalLevels(samples);
        peak = Math.max(peak, levels.peak); power += levels.rms ** 2;
      }
      const rms = Math.sqrt(power / (node?.length || 1));
      hold.current = Math.max(hold.current, peak); clipped.current ||= peak >= 1;
      const ctx = canvas.current?.getContext('2d');
      const width = 112, height = 38;
      if (ctx) {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, width, height);
        const extent = (v: number) => Math.max(0, Math.min(width, (db(v) + 60) / 60 * width));
        ctx.fillStyle = peak >= 1 ? '#f87171' : '#34d399'; ctx.fillRect(0, 3, extent(peak), 10);
        ctx.fillStyle = '#60a5fa'; ctx.fillRect(0, 16, extent(rms), 6);
        ctx.fillStyle = clipped.current ? '#f87171' : '#d1d5db';
        ctx.fillRect(Math.min(width - 2, extent(hold.current)), 0, 2, 23);
        ctx.font = '10px monospace';ctx.fillText(`${textDb(hold.current)}${clipped.current ? ' CLIP' : ''}`, 3, 34);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engine, id]);
  return <button type="button" className="min-h-11" title={t('mixer.meterHelp')} aria-label={t('mixer.resetPeak')} onClick={()=>{hold.current=0;clipped.current=false;}}><canvas ref={canvas} width={112} height={38} aria-hidden="true"/></button>;
}

function Strip({track, engine, onInserts}: {track?: TimelineTrack; engine: RefObject<TimelineEngine | null>; onInserts: (id:string)=>void}) {
  const {t} = useTranslation();
  const master = useProjectStore(s=>s.project.masterVolume ?? 1);
  const gain = track?.volume ?? master, id = track?.id ?? 'master';
  const gesture = useRef(false);
  const begin = () => {if (!gesture.current) {gesture.current=true;projectHistoryGesture.begin();}};
  const end = () => {if (gesture.current) {gesture.current=false;projectHistoryGesture.end();}};
  useEffect(()=>{
    const finish=()=>{if(gesture.current){gesture.current=false;projectHistoryGesture.end();}};
    window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);window.addEventListener('blur',finish);
    return ()=>{finish();window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);window.removeEventListener('blur',finish);};
  },[]);
  const update = (volume:number) => {
    const state = useProjectStore.getState();
    if (track) state.updateTrack(track.id,{volume});
    else useProjectStore.setState({project:{...state.project,masterVolume:volume}});
  };
  return <section className="w-36 shrink-0 rounded border border-gray-700 bg-gray-900 p-2 space-y-1" aria-label={track?.name ?? t('mixer.master')}>
    <p className="truncate text-sm font-medium" title={track?.name}>{track?.name ?? t('mixer.master')}</p>
    <Meter engine={engine} id={id}/>
    <label className="block text-xs">{t('mixer.level')} <span className="float-right">{textDb(gain)}</span>
      <input type="range" aria-label={`${track?.name ?? t('mixer.master')}: ${t('mixer.level')}`} className="w-full min-h-11" min={-61} max={12} step={.1} value={Math.max(-61, db(gain))} disabled={track?.locked}
        onPointerDown={begin} onPointerUp={end} onPointerCancel={end} onBlur={end} onKeyDown={begin} onKeyUp={end}
        onChange={e=>update(Number(e.target.value)<=-61?0:10**(Number(e.target.value)/20))}/></label>
    {track&&<>
      <label className="block text-xs">{t('mixer.pan')} {track.pan===0?'C':`${track.pan<0?'L':'R'} ${Math.round(Math.abs(track.pan)*100)}`}
        <input type="range" className="w-full min-h-11" aria-label={`${track.name}: ${t('mixer.pan')}`} min={-1} max={1} step={.01} value={track.pan} disabled={track.locked} onPointerDown={begin} onPointerUp={end} onPointerCancel={end} onBlur={end} onKeyDown={begin} onKeyUp={end} onDoubleClick={()=>useProjectStore.getState().updateTrack(track.id,{pan:0})} onChange={e=>useProjectStore.getState().updateTrack(track.id,{pan:Number(e.target.value)})}/></label>
      <div className="flex gap-1">{(['muted','solo'] as const).map(key=><button key={key} disabled={track.locked} aria-label={`${track.name}: ${t(key==='solo'?'timeline.solo':'timeline.mute')}`} aria-pressed={track[key]} className={`flex-1 min-h-11 rounded ${track[key]?'bg-indigo-600':'bg-gray-800'}`} onClick={()=>useProjectStore.getState().updateTrack(track.id,{[key]:!track[key]})}>{key==='solo'?'S':'M'}</button>)}</div>
    </>}
    <div className="flex gap-1"><button className="min-w-11 min-h-11 rounded bg-gray-800 text-xs" disabled={track?.locked} onClick={()=>update(1)} title={t('mixer.unity')} aria-label={t('mixer.unity')}>0 dB</button><button className="flex-1 min-h-11 rounded bg-gray-800 text-xs" onClick={()=>onInserts(id)}>{t('mixer.inserts')} · {(track ? track.effects ?? [] : useProjectStore.getState().project.masterEffects).length}</button></div>
  </section>;
}

export function TrackMixer({engine,onClose}: {engine: RefObject<TimelineEngine | null>; onClose:()=>void}) {
  const {t}=useTranslation(), project=useProjectStore(s=>s.project);
  const [insertId,setInsertId]=useState<string|null>(null);
  const track=project.tracks.find(track=>track.id===insertId);
  return <aside className="shrink-0 border-t border-gray-700 bg-gray-950 text-gray-200 min-w-0" aria-label={t('mixer.title')}>
    <div className="flex items-center justify-between px-3"><span className="text-sm flex gap-2 items-center"><SlidersHorizontal size={16}/>{t('mixer.title')}</span><ToolButton icon={X} label={t('common.close')} onClick={onClose}/></div>
    <div className="flex gap-2 p-2 overflow-x-auto max-h-80 overflow-y-auto">
      <Strip engine={engine} onInserts={setInsertId}/>
      {project.tracks.map(track=><Strip key={track.id} track={track} engine={engine} onInserts={setInsertId}/>)}
      {insertId&&(insertId==='master'||track)&&<div className="w-80 shrink-0 p-2 space-y-2"><button className="min-h-11 text-sm" onClick={()=>setInsertId(null)}>{t('common.close')} · {track?.name??t('mixer.master')}</button><fieldset disabled={track?.locked}><EffectChainEditor label={t('mixer.inserts')} effects={track ? track.effects??[] : project.masterEffects} onChange={effects=>{const state=useProjectStore.getState();if(track)state.updateTrack(track.id,{effects});else useProjectStore.setState({project:{...state.project,masterEffects:effects}});}}/></fieldset></div>}
    </div>
  </aside>;
}
