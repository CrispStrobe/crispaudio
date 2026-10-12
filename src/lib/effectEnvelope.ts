import type {GainPoint,TimelineProject} from '../types/audio';
import {normalizeGainPoints,curveFields,validAutomationCurve} from './mixAutomation';
import {effectParameterAt,delayParameterMaximum,effectParameterDefault,supportsEffectParameter,type DelayParameter} from './effectAutomation';
import {applyAutomationPass,type AutomationTarget} from './automationRecording';
import {timelineDuration} from './timelineView';
export type EffectParameter=DelayParameter;
export interface EffectEnvelope {effectType:'delay'|'ringmod'|'bitcrush'|'distortion'|'chorus'|'reverb';parameter:EffectParameter;duration:number;points:GainPoint[];sourceName?:string;sourceStart?:number}
const fail=(key:string):never=>{throw new Error(`automation.${key}`);};
function points(input:GainPoint[]|undefined,parameter:EffectParameter){
 const maximum=delayParameterMaximum(parameter);
 if(input!==undefined&&(!Array.isArray(input)||input.some(p=>!p||!validAutomationCurve(p)||!Number.isFinite(p.time)||p.time<0||!Number.isFinite(p.value)||p.value<0||p.value>maximum)))fail('invalidEnvelope');
 return normalizeGainPoints(input);
}
function effect(project:TimelineProject,trackId:string,index:number,parameter:EffectParameter){
 const track=project.tracks.find(t=>t.id===trackId)??fail('missingTrack'),insert=track.effects?.[index];
 if(!Number.isInteger(index)||index<0||!supportsEffectParameter(insert?.type,parameter))fail('invalidEnvelope');
 return {track,insert:insert!};
}
/** Snapshot only the selected parameter; empty lanes capture their static value. */
export function copyEffectEnvelope(project:TimelineProject,trackId:string,index:number,parameter:EffectParameter,start=0,end=timelineDuration(project)):EffectEnvelope {
 if(parameter!=='mix'&&parameter!=='feedback'&&parameter!=='time'&&parameter!=='depth'&&parameter!=='rate')fail('parameterMismatch');
 const {track,insert}=effect(project,trackId,index,parameter);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>timelineDuration(project))fail('bounds');
 const source=points(insert.automation?.[parameter],parameter),fallback=Math.min(delayParameterMaximum(parameter),insert.params[parameter]??effectParameterDefault(insert.type,parameter));
 return {effectType:insert.type as EffectEnvelope['effectType'],parameter,sourceName:track.name,sourceStart:start,duration:end-start,points:[
  {time:0,value:effectParameterAt(source,start,fallback,parameter),...curveFields(source,start)},...source.filter(p=>p.time>start&&p.time<end).map(p=>({...p,time:p.time-start})),{time:end-start,value:effectParameterAt(source,end,fallback,parameter)},
 ]};
}
/** Reuse reviewed pass guards/locks/no-op rules after stretching a relative envelope. */
export function pasteEffectEnvelope(project:TimelineProject,trackId:string,index:number,parameter:EffectParameter,envelope:EffectEnvelope,time:number,duration=envelope.duration):TimelineProject {
 if(envelope.parameter!==parameter||(parameter!=='mix'&&parameter!=='feedback'&&parameter!=='time'&&parameter!=='depth'&&parameter!=='rate'))fail('parameterMismatch');
 const {insert}=effect(project,trackId,index,parameter);
 if(envelope.effectType!==insert.type)fail('parameterMismatch');
 if(!Number.isFinite(envelope.duration)||envelope.duration<=0||!Array.isArray(envelope.points))fail('invalidEnvelope');
 const source=points(envelope.points,parameter);
 if(source.some(p=>p.time>envelope.duration))fail('invalidEnvelope');
 const rate=project.sampleRate,end=time+duration;
 if(!Number.isFinite(time)||!Number.isFinite(duration)||!Number.isFinite(rate)||rate<=0||time<0||duration<1/rate||!Number.isFinite(end)||end>timelineDuration(project))fail('bounds');
 const fallback=effectParameterDefault(insert.type,parameter);
 const target:AutomationTarget={trackId,effectIndex:index,parameter};
 return applyAutomationPass(project,target,[{points:[{time,value:effectParameterAt(source,0,fallback,parameter),...curveFields(source,0)},
  ...source.filter(p=>p.time>0&&p.time<envelope.duration).map(p=>({...p,time:time+p.time/envelope.duration*duration})),
  {time:end,value:effectParameterAt(source,envelope.duration,fallback,parameter)},
 ]}]);
}

export type EffectClipboardKey=Exclude<EffectParameter,'depth'|'rate'>|'ringmodMix'|'bitcrushMix'|'distortionMix'|'chorusMix'|'reverbMix'|'chorusDepth'|'chorusRate';
export const effectClipboardKey=(type:string|undefined,parameter:EffectParameter):EffectClipboardKey=>parameter==='rate'?'chorusRate':parameter==='depth'?'chorusDepth':type==='ringmod'||type==='bitcrush'||type==='distortion'||type==='chorus'||type==='reverb'?`${type}Mix`:parameter;
