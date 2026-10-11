import {normalizeGainPoints,normalizePanPoints} from '../../lib/mixAutomation';
import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Modal} from '../common/Modal';
import {useProjectStore} from '../../stores/projectStore';
import {shapeAutomationSegment,automationShapes,type AutomationShape} from '../../lib/automationShape';
import {targetPoints,type AutomationTarget} from '../../lib/automationRecording';
import type {TimelineProject} from '../../types/audio';

/** Preview only; stale project reviews cannot write. */
export function AutomationShapeReview({project,target,pointTime,onClose}:{project:TimelineProject;target:AutomationTarget;pointTime:number;onClose:()=>void}) {
 const {t}=useTranslation(),[shape,setShape]=useState<AutomationShape>('s-curve'),current=useProjectStore(s=>s.project);
 useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}};window.addEventListener('keydown',escape,true);return()=>window.removeEventListener('keydown',escape,true);},[onClose]);
 let preview:TimelineProject|undefined,error='';
 try{if(current!==project)throw new Error('automation.changed');preview=shapeAutomationSegment(project,target,pointTime,shape);}catch(reason){error=t(reason instanceof Error?reason.message:String(reason));}
 const before=(target.parameter==='pan'?normalizePanPoints:normalizeGainPoints)(targetPoints(project,target)),a=before.find(p=>p.time===pointTime),b=before.filter(p=>p.time>pointTime).sort((a,b)=>a.time-b.time)[0];
 const points=preview?(target.parameter==='pan'?normalizePanPoints:normalizeGainPoints)(targetPoints(preview,target)).filter(p=>p.time>=pointTime&&p.time<=(b?.time??pointTime)):[];
 const parameterLabel=target.parameter==='gain'?'automation.gainLane':target.parameter==='pan'?'automation.panLane':`automation.delay${target.parameter[0].toUpperCase()+target.parameter.slice(1)}`;
 const format=(v:number)=>target.parameter==='gain'?`${v===0?'−∞':(20*Math.log10(v)).toFixed(1)} dB`:target.parameter==='pan'?v.toFixed(2):target.parameter==='time'?`${(v*1000).toFixed(1)} ms`:`${(v*100).toFixed(1)}%`;
 const range=Math.abs((b?.value??0)-(a?.value??0))||1,min=Math.min(a?.value??0,b?.value??0);
 const path=points.map((p,i)=>`${i?'L':'M'}${12+(p.time-pointTime)/((b?.time??pointTime+1)-pointTime)*296},${128-(p.value-min)/range*112}`).join(' ');
 return <Modal isOpen onClose={onClose} title={t('automation.shapeSegment')}>
  <div data-automation-shape-review className="space-y-3 text-sm" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onClose();}}}>
   <p>{project.tracks.find(track=>track.id===target.trackId)?.name} · {target.effectIndex===undefined?'':`${target.effectIndex+1} · `}{t(parameterLabel)}</p>
   <p className="text-xs text-gray-400">{pointTime.toFixed(3)}–{b?.time.toFixed(3)} s · {a&&format(a.value)} → {b&&format(b.value)}</p>
   <label className="flex flex-wrap items-center gap-2">{t('automation.shape')}<select autoFocus aria-label={t('automation.shape')} className="min-h-11 bg-gray-800 rounded px-2" value={shape} onChange={e=>setShape(e.target.value as AutomationShape)}>{automationShapes.map(value=><option key={value} value={value}>{t(`automation.shape_${value}`)}</option>)}</select></label>
   <svg role="img" aria-label={t('automation.shapePreview')} viewBox="0 0 320 144" className="w-full h-36 bg-gray-950 rounded"><path d={path} stroke="#fbbf24" strokeWidth={2} fill="none"/>{points.map(p=><circle key={p.time} cx={12+(p.time-pointTime)/((b?.time??pointTime+1)-pointTime)*296} cy={128-(p.value-min)/range*112} r={3} fill="#fbbf24"/>)}</svg>
   <p className="text-xs text-gray-400">{t('automation.shapeHelp',{count:Math.max(0,points.length-2)})}</p>
   {error&&<p role="alert" className="text-amber-300">{error}</p>}
   <div className="flex justify-end gap-2"><button className="timeline-tool" onClick={onClose}>{t('common.cancel')}</button><button className="timeline-tool bg-indigo-700" disabled={!preview} onClick={()=>{if(!preview||useProjectStore.getState().project!==project)return;if(preview!==project)useProjectStore.setState({project:preview});onClose();}}>{t('automation.applyShape')}</button></div>
  </div>
 </Modal>;
}
