import type {GainPoint} from '../types/audio';
import {curveFields,gainAt,normalizeGainPoints,validAutomationCurve} from './mixAutomation';
import {recordedEnvelope} from './recordedEnvelope';
export interface CurveEnvelope {duration:number;points:GainPoint[]}
const fail=():never=>{throw new Error('automation.invalidEnvelope');};
function validate(points:GainPoint[],maximum:number){
 if(!Number.isFinite(maximum)||maximum<=0||!Array.isArray(points)||points.length>100000||points.some(p=>!p||!validAutomationCurve(p)||!Number.isFinite(p.time)||p.time<0||!Number.isFinite(p.value)||p.value<0||p.value>maximum))fail();
}
/** Capture held endpoints and the outgoing segment on a relative clock. */
export function copyCurveRange(points:GainPoint[],fallback:number,start:number,end:number,maximum:number):CurveEnvelope{
 validate(points,maximum);
 if(!Number.isFinite(fallback)||fallback<0||fallback>maximum||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)fail();
 const sorted=normalizeGainPoints(points),at=(time:number)=>sorted.length?gainAt(sorted,time):fallback;
 const copied=[{time:0,value:at(start),...curveFields(sorted,start)},...sorted.filter(p=>p.time>start&&p.time<end).map(p=>({...p,time:p.time-start})),{time:end-start,value:at(end)}];
 validate(copied,maximum);return structuredClone({duration:end-start,points:copied});
}
/** Replace only the destination interval; use the same one-sample guards as recorded passes. */
export function pasteCurveRange(points:GainPoint[],fallback:number,envelope:CurveEnvelope,start:number,length:number,rate:number,maximum:number,canvas:number):GainPoint[]{
 validate(points,maximum);validate(envelope.points,maximum);
 if(!Number.isFinite(envelope.duration)||envelope.duration<=0||!envelope.points.length||envelope.points.some(p=>p.time>envelope.duration)||!Number.isFinite(start)||start<0||!Number.isFinite(length)||length<=0||!Number.isFinite(start+length))fail();
 const source=copyCurveRange(envelope.points,fallback,0,envelope.duration,maximum);
 const span=source.points.map(p=>({...p,time:start+p.time/envelope.duration*length}));
 const result=recordedEnvelope(points,[{points:span}],{rate,duration:canvas,minimum:0,maximum,fallback});
 validate(result,maximum);return result;
}
