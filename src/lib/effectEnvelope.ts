import type {GainPoint,TimelineProject} from '../types/audio';
import {normalizeGainPoints} from './mixAutomation';
import {mixAt} from './effectAutomation';
import {applyAutomationPass,type AutomationTarget} from './automationRecording';
import {timelineDuration} from './timelineView';
export type EffectParameter='mix'|'feedback';
export interface EffectEnvelope {effectType:'delay';parameter:EffectParameter;duration:number;points:GainPoint[];sourceName?:string;sourceStart?:number}
const fail=(key:string):never=>{throw new Error(`automation.${key}`);};
function points(input:GainPoint[]|undefined,parameter:EffectParameter){
 const maximum=parameter==='feedback'?.95:1;
 if(input!==undefined&&(!Array.isArray(input)||input.some(p=>!p||!Number.isFinite(p.time)||p.time<0||!Number.isFinite(p.value)||p.value<0||p.value>maximum)))fail('invalidEnvelope');
 return normalizeGainPoints(input);
}
function effect(project:TimelineProject,trackId:string,index:number){
 const track=project.tracks.find(t=>t.id===trackId)??fail('missingTrack'),insert=track.effects?.[index];
 if(!Number.isInteger(index)||index<0||insert?.type!=='delay')fail('invalidEnvelope');
 return {track,insert:insert!};
}
/** Snapshot only the selected parameter; empty lanes capture their static value. */
export function copyEffectEnvelope(project:TimelineProject,trackId:string,index:number,parameter:EffectParameter,start=0,end=timelineDuration(project)):EffectEnvelope {
 if(parameter!=='mix'&&parameter!=='feedback')fail('parameterMismatch');
 const {track,insert}=effect(project,trackId,index);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>timelineDuration(project))fail('bounds');
 const source=points(insert.automation?.[parameter],parameter),fallback=Math.min(parameter==='feedback'?.95:1,insert.params[parameter]??(parameter==='mix'?.3:.4));
 return {effectType:'delay',parameter,sourceName:track.name,sourceStart:start,duration:end-start,points:[
  {time:0,value:mixAt(source,start,fallback)},...source.filter(p=>p.time>start&&p.time<end).map(p=>({...p,time:p.time-start})),{time:end-start,value:mixAt(source,end,fallback)},
 ]};
}
/** Reuse reviewed pass guards/locks/no-op rules after stretching a relative envelope. */
export function pasteEffectEnvelope(project:TimelineProject,trackId:string,index:number,parameter:EffectParameter,envelope:EffectEnvelope,time:number,duration=envelope.duration):TimelineProject {
 if(envelope.effectType!=='delay'||envelope.parameter!==parameter||(parameter!=='mix'&&parameter!=='feedback'))fail('parameterMismatch');
 effect(project,trackId,index);
 if(!Number.isFinite(envelope.duration)||envelope.duration<=0||!Array.isArray(envelope.points))fail('invalidEnvelope');
 const source=points(envelope.points,parameter);
 if(source.some(p=>p.time>envelope.duration))fail('invalidEnvelope');
 const rate=project.sampleRate,end=time+duration;
 if(!Number.isFinite(time)||!Number.isFinite(duration)||!Number.isFinite(rate)||rate<=0||time<0||duration<1/rate||!Number.isFinite(end)||end>timelineDuration(project))fail('bounds');
 const fallback=parameter==='mix'?.3:.4;
 const target:AutomationTarget={trackId,effectIndex:index,parameter};
 return applyAutomationPass(project,target,[{points:[{time,value:mixAt(source,0,fallback)},
  ...source.filter(p=>p.time>0&&p.time<envelope.duration).map(p=>({...p,time:time+p.time/envelope.duration*duration})),
  {time:end,value:mixAt(source,envelope.duration,fallback)},
 ]}]);
}
