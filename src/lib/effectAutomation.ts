import type {EffectConfig,GainPoint} from '../types/audio';
import {gainAt,normalizeGainPoints,schedulePoints,validAutomationCurve} from './mixAutomation';
export function normalizeMixPoints(points:GainPoint[]|undefined){return normalizeGainPoints(points).filter(p=>p.value<=1);}
export function mixAt(points:GainPoint[]|undefined,time:number,fallback:number){return points?.length?gainAt(points,time):Math.max(0,Math.min(1,fallback));}
export function scheduleMix(wet:AudioParam,dry:AudioParam,points:GainPoint[]|undefined,contextStart:number,timelineStart:number,fallback:number,dryScale=1){
 const sorted=normalizeMixPoints(points),value=mixAt(sorted,timelineStart,fallback);
 wet.setValueAtTime(value,contextStart);dry.setValueAtTime(1-value*dryScale,contextStart);
 schedulePoints(wet,sorted,contextStart,timelineStart);schedulePoints(dry,sorted,contextStart,timelineStart,v=>1-v*dryScale);
}
export const hasEffectAutomation=(effect:EffectConfig)=>!!(effect.automation?.mix?.length||effect.automation?.feedback?.length||effect.automation?.time?.length);
export function scheduleFeedback(param:AudioParam,points:GainPoint[]|undefined,contextStart:number,timelineStart:number,fallback:number){
 const sorted=normalizeGainPoints(points).filter(p=>p.value<=.95);
 param.setValueAtTime(mixAt(sorted,timelineStart,Math.min(.95,fallback)),contextStart);
 schedulePoints(param,sorted,contextStart,timelineStart);
}
export function validEffectAutomation(effect:EffectConfig){
 const a=effect.automation;if(a===undefined)return true;
 return supportsEffectParameter(effect.type,'mix')&&!!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).every(k=>supportsEffectParameter(effect.type,k))&&(['mix','feedback','time'] as const).every(key=>a[key]===undefined||(Array.isArray(a[key])&&a[key]!.every(p=>p&&Number.isFinite(p.time)&&p.time>=0&&Number.isFinite(p.value)&&validAutomationCurve(p)&&p.value>=0&&p.value<=delayParameterMaximum(key))));
}

export type DelayParameter='mix'|'feedback'|'time';
export const delayParameterMaximum=(parameter:DelayParameter)=>parameter==='time'?2:parameter==='feedback'?.95:1;
export const delayParameterDefault=(parameter:DelayParameter)=>parameter==='feedback'?.4:.3;
export function effectParameterAt(points:GainPoint[]|undefined,time:number,fallback:number,parameter:DelayParameter){
 return points?.length?gainAt(points,time):Math.max(0,Math.min(delayParameterMaximum(parameter),fallback));
}
export function scheduleDelayTime(param:AudioParam,points:GainPoint[]|undefined,contextStart:number,timelineStart:number,fallback:number){
 const sorted=normalizeGainPoints(points).filter(p=>p.value<=2);
 param.setValueAtTime(effectParameterAt(sorted,timelineStart,fallback,'time'),contextStart);
 schedulePoints(param,sorted,contextStart,timelineStart);
}

export const supportsEffectParameter=(type:string|undefined,parameter:string)=>type==='delay'&&['mix','feedback','time'].includes(parameter)||(type==='ringmod'||type==='bitcrush'||type==='distortion'||type==='chorus'||type==='reverb')&&parameter==='mix';
export const effectParameterDefault=(type:string|undefined,parameter:DelayParameter)=>type==='ringmod'||type==='bitcrush'||type==='distortion'?.5:delayParameterDefault(parameter);
