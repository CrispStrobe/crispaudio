import type {GainPoint} from '../types/audio';
import {normalizeGainPoints,normalizePanPoints,curveFields,validAutomationCurve,automationCheckTimes} from './mixAutomation';
export interface RecordedSpan {points:GainPoint[]}
export interface EnvelopeBounds {rate:number;duration:number;minimum:number;maximum:number;fallback:number}
const fail=(key:string):never=>{throw new Error(`automation.${key}`);};
const interpolator=(points:GainPoint[],fallback:number)=>(time:number)=>{
 if(!points.length)return fallback;if(time<=points[0].time)return points[0].value;if(time>=points.at(-1)!.time)return points.at(-1)!.value;
 let low=0,high=points.length-1;while(low+1<high){const middle=(low+high)>>1;if(points[middle].time<=time)low=middle;else high=middle;}
 const a=points[low],b=points[high];return a.curve==='step'?a.value:a.value+(b.value-a.value)*(time-a.time)/(b.time-a.time);
};
/** Replace reviewed intervals with one-sample guards; preserve curves outside them. */
export function recordedEnvelope(before:GainPoint[],spans:RecordedSpan[],{rate,duration,minimum,maximum,fallback}:EnvelopeBounds):GainPoint[]{
 if(!Number.isFinite(rate)||rate<=0||!Number.isFinite(duration)||duration<0||!Number.isFinite(fallback)||!Array.isArray(spans)||spans.length>1000)fail('invalidEnvelope');
 const valid=(p:GainPoint)=>p&&validAutomationCurve(p)&&Number.isFinite(p.time)&&p.time>=0&&Number.isFinite(p.value)&&p.value>=minimum&&p.value<=maximum;
 if(!Array.isArray(before)||before.some(p=>!valid(p)))fail('invalidEnvelope');
 const normalize=minimum<0?normalizePanPoints:normalizeGainPoints,original=normalize(before),oldAt=interpolator(original,fallback);
 let last=-Infinity,count=0,points=[...original];
 for(const span of spans){
  if(!Array.isArray(span.points)||span.points.length<2)fail('invalidEnvelope');count+=span.points.length;if(count>100000)fail('recordLimit');
  if(span.points.some((p,i)=>!valid(p)||(i>0&&p.time<=span.points[i-1].time)))fail('invalidEnvelope');
  const start=span.points[0].time,end=span.points.at(-1)!.time;
  if(end>duration||end-start<1/rate||start<=last)fail('bounds');last=end;
  const left=Math.max(0,start-1/rate),right=Math.min(duration,end+1/rate);
  points=[...points.filter(p=>p.time<left||p.time>right),...(start>0?[{time:left,value:oldAt(left)}]:[]),...span.points.map((p,i)=>i===span.points.length-1?(()=>{const next={...p};delete next.curve;return next;})():p),...(end<duration?[{time:right,value:oldAt(right),...curveFields(original,right)}]:[])];
 }
 points=normalize(points);const newAt=interpolator(points,fallback);
 return automationCheckTimes(before,points).every(time=>Math.abs(oldAt(time)-newAt(time))<=1e-12*Math.max(1,Math.abs(oldAt(time))))?before:points;
}
