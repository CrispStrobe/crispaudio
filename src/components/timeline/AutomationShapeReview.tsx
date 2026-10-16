import {normalizeGainPoints,normalizePanPoints} from '../../lib/mixAutomation';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Modal} from '../common/Modal';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {shapeAutomationSegment} from '../../lib/automationShape';
import {targetPoints,type AutomationTarget} from '../../lib/automationRecording';
import {delayParameterMaximum} from '../../lib/effectAutomation';
import {timelineDuration} from '../../lib/timelineView';
import type {GainPoint,TimelineProject} from '../../types/audio';
import {reviewedShapeForPoint} from '../../lib/automationShapeMetadata';
import {ParameterCurveShape} from './ParameterCurveShape';

/** The shared compact review previews locally; track Apply publishes one project edit. */
export function AutomationShapeReview({project,target,pointTime,onClose}:{project:TimelineProject;target:AutomationTarget;pointTime:number;onClose:()=>void}) {
 const {t}=useTranslation(),current=useProjectStore(s=>s.project),recording=useUIStore(s=>s.timelineRecording),[applyError,setApplyError]=useState('');
 const track=project.tracks.find(t=>t.id===target.trackId),effectType=track?.effects?.[target.effectIndex??-1]?.type,mixOnly=effectType==='ringmod'||effectType==='bitcrush'||effectType==='distortion'||effectType==='chorus'||effectType==='reverb';
 const label=target.parameter==='freq'?'automation.ringmodFrequency':target.parameter==='rate'?'automation.chorusRate':target.parameter==='depth'?'automation.chorusDepth':target.parameter==='gain'?'automation.gainLane':target.parameter==='pan'?'automation.panLane':mixOnly?`automation.${effectType}Mix`:`automation.delay${target.parameter[0].toUpperCase()+target.parameter.slice(1)}`;
 const format=(v:number)=>target.parameter==='gain'?`${v===0?'−∞':(20*Math.log10(v)).toFixed(1)} dB`:target.parameter==='pan'?v.toFixed(2):target.parameter==='rate'||target.parameter==='freq'?`${v.toFixed(2)} Hz`:target.parameter==='time'?`${(v*1000).toFixed(1)} ms`:`${(v*100).toFixed(1)}%`;
 let before:GainPoint[]=[],error='';
 try{before=(target.parameter==='pan'?normalizePanPoints:normalizeGainPoints)(targetPoints(project,target));if(current!==project)throw new Error('automation.changed');if(track?.locked)throw new Error('automation.lockedEnvelope');if(recording)throw new Error('fxInspector.protected');}catch(e){error=t(e instanceof Error?e.message:String(e));}
 const index=before.findIndex(p=>p.time===pointTime),saved=reviewedShapeForPoint(before,index),a=saved?.a??before[index],b=saved?.b??before[index+1];
 return <Modal isOpen onClose={onClose} title={t('automation.shapeSegment')} widthClass="max-w-lg self-start my-4">
  <div data-automation-shape-review className="space-y-2 text-sm">
   <p className="truncate text-gray-400" title={`${track?.name??''} · ${t(label)}`}>{track?.name} · {t(label)}</p>
   <ParameterCurveShape points={before} time={pointTime} rate={project.sampleRate} minimum={target.parameter==='pan'?-1:0} maximum={target.parameter==='gain'?Infinity:target.parameter==='pan'?1:delayParameterMaximum(target.parameter)} endTime={timelineDuration(project)} disabled={!!error} applyLabel={t('automation.applyShape')} onCancel={onClose}
    help={<><p className="break-words">{track?.name} · {target.effectIndex===undefined?'':`${target.effectIndex+1} · `}{t(label)}</p>{a&&b&&<p>{format(a.value)} → {format(b.value)}</p>}<p>{t('curveShape.trackHelp')}</p>{target.parameter==='freq'&&<p>{t('automation.ringmodFreqHelp')}</p>}</>}
    onUse={(_points,time,{shape,controls})=>{try{if(useProjectStore.getState().project!==project)throw new Error('automation.changed');if(useUIStore.getState().timelineRecording)throw new Error('fxInspector.protected');const next=shapeAutomationSegment(project,target,time,shape,controls);if(next!==project)useProjectStore.setState({project:next});onClose();}catch(e){setApplyError(t(e instanceof Error?e.message:String(e)));}}}/>
   {(error||applyError)&&<p role="alert" className="text-xs text-amber-300">{error||applyError}</p>}
  </div>
 </Modal>;
}
