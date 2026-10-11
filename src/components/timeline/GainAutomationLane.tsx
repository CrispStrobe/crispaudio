import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Activity,CircleHelp,Lock,Plus,Trash2,X} from 'lucide-react';
import {useProjectStore} from '../../stores/projectStore';
import {editGainPoint,gainAt,normalizeGainPoints} from '../../lib/mixAutomation';
import {snapClipStart} from '../../lib/timelineSnap';
import {timelineDuration} from '../../lib/timelineView';
import type {GainPoint} from '../../types/audio';
import {TRACK_HEADER_WIDTH} from '../../hooks/useTimeline';
import {NumberField} from './NumberField';
import {ToolButton} from '../common/ToolButton';

const H=112,TOP=10,BOTTOM=102;
const db=(value:number)=>value===0?-60:Math.max(-60,20*Math.log10(value));
const y=(value:number)=>TOP+(12-db(value))/72*(BOTTOM-TOP);
const valueAtY=(py:number)=>py>=BOTTOM?0:10**(Math.max(-60,Math.min(12,12-(py-TOP)/(BOTTOM-TOP)*72))/20);

/** A focused track lane on the shared timeline clock. Drag previews stay local,
 * so Escape/cancel/unmount never alter project history or discard redo. */
export function GainAutomationLane({width,onClose}:{width:number;onClose:()=>void}) {
  const {t}=useTranslation();
  const project=useProjectStore(s=>s.project),zoom=useProjectStore(s=>s.zoomLevel),scroll=useProjectStore(s=>s.scrollOffset);
  const [trackId,setTrackId]=useState(''),[selected,setSelected]=useState<number|null>(null);
  const [draft,setDraft]=useState<{project:typeof project;trackId:string;points:GainPoint[];time:number;originalTime:number|null}|null>(null);
  const track=project.tracks.find(track=>track.id===trackId)??project.tracks[0];
  const svg=useRef<SVGSVGElement>(null);
  const gesture=useRef<{project:typeof project;trackId:string;time:number;originalTime:number|null;points:GainPoint[];pointer?:number}|null>(null);
  const displayed=draft?.project===project&&draft.trackId===track?.id?draft.points:normalizeGainPoints(track?.automation);
  const duration=timelineDuration(project);
  const x=(time:number)=>(time-scroll)*zoom;
  const cancel=()=>{if(gesture.current)setSelected(gesture.current.originalTime);gesture.current=null;setDraft(null);};
  const finish=()=>{
    const current=gesture.current,focused=document.activeElement;
    gesture.current=null;setDraft(null);
    if(current&&current.pointer===undefined&&focused?.hasAttribute('data-gain-point'))requestAnimationFrame(()=>{
      if(!focused.isConnected&&document.activeElement===document.body){
        const point=[...(svg.current?.querySelectorAll<SVGGElement>('[data-gain-point]')??[])].find(p=>Number(p.dataset.time)===current.time);
        point?.focus();
      }
    });
    if(current&&useProjectStore.getState().project===current.project&&JSON.stringify(current.points)!==JSON.stringify(normalizeGainPoints(current.project.tracks.find(t=>t.id===current.trackId)?.automation))){
      useProjectStore.getState().updateTrack(current.trackId,{automation:current.points});setSelected(current.time);
    }
  };
  useEffect(()=>{
    const cancel=()=>{if(gesture.current)setSelected(gesture.current.originalTime);gesture.current=null;setDraft(null);};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&gesture.current){event.preventDefault();event.stopPropagation();cancel();}};
    window.addEventListener('keydown',key,true);window.addEventListener('blur',cancel);
    return()=>{gesture.current=null;window.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);};
  },[]);
  if(!track)return null;
  const point=displayed.find(p=>p.time===selected);
  const write=(original:number|null,next:GainPoint)=>{
    if(track.locked||!Number.isFinite(next.time)||next.time<0||next.time>duration||!Number.isFinite(next.value)||next.value<0)return false;
    const points=editGainPoint(track.automation,original,next);
    if(JSON.stringify(points)!==JSON.stringify(normalizeGainPoints(track.automation)))useProjectStore.getState().updateTrack(track.id,{automation:points});
    setSelected(next.time);return true;
  };
  const snap=(time:number,bypass=false)=>{
    const state=useProjectStore.getState(),grid=project.snapGrid??.1;
    if(state.snapEnabled&&!bypass){
      const targets=[0,duration,state.playheadPosition,...(project.markers??[]).map(m=>m.time),...track.segments.flatMap(c=>[c.startTime,c.startTime+c.duration])];
      const magnetic=snapClipStart(time,0,targets,zoom,true);
      time=targets.includes(magnetic)?magnetic:(grid?Math.round(time/grid)*grid:time);
    }
    return Math.max(0,Math.min(duration,time));
  };
  const updatePreview=(next:GainPoint)=>{
    const current=gesture.current;if(!current)return;
    current.points=editGainPoint(current.project.tracks.find(t=>t.id===current.trackId)?.automation,current.originalTime,next);current.time=next.time;setDraft({...current});setSelected(next.time);
  };
  const times=[scroll,...displayed.filter(p=>p.time>scroll&&x(p.time)<width).map(p=>p.time),...Array.from({length:Math.ceil(width/4)},(_,i)=>scroll+i*4/zoom),scroll+width/zoom].sort((a,b)=>a-b);
  const path=times.map((time,i)=>`${i?'L':'M'}${x(time)},${y(gainAt(displayed,time))}`).join(' ');
  return <section data-gain-automation className="shrink-0 border-t border-gray-700 bg-gray-950 select-none" aria-label={t('automation.title')}>
    <div className="flex flex-wrap gap-1 items-center p-1 text-xs" onKeyDown={e=>e.stopPropagation()}>
      {track.locked&&<Lock size={16} className="text-amber-300" aria-label={t('ranges.lockedNotice',{name:track.name})}/>}
      <Activity size={16} className="text-amber-300"/>
      <select aria-label={t('automation.track')} className="min-h-11 bg-gray-800 rounded min-w-0 max-w-40" value={track.id} onChange={e=>{cancel();setTrackId(e.target.value);setSelected(null);}}>{project.tracks.map(track=><option key={track.id} value={track.id}>{track.name}</option>)}</select>
      <ToolButton icon={Plus} label={t('automation.add')} disabled={!!track.locked} onClick={()=>{const time=Math.min(duration,useProjectStore.getState().playheadPosition);write(null,{time,value:gainAt(track.automation,time)});}}/>
      <ToolButton icon={Trash2} label={t('timeline.delete')} disabled={!!track.locked||!point} onClick={()=>{useProjectStore.getState().updateTrack(track.id,{automation:displayed.filter(p=>p.time!==selected)});setSelected(null);}}/>
      {point&&<>
        <label className="flex items-center gap-1">s <NumberField key={`${track.id}:time:${selected}`} width="w-24" label={t('automation.time')} value={point.time} step={1/project.sampleRate} disabled={!!track.locked} onCommit={time=>write(point.time,{...point,time})}/></label>
        <label className="flex items-center gap-1">dB <NumberField key={`${track.id}:gain:${selected}`} width="w-24" label={t('automation.gain')} value={Number(db(point.value).toFixed(3))} min={-60} step={.1} disabled={!!track.locked} onCommit={gain=>gain<=12&&write(point.time,{time:point.time,value:gain===-60?0:10**(gain/20)})}/></label>
      </>}
      <ToolButton icon={CircleHelp} label={t('automation.help')}/>
      <ToolButton icon={X} label={t('common.close')} className="ml-auto" onClick={onClose}/>
    </div>
    <div className="flex min-w-0">
      <div className="shrink-0 text-xs text-gray-400 relative" style={{width:TRACK_HEADER_WIDTH,height:H}} title={t('automation.help')}><span className="absolute left-2" style={{top:TOP-6}}>+12 dB</span><span className="absolute left-2" style={{top:y(1)-6}}>0 dB</span><span className="absolute left-2 bottom-0">−∞</span></div>
      <svg ref={svg} width={width} height={H} className="block min-w-0 flex-1 overflow-hidden" role="group" aria-label={t('automation.graph')} style={{touchAction:'none'}}
        onPointerDown={e=>{if(e.target!==e.currentTarget||track.locked||e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
          const rect=e.currentTarget.getBoundingClientRect(),next={time:snap(scroll+(e.clientX-rect.left)/zoom,e.altKey),value:valueAtY(e.clientY-rect.top)};
          gesture.current={project,trackId:track.id,time:next.time,originalTime:null,points:displayed,pointer:e.pointerId};updatePreview(next);}}
        onPointerMove={e=>{const current=gesture.current;if(!current||current.pointer!==e.pointerId)return;const rect=e.currentTarget.getBoundingClientRect();updatePreview({time:snap(scroll+(e.clientX-rect.left)/zoom,e.altKey),value:valueAtY(e.clientY-rect.top)});}}
        onPointerUp={e=>{if(gesture.current?.pointer===e.pointerId)finish();}}
        onPointerCancel={cancel} onLostPointerCapture={()=>{if(gesture.current?.pointer!==undefined)cancel();}}
        onKeyDown={e=>e.stopPropagation()}>
        {[0,1,10**(.6)].map(value=><line key={value} x1={0} x2={width} y1={y(value)} y2={y(value)} stroke="#334155" pointerEvents="none"/>)}
        <path d={path} fill="none" stroke="#fbbf24" strokeWidth={2} pointerEvents="none"/>
        {displayed.filter(p=>x(p.time)>=0&&x(p.time)<=width).map(p=><g key={draft?.time===p.time?(draft.originalTime??'new'):p.time} data-gain-point data-time={p.time} tabIndex={0} role="button" aria-disabled={!!track.locked} aria-label={`${t('automation.point')}: ${p.time.toFixed(3)} s, ${p.value===0?'−∞':db(p.value).toFixed(1)} dB`}
          onFocus={()=>setSelected(p.time)}
          onPointerDown={e=>{if(track.locked||e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.ownerSVGElement!.setPointerCapture(e.pointerId);gesture.current={project,trackId:track.id,time:p.time,originalTime:p.time,points:displayed,pointer:e.pointerId};setSelected(p.time);}}
          onKeyDown={e=>{
            e.stopPropagation();if(track.locked)return;
            if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();useProjectStore.getState().updateTrack(track.id,{automation:displayed.filter(q=>q.time!==p.time)});setSelected(null);return;}
            if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
            if(!gesture.current)gesture.current={project,trackId:track.id,time:p.time,originalTime:p.time,points:displayed};
            const current=gesture.current.points.find(q=>q.time===gesture.current!.time)!;
            const step=(e.shiftKey?10:1)/project.sampleRate;
            updatePreview({time:Math.max(0,Math.min(duration,current.time+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0))),value:e.key==='ArrowUp'||e.key==='ArrowDown'?valueAtY(y(current.value)+(e.key==='ArrowUp'?-1:1)*(e.shiftKey?1:.1)/72*(BOTTOM-TOP)):current.value});
          }} onKeyUp={e=>{if(e.key.startsWith('Arrow'))finish();}} onBlur={()=>{if(gesture.current?.pointer===undefined)cancel();}}>
          <circle cx={x(p.time)} cy={y(p.value)} r={22} fill="transparent"/>
          <circle cx={x(p.time)} cy={y(p.value)} r={8} stroke={p.time===selected?'white':'#fbbf24'} strokeWidth={2} fill="#92400e" pointerEvents="none"/>
        </g>) }
      </svg>
    </div>
  </section>;
}
