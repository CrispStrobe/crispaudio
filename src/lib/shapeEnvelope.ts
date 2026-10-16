import type {GainPoint} from '../types/audio';
import {normalizeGainPoints,normalizePanPoints,gainAt,panAt,validAutomationCurve,automationCheckTimes} from './mixAutomation';
import {automationShapes,validShapeControls,customShapeProgress,shapeProgress,reviewedShapeSegment,type AutomationShape,type AutomationShapeControls} from './automationShapeMetadata';
const fail=(key:string):never=>{throw new Error(`automation.${key}`);};
/** Bake a raw or normalized envelope segment without changing other points. */
export function shapeEnvelopeSegment(before:GainPoint[],pointTime:number,shape:AutomationShape,{rate,minimum,maximum,endTime}:{rate:number;minimum:number;maximum:number;endTime:number},controls?:AutomationShapeControls):GainPoint[]{
 if(!automationShapes.includes(shape))fail('invalidShape');
 if(shape==='custom'&&!validShapeControls(controls))fail('invalidShapeControls');
 if(!Number.isFinite(minimum)||Number.isNaN(maximum)||maximum<minimum||!Number.isFinite(endTime)||endTime<0)fail('invalidEnvelope');
 const pan=minimum<0;
 if(!Array.isArray(before)||before.some(p=>!p||!validAutomationCurve(p)||!Number.isFinite(p.time)||p.time<0||!Number.isFinite(p.value)||p.value<minimum||p.value>maximum))fail('invalidEnvelope');
 const normalize=pan?normalizePanPoints:normalizeGainPoints,original=normalize(before),index=original.findIndex(p=>p.time===pointTime),a=original[index],endIndex=reviewedShapeSegment(original,index)?.endIndex??index+1,b=original[endIndex];
 if(!Number.isFinite(pointTime)||!Number.isFinite(rate)||rate<=0||!a||!b||b.time>endTime||b.time-a.time<2/rate-1e-12)fail('shapeBounds');
 const intervals=shape==='linear'?1:Math.min(16,Math.max(2,Math.floor((b.time-a.time)*rate+1e-9)));
 if(original.length+intervals-(endIndex-index)>100000)fail('recordLimit');
 const first={...a};delete first.curve;delete first.shapeReview;if(shape!=='linear')first.shapeReview={shape,intervals,...(shape==='custom'?{controls:{...controls!}}:{})};
 const generated=[first,...Array.from({length:intervals-1},(_,j)=>{const i=j+1;return {time:a.time+(b.time-a.time)*i/intervals,value:a.value+(b.value-a.value)*(shape==='custom'?customShapeProgress(i/intervals,controls!):shapeProgress(i/intervals,shape))};})];
 const points=[...original.slice(0,index),...generated,...original.slice(endIndex)];
 const at=pan?panAt:gainAt;
 const oldSegment=original.slice(index,endIndex+1),newSegment=[...generated,b];
 if(automationCheckTimes(oldSegment,newSegment).every(t=>Math.abs(at(oldSegment,t)-at(newSegment,t))<=1e-12*Math.max(1,Math.abs(at(oldSegment,t)),Math.abs(at(newSegment,t)))))return before;
 return points;
}
