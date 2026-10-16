import {validNativeParameterAutomation} from './nativeParameterCurves';
import type {NativeParameterCurve,TimelineProject} from '../types/audio';
import {normalizeGainPoints} from './mixAutomation';
import {nativeEffectScopes,replaceNativeEffects} from './nativeEffects';
export interface NativeParameterTarget {instanceId:string;address:string;min:number;max:number;defaultValue?:number}
export function nativeParameterTarget(project:TimelineProject,scope:string,target:NativeParameterTarget){
 const effect=nativeEffectScopes(project).find(([key])=>scope===key)?.[1]?.find(effect=>effect.instanceId===target.instanceId);
 if(!effect||!validNativeParameterAutomation({[target.address]:{min:target.min,max:target.max,points:[]}}))throw new Error('fxInspector.missing');
 const track=project.tracks.find(track=>scope===`track:${track.id}`||track.segments.some(clip=>scope===`clip:${clip.id}`));
 const clip=track?.segments.find(clip=>scope===`clip:${clip.id}`);
 return {effect,locked:!!track?.locked,start:clip?.startTime??0,end:clip?clip.startTime+clip.duration:project.duration};
}
export function applyNativeParameterAutomation(snapshot:TimelineProject,current:TimelineProject,scope:string,target:NativeParameterTarget,points:NativeParameterCurve['points'],recording=false){
 if(current!==snapshot)throw new Error('fxInspector.stale');
 const resolved=nativeParameterTarget(current,scope,target);
 if(recording||resolved.locked)throw new Error('fxInspector.protected');
 const lane={min:target.min,max:target.max,points};
 if(!validNativeParameterAutomation({[target.address]:lane}))throw new Error('fxInspector.invalid');
 const baseline=resolved.effect.parameters[target.address]??target.defaultValue;
 if(points.length&&(baseline===undefined||!Number.isFinite(baseline)))throw new Error('fxInspector.invalid');
 let automation={...resolved.effect.parameterAutomation};
 if(points.length)automation={...automation,[target.address]:{...lane,points:normalizeGainPoints(points)}};else delete automation[target.address];
 if(JSON.stringify(automation)===JSON.stringify(resolved.effect.parameterAutomation??{}))return current;
 return replaceNativeEffects(current,scope,nativeEffectScopes(current).find(([key])=>key===scope)![1]!.map(effect=>effect===resolved.effect?{...effect,parameters:points.length?{...effect.parameters,[target.address]:baseline!}:effect.parameters,parameterAutomation:Object.keys(automation).length?automation:undefined}:effect));
}
