import type {EffectConfig,GainPoint} from '../types/audio';
import {gainAt,normalizeGainPoints} from './mixAutomation';
export function normalizeMixPoints(points:GainPoint[]|undefined){return normalizeGainPoints(points).filter(p=>p.value<=1);}
export function mixAt(points:GainPoint[]|undefined,time:number,fallback:number){return points?.length?gainAt(points,time):Math.max(0,Math.min(1,fallback));}
export function scheduleMix(wet:AudioParam,dry:AudioParam,points:GainPoint[]|undefined,contextStart:number,timelineStart:number,fallback:number){
 const sorted=normalizeMixPoints(points),value=mixAt(sorted,timelineStart,fallback);
 wet.setValueAtTime(value,contextStart);dry.setValueAtTime(1-value,contextStart);
 for(const point of sorted)if(point.time>timelineStart){const clock=contextStart+point.time-timelineStart;wet.linearRampToValueAtTime(point.value,clock);dry.linearRampToValueAtTime(1-point.value,clock);}
}
export const hasEffectAutomation=(effect:EffectConfig)=>!!(effect.automation?.mix?.length||effect.automation?.feedback?.length);
export function scheduleFeedback(param:AudioParam,points:GainPoint[]|undefined,contextStart:number,timelineStart:number,fallback:number){
 const sorted=normalizeGainPoints(points).filter(p=>p.value<=.95);
 param.setValueAtTime(mixAt(sorted,timelineStart,Math.min(.95,fallback)),contextStart);
 for(const point of sorted)if(point.time>timelineStart)param.linearRampToValueAtTime(point.value,contextStart+point.time-timelineStart);
}
export function validEffectAutomation(effect:EffectConfig){
 const a=effect.automation;if(a===undefined)return true;
 return effect.type==='delay'&&!!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).every(k=>k==='mix'||k==='feedback')&&(['mix','feedback'] as const).every(key=>a[key]===undefined||(Array.isArray(a[key])&&a[key]!.every(p=>p&&Number.isFinite(p.time)&&p.time>=0&&Number.isFinite(p.value)&&p.value>=0&&p.value<=(key==='feedback'?.95:1))));
}
