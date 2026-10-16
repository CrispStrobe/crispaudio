import type {EffectConfig,GainPoint,TimelineProject} from '../types/audio';
import {gainAt,normalizeGainPoints,schedulePoints,validAutomationCurve} from './mixAutomation';
export function normalizeMixPoints(points:GainPoint[]|undefined){return normalizeGainPoints(points).filter(p=>p.value<=1);}
export function mixAt(points:GainPoint[]|undefined,time:number,fallback:number){return points?.length?gainAt(points,time):Math.max(0,Math.min(1,fallback));}
export function scheduleMix(wet:AudioParam,dry:AudioParam,points:GainPoint[]|undefined,contextStart:number,timelineStart:number,fallback:number,dryScale=1){
 const sorted=normalizeMixPoints(points),value=mixAt(sorted,timelineStart,fallback);
 wet.setValueAtTime(value,contextStart);dry.setValueAtTime(1-value*dryScale,contextStart);
 schedulePoints(wet,sorted,contextStart,timelineStart);schedulePoints(dry,sorted,contextStart,timelineStart,v=>1-v*dryScale);
}
export const hasEffectAutomation=(effect:EffectConfig)=>!!(effect.automation?.mix?.length||effect.automation?.feedback?.length||effect.automation?.time?.length||effect.automation?.depth?.length||effect.automation?.rate?.length||effect.automation?.freq?.length);
export function scheduleFeedback(param:AudioParam,points:GainPoint[]|undefined,contextStart:number,timelineStart:number,fallback:number){
 const sorted=normalizeGainPoints(points).filter(p=>p.value<=.95);
 param.setValueAtTime(mixAt(sorted,timelineStart,Math.min(.95,fallback)),contextStart);
 schedulePoints(param,sorted,contextStart,timelineStart);
}
export function validEffectAutomation(effect:EffectConfig){
 const a=effect.automation;if(a===undefined)return true;
 return supportsEffectParameter(effect.type,'mix')&&!!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).every(k=>supportsEffectParameter(effect.type,k))&&(['mix','feedback','time','depth','rate','freq'] as const).every(key=>a[key]===undefined||(Array.isArray(a[key])&&a[key]!.every(p=>p&&Number.isFinite(p.time)&&p.time>=0&&Number.isFinite(p.value)&&validAutomationCurve(p)&&p.value>=0&&p.value<=delayParameterMaximum(key))));
}

export type DelayParameter='mix'|'feedback'|'time'|'depth'|'rate'|'freq';
export const delayParameterMaximum=(parameter:DelayParameter)=>parameter==='freq'?2000:parameter==='rate'?8:parameter==='time'?2:parameter==='feedback'?.95:1;
export const delayParameterDefault=(parameter:DelayParameter)=>parameter==='feedback'?.4:.3;
export function effectParameterAt(points:GainPoint[]|undefined,time:number,fallback:number,parameter:DelayParameter){
 return points?.length?gainAt(points,time):Math.max(0,Math.min(delayParameterMaximum(parameter),fallback));
}
export function scheduleDelayTime(param:AudioParam,points:GainPoint[]|undefined,contextStart:number,timelineStart:number,fallback:number){
 const sorted=normalizeGainPoints(points).filter(p=>p.value<=2);
 param.setValueAtTime(effectParameterAt(sorted,timelineStart,fallback,'time'),contextStart);
 schedulePoints(param,sorted,contextStart,timelineStart);
}

export const supportsEffectParameter=(type:string|undefined,parameter:string)=>type==='delay'&&['mix','feedback','time'].includes(parameter)||type==='chorus'&&['depth','rate'].includes(parameter)||type==='ringmod'&&parameter==='freq'||(type==='ringmod'||type==='bitcrush'||type==='distortion'||type==='chorus'||type==='reverb')&&parameter==='mix';
export const effectParameterDefault=(type:string|undefined,parameter:DelayParameter)=>parameter==='freq'?200:parameter==='rate'?1.5:parameter==='depth'?.5:type==='ringmod'||type==='bitcrush'||type==='distortion'?.5:delayParameterDefault(parameter);

/** Chorus depth scales both LFO amplitudes by ten milliseconds, without restart. */
export function scheduleChorusDepth(params:readonly AudioParam[],points:GainPoint[]|undefined,contextStart:number,timelineStart:number,fallback:number){
 const sorted=normalizeMixPoints(points),value=effectParameterAt(sorted,timelineStart,fallback,'depth');
 for(const param of params){param.setValueAtTime(value*.01,contextStart);schedulePoints(param,sorted,contextStart,timelineStart,v=>v*.01);}
}

/** Change both oscillator frequencies without restarting phase. Empty envelopes
 * preserve legacy static rates, including values outside the automation range. */
export function scheduleChorusRate(params:readonly AudioParam[],points:GainPoint[]|undefined,contextStart:number,timelineStart:number,fallback:number){
 const sorted=normalizeGainPoints(points).filter(p=>p.value<=8),value=sorted.length?effectParameterAt(sorted,timelineStart,fallback,'rate'):fallback;
 params.forEach((param,index)=>{const scale=index===0?1:1.2;param.setValueAtTime(value*scale,contextStart);schedulePoints(param,sorted,contextStart,timelineStart,v=>v*scale);});
}

/** Ring carrier frequency keeps oscillator phase during live edits. */
export function scheduleRingFrequency(param:AudioParam,points:GainPoint[]|undefined,contextStart:number,timelineStart:number,fallback:number){
 const sorted=normalizeGainPoints(points).filter(p=>p.value<=2000);
 param.setValueAtTime(sorted.length?effectParameterAt(sorted,timelineStart,fallback,'freq'):Math.max(.1,fallback),contextStart);
 schedulePoints(param,sorted,contextStart,timelineStart);
}

/** Parameters supported by hot controls in native built-in racks. */
export const nativeEffectParameters=['mix','feedback','depth','time','rate','freq'] as const;
export const supportsNativeEffectParameter=(type:string|undefined,parameter:string)=>nativeEffectParameters.some(key=>key===parameter)&&supportsEffectParameter(type,parameter);

/** Built-in rack identities match native insert scopes, independently of inserts. */
export function builtinEffectScopes(project:TimelineProject):[string,EffectConfig[]|undefined][]{return [['master',project.masterEffects],...project.tracks.flatMap(track=>[[`track:${track.id}`,track.effects] as [string,EffectConfig[]|undefined],...track.segments.map(clip=>[`clip:${clip.id}`,clip.effects] as [string,EffectConfig[]|undefined])])];}
