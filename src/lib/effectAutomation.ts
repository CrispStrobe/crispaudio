import type {EffectConfig,GainPoint} from '../types/audio';
import {gainAt,normalizeGainPoints} from './mixAutomation';
export function normalizeMixPoints(points:GainPoint[]|undefined){return normalizeGainPoints(points).filter(p=>p.value<=1);}
export function mixAt(points:GainPoint[]|undefined,time:number,fallback:number){return points?.length?gainAt(points,time):Math.max(0,Math.min(1,fallback));}
export function scheduleMix(wet:AudioParam,dry:AudioParam,points:GainPoint[]|undefined,contextStart:number,timelineStart:number,fallback:number){
 const sorted=normalizeMixPoints(points),value=mixAt(sorted,timelineStart,fallback);
 wet.setValueAtTime(value,contextStart);dry.setValueAtTime(1-value,contextStart);
 for(const point of sorted)if(point.time>timelineStart){const clock=contextStart+point.time-timelineStart;wet.linearRampToValueAtTime(point.value,clock);dry.linearRampToValueAtTime(1-point.value,clock);}
}
export function validEffectAutomation(effect:EffectConfig){
 const a=effect.automation;if(a===undefined)return true;
 return effect.type==='delay'&&!!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).every(k=>k==='mix')&&(a.mix===undefined||(Array.isArray(a.mix)&&a.mix.every(p=>p&&Number.isFinite(p.time)&&p.time>=0&&Number.isFinite(p.value)&&p.value>=0&&p.value<=1)));
}
