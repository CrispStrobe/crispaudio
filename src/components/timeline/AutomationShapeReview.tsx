import {AutomationShapeChart} from './AutomationShapeChart';
import {NumberField} from './NumberField';
import {normalizeGainPoints,normalizePanPoints} from '../../lib/mixAutomation';
import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Modal} from '../common/Modal';
import {useProjectStore} from '../../stores/projectStore';
import {shapeAutomationSegment,automationShapes,defaultShapeControls,type AutomationShape,type AutomationShapeControls} from '../../lib/automationShape';
import {targetPoints,type AutomationTarget} from '../../lib/automationRecording';
import type {TimelineProject} from '../../types/audio';
import {reviewedShapeForPoint} from '../../lib/automationShapeMetadata';

/** Preview only; stale project reviews cannot write. */
export function AutomationShapeReview({project,target,pointTime:selectedTime,onClose}:{project:TimelineProject;target:AutomationTarget;pointTime:number;onClose:()=>void}) {
 const before=(target.parameter==='pan'?normalizePanPoints:normalizeGainPoints)(targetPoints(project,target)),saved=reviewedShapeForPoint(before,before.findIndex(p=>p.time===selectedTime)),pointTime=saved?.a.time??selectedTime;
 const {t}=useTranslation(),[shape,setShape]=useState<AutomationShape>(saved?.review.shape??'s-curve'),current=useProjectStore(s=>s.project);
 const shapeInput=useRef<HTMLSelectElement>(null);
 const [controls,setControls]=useState<AutomationShapeControls>(saved?.review.controls??defaultShapeControls);
 const handleValue=(key:keyof AutomationShapeControls,value:number)=>setControls(c=>({...c,[key]:Math.max(key==='x2'?c.x1:0,Math.min(key==='x1'?c.x2:1,value))}));
 useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}};window.addEventListener('keydown',escape,true);return()=>window.removeEventListener('keydown',escape,true);},[onClose]);
 let preview:TimelineProject|undefined,error='';
 try{if(current!==project)throw new Error('automation.changed');preview=shapeAutomationSegment(project,target,pointTime,shape,controls);}catch(reason){error=t(reason instanceof Error?reason.message:String(reason));}
 const a=before.find(p=>p.time===pointTime),b=saved?.b??before.filter(p=>p.time>pointTime).sort((a,b)=>a.time-b.time)[0];
 const points=preview?(target.parameter==='pan'?normalizePanPoints:normalizeGainPoints)(targetPoints(preview,target)).filter(p=>p.time>=pointTime&&p.time<=(b?.time??pointTime)):[];
 const effectType=project.tracks.find(t=>t.id===target.trackId)?.effects?.[target.effectIndex??-1]?.type,mixOnly=effectType==='ringmod'||effectType==='bitcrush'||effectType==='distortion'||effectType==='chorus'||effectType==='reverb';
 const parameterLabel=target.parameter==='depth'?'automation.chorusDepth':target.parameter==='gain'?'automation.gainLane':target.parameter==='pan'?'automation.panLane':mixOnly?`automation.${effectType}Mix`:`automation.delay${target.parameter[0].toUpperCase()+target.parameter.slice(1)}`;
 const format=(v:number)=>target.parameter==='gain'?`${v===0?'−∞':(20*Math.log10(v)).toFixed(1)} dB`:target.parameter==='pan'?v.toFixed(2):target.parameter==='time'?`${(v*1000).toFixed(1)} ms`:`${(v*100).toFixed(1)}%`;
 const range=Math.abs((b?.value??0)-(a?.value??0))||1,min=Math.min(a?.value??0,b?.value??0);
 const plotted=points.map(p=>({x:(p.time-pointTime)/((b?.time??pointTime+1)-pointTime),y:(p.value-min)/range}));
 return <Modal isOpen initialFocusRef={shapeInput} onClose={onClose} title={t('automation.shapeSegment')}>
  <div data-automation-shape-review className="space-y-3 text-sm" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onClose();}}}>
   <p>{project.tracks.find(track=>track.id===target.trackId)?.name} · {target.effectIndex===undefined?'':`${target.effectIndex+1} · `}{t(parameterLabel)}</p>
   <p className="text-xs text-gray-400">{pointTime.toFixed(3)}–{b?.time.toFixed(3)} s · {a&&format(a.value)} → {b&&format(b.value)}</p>
   <label className="flex flex-wrap items-center gap-2">{t('automation.shape')}<select ref={shapeInput} aria-label={t('automation.shape')} className="min-h-11 bg-gray-800 rounded px-2" value={shape} onChange={e=>setShape(e.target.value as AutomationShape)}>{automationShapes.map(value=><option key={value} value={value}>{t(`automation.shape_${value}`)}</option>)}</select></label>
   <AutomationShapeChart points={plotted} flat={a?.value===b?.value} descending={(b?.value??0)<(a?.value??0)} controls={shape==='custom'?controls:undefined} onChange={setControls}/>
   {shape==='custom'&&<div className="space-y-2">
    {([1,2] as const).map(index=><div key={index} className="flex flex-wrap items-center gap-2">
     <span className="text-xs text-indigo-300">{t('automation.shapeHandle',{index})}</span>
     {(['x','y'] as const).map(axis=><label key={axis} className="flex items-center gap-1 text-xs">{t(axis==='x'?'automation.handleTime':'automation.handleValue')} % <NumberField key={`${index}:${axis}:${controls[`${axis}${index}`]}`} width="w-20" label={t(axis==='x'?'automation.handleTimeLabel':'automation.handleValueLabel',{index})} value={Number((controls[`${axis}${index}`]*100).toFixed(3))} step={1} min={0} onCommit={v=>{handleValue(`${axis}${index}`,v/100);return true;}}/></label>)}
    </div>)}
    <p className="text-xs text-gray-400">{t(a?.value===b?.value?'automation.flatShapeHelp':'automation.customShapeHelp')}</p>
   </div>}

   <p className="text-xs text-gray-400">{t(target.parameter==='depth'?'automation.chorusDepthShapeHelp':mixOnly?`automation.${effectType}ShapeHelp`:'automation.shapeHelp',{count:Math.max(0,points.length-2)})}</p>
   {error&&<p role="alert" className="text-amber-300">{error}</p>}
   <div className="flex justify-end gap-2"><button className="timeline-tool" onClick={onClose}>{t('common.cancel')}</button><button className="timeline-tool bg-indigo-700" disabled={!preview} onClick={()=>{if(!preview||useProjectStore.getState().project!==project)return;if(preview!==project)useProjectStore.setState({project:preview});onClose();}}>{t('automation.applyShape')}</button></div>
  </div>
 </Modal>;
}
