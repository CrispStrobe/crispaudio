import type {NativeParameterCurve} from '../types/audio';
import {normalizeGainPoints,validAutomationCurve} from './mixAutomation';
export function validNativeParameterAutomation(value:unknown):value is Record<string,NativeParameterCurve>|undefined {
 if(value===undefined)return true;
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const lanes=Object.entries(value);let count=0;
 return lanes.length<=32&&lanes.every(([address,lane])=>{
  if(!address||address.length>128||!lane||!Number.isFinite(lane.min)||!Number.isFinite(lane.max)||lane.min>=lane.max||!Number.isFinite(lane.max-lane.min)||!Array.isArray(lane.points))return false;
  count+=lane.points.length;
  return count<=100000&&lane.points.every((p:NativeParameterCurve['points'][number])=>p&&Number.isFinite(p.time)&&p.time>=0&&Number.isFinite(p.value)&&p.value>=0&&p.value<=1&&validAutomationCurve(p));
 });
}
/** Normalize once before processing; each block uses a bounded binary search per lane. */
export function compileNativeParameterAutomation(automation:Record<string,NativeParameterCurve>|undefined){
 const lanes=Object.entries(automation??{}).map(([address,lane])=>({address,min:lane.min,max:lane.max,points:normalizeGainPoints(lane.points)})).filter(lane=>lane.points.length);
 return (time:number):Record<string,number>=>Object.fromEntries(lanes.map(({address,min,max,points})=>{
  const t=Math.max(0,time);let value=points[0].value;
  if(t>=points.at(-1)!.time)value=points.at(-1)!.value;
  else if(t>points[0].time){let low=0,high=points.length-1;while(low+1<high){const middle=(low+high)>>1;if(points[middle].time<=t)low=middle;else high=middle;}const a=points[low],b=points[high];value=a.curve==='step'?a.value:a.value+(b.value-a.value)*(t-a.time)/(b.time-a.time);}
  return [address,min+(max-min)*value];
 }));
}
export function nativeParameterValues(automation:Record<string,NativeParameterCurve>|undefined,time:number){return compileNativeParameterAutomation(automation)(time);}

export function nativeAutomationPacketFits(parameters:Record<string,number>,automation:Record<string,NativeParameterCurve>|undefined){
 const worst={...parameters,...Object.fromEntries(Object.entries(automation??{}).filter(([,lane])=>lane.points.length).map(([address])=>[address,-Number.MAX_VALUE]))};
 return new TextEncoder().encode(JSON.stringify(worst)).length+3*Object.keys(worst).length+512<=8192;
}
