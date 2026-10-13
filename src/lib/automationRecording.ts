import {recordedEnvelope} from './recordedEnvelope';
import type {GainPoint,TimelineProject} from '../types/audio';
import {gainAt,panAt} from './mixAutomation';
import {effectParameterAt,delayParameterMaximum,effectParameterDefault,supportsEffectParameter} from './effectAutomation';
import {timelineDuration} from './timelineView';
export type AutomationMode='read'|'touch'|'latch'|'write';
export interface AutomationTarget {trackId:string;parameter:'gain'|'pan'|'mix'|'feedback'|'time'|'depth'|'rate'|'freq';effectIndex?:number}
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
/** Bounded intervals only; original curves survive outside one-sample guards.
 * Passes are local drafts until this pure review/apply operation is called. */
export function applyAutomationPass(project:TimelineProject,target:AutomationTarget,spans:AutomationSpan[]):TimelineProject {
 const track=project.tracks.find(t=>t.id===target.trackId)??fail('missingTrack');if(track.locked)fail('lockedEnvelope');
 const before=targetPoints(project,target)??[],maximum=target.parameter==='gain'?Infinity:target.parameter==='pan'?1:delayParameterMaximum(target.parameter),minimum=target.parameter==='pan'?-1:0;
 const fallback=target.parameter==='gain'?1:target.parameter==='pan'?Math.max(-1,Math.min(1,track.pan)):Math.max(0,Math.min(maximum,track.effects![target.effectIndex!].params[target.parameter]??effectParameterDefault(track.effects![target.effectIndex!].type,target.parameter)));
 const points=recordedEnvelope(before,spans,{rate:project.sampleRate,duration:timelineDuration(project),minimum,maximum,fallback});if(points===before)return project;
 const candidate={...project,tracks:project.tracks.map(t=>t.id!==target.trackId?t:target.parameter==='gain'?{...t,automation:points}:target.parameter==='pan'?{...t,panAutomation:points}:{...t,effects:t.effects!.map((e,i)=>i===target.effectIndex?{...e,automation:{...e.automation,[target.parameter]:points}}:e)})};
 return candidate;
}
