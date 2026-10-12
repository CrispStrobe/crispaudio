import type {GainPoint,TimelineProject} from '../types/audio';
import {gainAt,normalizeGainPoints,normalizePanPoints,panAt,curveFields,validAutomationCurve,automationCheckTimes} from './mixAutomation';
import {effectParameterAt,delayParameterMaximum,effectParameterDefault,supportsEffectParameter} from './effectAutomation';
import {timelineDuration} from './timelineView';
export type AutomationMode='read'|'touch'|'latch'|'write';
export interface AutomationTarget {trackId:string;parameter:'gain'|'pan'|'mix'|'feedback'|'time'|'depth'|'rate';effectIndex?:number}
export interface AutomationSpan {points:GainPoint[]}
const fail=(key:string):never=>{throw new Error(`automation.${key}`);};
export function targetPoints(project:TimelineProject,target:AutomationTarget):GainPoint[]|undefined {
 const track=project.tracks.find(t=>t.id===target.trackId)??fail('missingTrack');
 if(target.parameter==='gain')return track.automation;
 if(target.parameter==='pan')return track.panAutomation;
 const effect=track.effects?.[target.effectIndex??-1];if(!supportsEffectParameter(effect?.type,target.parameter))fail('invalidEnvelope');
 return effect!.automation?.[target.parameter];
}
export function automationValue(project:TimelineProject,target:AutomationTarget,time:number):number {
 const points=targetPoints(project,target),track=project.tracks.find(t=>t.id===target.trackId)!;
 if(target.parameter==='gain')return gainAt(points,time);
 if(target.parameter==='pan')return panAt(points,time,track.pan);
 const fallback=track.effects![target.effectIndex!].params[target.parameter]??effectParameterDefault(track.effects![target.effectIndex!].type,target.parameter);
 return effectParameterAt(points,time,fallback,target.parameter);
}
function interpolator(points:GainPoint[],fallback:number){return (time:number)=>{
 if(!points.length)return fallback;if(time<=points[0].time)return points[0].value;if(time>=points.at(-1)!.time)return points.at(-1)!.value;
 let low=0,high=points.length-1;while(low+1<high){const middle=(low+high)>>1;if(points[middle].time<=time)low=middle;else high=middle;}
 const a=points[low],b=points[high];return a.curve==='step'?a.value:a.value+(b.value-a.value)*(time-a.time)/(b.time-a.time);
};}
/** Bounded intervals only; original curves survive outside one-sample guards.
 * Passes are local drafts until this pure review/apply operation is called. */
export function applyAutomationPass(project:TimelineProject,target:AutomationTarget,spans:AutomationSpan[]):TimelineProject {
 const track=project.tracks.find(t=>t.id===target.trackId)??fail('missingTrack');if(track.locked)fail('lockedEnvelope');
 const rate=project.sampleRate,canvas=timelineDuration(project),before=targetPoints(project,target)??[];
 if(!Number.isFinite(rate)||rate<=0||!Array.isArray(spans)||spans.length>1000)fail('invalidEnvelope');
 const maximum=target.parameter==='gain'||target.parameter==='pan'?Infinity:delayParameterMaximum(target.parameter),minimum=target.parameter==='pan'?-1:0;
 if(!Array.isArray(before)||before.some(p=>!p||!validAutomationCurve(p)||!Number.isFinite(p.time)||p.time<0||!Number.isFinite(p.value)||p.value<minimum||p.value>(target.parameter==='pan'?1:maximum)))fail('invalidEnvelope');
 const normalize=target.parameter==='pan'?normalizePanPoints:normalizeGainPoints,original=normalize(before);
 const fallback=target.parameter==='gain'?1:target.parameter==='pan'?Math.max(-1,Math.min(1,track.pan)):Math.max(0,Math.min(maximum,track.effects![target.effectIndex!].params[target.parameter]??effectParameterDefault(track.effects![target.effectIndex!].type,target.parameter)));
 const oldAt=interpolator(original,fallback);
 let last=-Infinity,count=0,points=[...original];
 for(const span of spans){
  if(!Array.isArray(span.points)||span.points.length<2)fail('invalidEnvelope');count+=span.points.length;if(count>100000)fail('recordLimit');
  if(span.points.some((p,i)=>!p||!validAutomationCurve(p)||!Number.isFinite(p.time)||!Number.isFinite(p.value)||p.value<minimum||p.value>(target.parameter==='pan'?1:maximum)||(i>0&&p.time<=span.points[i-1].time)))fail('invalidEnvelope');
  const start=span.points[0].time,end=span.points.at(-1)!.time;
  if(start<0||end>canvas||end-start<1/rate||start<=last)fail('bounds');last=end;
  const left=Math.max(0,start-1/rate),right=Math.min(canvas,end+1/rate);
  // Use the original snapshot for guard values, including between separate touches.
  points=[...points.filter(p=>p.time<left||p.time>right),...(start>0?[{time:left,value:oldAt(left)}]:[]),...span.points.map((p,i)=>i===span.points.length-1?(()=>{const next={...p};delete next.curve;return next;})():p),...(end<canvas?[{time:right,value:oldAt(right),...curveFields(original,right)}]:[])];
 }
 points=normalize(points);const newAt=interpolator(points,fallback);
 const candidate={...project,tracks:project.tracks.map(t=>t.id!==target.trackId?t:target.parameter==='gain'?{...t,automation:points}:target.parameter==='pan'?{...t,panAutomation:points}:{...t,effects:t.effects!.map((e,i)=>i===target.effectIndex?{...e,automation:{...e.automation,[target.parameter]:points}}:e)})};
 if(automationCheckTimes(before,points).every(time=>Math.abs(oldAt(time)-newAt(time))<=1e-12*Math.max(1,Math.abs(oldAt(time)))))return project;
 return candidate;
}
