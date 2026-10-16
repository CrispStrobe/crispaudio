import type {AudioSegment,GainPoint,NativeEffect} from '../types/audio';
import {validNativeEffects} from './nativeEffects';
import {gainAt,curveFields,normalizeGainPoints} from './mixAutomation';
export const hasNativeAutomation=(rack:NativeEffect[]|undefined)=>rack?.some(effect=>Object.values(effect.parameterAutomation??{}).some(lane=>lane.points.length))??false;
/** Transform saved envelopes only; processor identity, static Read and opaque state stay intact. */
export function mapNativeAutomation(rack:NativeEffect[]|undefined,transform:(points:GainPoint[])=>GainPoint[]):NativeEffect[]|undefined{
 if(!hasNativeAutomation(rack))return rack;
 const next=rack!.map(effect=>Object.values(effect.parameterAutomation??{}).some(lane=>lane.points.length)?{...effect,parameterAutomation:Object.fromEntries(Object.entries(effect.parameterAutomation!).map(([address,lane])=>[address,lane.points.length?{...lane,points:transform(lane.points)}:lane]))}:effect);
 if(!validNativeEffects(next))throw new Error('fxInspector.invalid');
 return next;
}
/** Positive affine edit. Preserve the value/segment at zero when earlier points move off-canvas. */
export function affineNativeAutomation(rack:NativeEffect[]|undefined,anchor:number,scale:number,delta=0){
 if(![anchor,scale,delta].every(Number.isFinite)||scale<=0)throw new Error('fxInspector.invalid');
 if(scale===1&&delta===0)return rack;
 return mapNativeAutomation(rack,points=>{
  const clock=(time:number)=>anchor+(time-anchor)*scale+delta;
  const shifted=points.filter(point=>clock(point.time)>=0).map(point=>({...point,time:clock(point.time)}));
  if(points.some(point=>clock(point.time)<0)){const at=anchor+(-delta-anchor)/scale;shifted.unshift({time:0,value:gainAt(points,at),...curveFields(points,at)});}
  return normalizeGainPoints(shifted);
 });
}
/** Trims/slips keep their timeline clock; only a content move translates clip envelopes. */
export function retainedNativeClipAutomation(original:AudioSegment,next:AudioSegment):AudioSegment{
 if(original.startTime===next.startTime||original.sourceOffset!==next.sourceOffset||original.duration!==next.duration||!hasNativeAutomation(original.nativeEffects))return next;
 return {...next,nativeEffects:affineNativeAutomation(original.nativeEffects,0,1,next.startTime-original.startTime)};
}
