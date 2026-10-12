import {curveHandleSegment} from '../../lib/automationShapeMetadata';
import {timelineDuration} from '../../lib/timelineView';
import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useProjectStore} from '../../stores/projectStore';
import {shapeAutomationSegment,type AutomationShapeControls} from '../../lib/automationShape';
import {targetPoints,type AutomationTarget} from '../../lib/automationRecording';
import {normalizeGainPoints,normalizePanPoints} from '../../lib/mixAutomation';
import type {GainPoint,TimelineProject} from '../../types/audio';

export interface CurveDraft {project:TimelineProject;trackId:string;points:GainPoint[]}
/** Linear and saved shaped spans share the lane's clock and value scale. Gesture drafts never
 * write the store; release commits once only while the original project is current. */
export function AutomationCurveHandles({project,target,pointTime,disabled,x,y,valueAtY,scroll,zoom,onPreview}:{project:TimelineProject;target:AutomationTarget;pointTime:number;disabled:boolean;x:(time:number)=>number;y:(value:number)=>number;valueAtY:(py:number)=>number;scroll:number;zoom:number;onPreview:(draft:CurveDraft|null)=>void}) {
 const {t}=useTranslation(),[draft,setDraft]=useState<AutomationShapeControls|null>(null);
 const gesture=useRef<{controls:AutomationShapeControls;preview:TimelineProject;pointer?:number}|null>(null);
 const normalize=target.parameter==='pan'?normalizePanPoints:normalizeGainPoints,points=normalize(targetPoints(project,target)),span=curveHandleSegment(points,points.findIndex(p=>p.time===pointTime),project.sampleRate,timelineDuration(project));
 const cancel=()=>{gesture.current=null;setDraft(null);onPreview(null);};
 useEffect(()=>{
  const cancel=()=>{gesture.current=null;setDraft(null);onPreview(null);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&gesture.current){event.preventDefault();event.stopPropagation();cancel();}};
  window.addEventListener('keydown',escape,true);window.addEventListener('blur',cancel);
  return()=>{gesture.current=null;onPreview(null);window.removeEventListener('keydown',escape,true);window.removeEventListener('blur',cancel);};
 },[project,pointTime,target.trackId,target.parameter,target.effectIndex,disabled,onPreview]);
 if(!span||disabled)return null;
 const controls=draft??span.controls,{a,b}=span;
 const update=(index:1|2,px:number,py:number)=>{
  if(useProjectStore.getState().project!==project){cancel();return;}
  const next={...controls,[`x${index}`]:Math.max(index===1?0:controls.x1,Math.min(index===1?controls.x2:1,px)),[`y${index}`]:Math.max(0,Math.min(1,py))};
  const preview=shapeAutomationSegment(project,target,a.time,'custom',next);
  gesture.current={...gesture.current,controls:next,preview};setDraft(next);onPreview({project,trackId:target.trackId,points:normalize(targetPoints(preview,target))});
 };
 const finish=()=>{const current=gesture.current;cancel();if(current&&useProjectStore.getState().project===project&&current.preview!==project)useProjectStore.setState({project:current.preview});};
 const hx=(index:1|2)=>x(a.time+(b.time-a.time)*controls[`x${index}`]),hy=(index:1|2)=>y(a.value+(b.value-a.value)*controls[`y${index}`]);
 return <g data-automation-curve-handles>
  <path d={`M${x(a.time)},${y(a.value)} L${hx(1)},${hy(1)} M${x(b.time)},${y(b.value)} L${hx(2)},${hy(2)}`} stroke="#818cf8" fill="none" pointerEvents="none"/>
  {([1,2] as const).map(index=><g key={index} data-curve-handle={index} role="button" tabIndex={0} aria-label={t('automation.inlineShapeHandle',{index})} transform={`translate(${hx(index)},${hy(index)})`} className="cursor-move focus:outline-none focus-visible:stroke-white"
   onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();gesture.current={controls,preview:project,pointer:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.focus();}}
   onPointerMove={e=>{if(gesture.current?.pointer!==e.pointerId)return;const matrix=e.currentTarget.ownerSVGElement?.getScreenCTM();if(!matrix)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());update(index,(scroll+p.x/zoom-a.time)/(b.time-a.time),(valueAtY(p.y)-a.value)/(b.value-a.value));}}
   onPointerUp={e=>{if(gesture.current?.pointer===e.pointerId){e.stopPropagation();finish();}}} onPointerCancel={cancel} onLostPointerCapture={()=>{if(gesture.current?.pointer!==undefined)cancel();}}
   onKeyDown={e=>{e.stopPropagation();if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const step=e.shiftKey?.1:.01,descending=b.value<a.value;update(index,controls[`x${index}`]+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),controls[`y${index}`]+(e.key==='ArrowUp'?(descending?-step:step):e.key==='ArrowDown'?(descending?step:-step):0));}}
   onKeyUp={e=>{e.stopPropagation();if(e.key.startsWith('Arrow')&&gesture.current?.pointer===undefined)finish();}} onBlur={()=>{if(gesture.current?.pointer===undefined)cancel();}}>
   <title>{t('automation.inlineShapeHelp')}</title><circle r={22} fill="transparent"/><circle r={6} fill="#818cf8" stroke="white" strokeWidth={1}/>
  </g>)}
 </g>;
}
