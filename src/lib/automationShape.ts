import type {TimelineProject} from '../types/audio';
import {targetPoints,type AutomationTarget} from './automationRecording';
import {delayParameterMaximum} from './effectAutomation';
import {normalizeGainPoints,normalizePanPoints,gainAt,panAt,validAutomationCurve,automationCheckTimes} from './mixAutomation';
import {timelineDuration} from './timelineView';
export type AutomationShape='linear'|'ease-in'|'ease-out'|'s-curve'|'custom';
export const automationShapes:AutomationShape[]=['linear','ease-in','ease-out','s-curve','custom'];
export interface AutomationShapeControls {x1:number;y1:number;x2:number;y2:number}
export const defaultShapeControls:AutomationShapeControls={x1:.25,y1:0,x2:.75,y2:1};
export function validShapeControls(c:AutomationShapeControls|undefined):c is AutomationShapeControls {
 return !!c&&['x1','y1','x2','y2'].every(key=>Number.isFinite(c[key as keyof AutomationShapeControls])&&c[key as keyof AutomationShapeControls]>=0&&c[key as keyof AutomationShapeControls]<=1)&&c.x1<=c.x2;
}
const cubic=(p:number,a:number,b:number)=>3*(1-p)*(1-p)*p*a+3*(1-p)*p*p*b+p*p*p;
/** Invert the monotone time axis, then evaluate value progress. Fixed bisection
 * keeps GUI/native generation deterministic, including vertical end handles. */
export function customShapeProgress(x:number,c:AutomationShapeControls):number {
 if(x===0||x===1)return x;
 let lo=0,hi=1;
 for(let i=0;i<48;i++){const mid=(lo+hi)/2;if(cubic(mid,c.x1,c.x2)<x)lo=mid;else hi=mid;}
 return cubic((lo+hi)/2,c.y1,c.y2);
}
const fail=(key:string):never=>{throw new Error(`automation.${key}`);};
export function shapeProgress(p:number,shape:AutomationShape):number {
 return shape==='ease-in'?p*p:shape==='ease-out'?p*(2-p):shape==='s-curve'?p*p*(3-2*p):p;
}
/** Bake one adjacent segment into at most sixteen linear intervals. The points
 * remain ordinary, editable automation; outside segments retain their metadata. */
export function shapeAutomationSegment(project:TimelineProject,target:AutomationTarget,pointTime:number,shape:AutomationShape,controls?:AutomationShapeControls):TimelineProject {
 if(!automationShapes.includes(shape))fail('invalidShape');
 if(shape==='custom'&&!validShapeControls(controls))fail('invalidShapeControls');
 const track=project.tracks.find(t=>t.id===target.trackId)??fail('missingTrack');if(track.locked)fail('lockedEnvelope');
 const before=targetPoints(project,target)??[],pan=target.parameter==='pan',minimum=pan?-1:0,maximum=target.parameter==='pan'?1:target.parameter==='gain'?Infinity:delayParameterMaximum(target.parameter);
 if(!Array.isArray(before)||before.some(p=>!p||!validAutomationCurve(p)||!Number.isFinite(p.time)||p.time<0||!Number.isFinite(p.value)||p.value<minimum||p.value>maximum))fail('invalidEnvelope');
 const normalize=pan?normalizePanPoints:normalizeGainPoints,original=normalize(before),index=original.findIndex(p=>p.time===pointTime),a=original[index],b=original[index+1],rate=project.sampleRate;
 if(!Number.isFinite(pointTime)||!Number.isFinite(rate)||rate<=0||!a||!b||b.time>timelineDuration(project)||b.time-a.time<2/rate-1e-12)fail('shapeBounds');
 const intervals=shape==='linear'?1:Math.min(16,Math.max(2,Math.floor((b.time-a.time)*rate+1e-9)));
 if(original.length+intervals-1>100000)fail('recordLimit');
 const first={...a};delete first.curve;
 const generated=[first,...Array.from({length:intervals-1},(_,j)=>{const i=j+1;return {time:a.time+(b.time-a.time)*i/intervals,value:a.value+(b.value-a.value)*(shape==='custom'?customShapeProgress(i/intervals,controls!):shapeProgress(i/intervals,shape))};})];
 const points=[...original.slice(0,index),...generated,...original.slice(index+1)];
 const at=pan?panAt:gainAt;
 const oldSegment=[a,b],newSegment=[...generated,b];
 if(automationCheckTimes(oldSegment,newSegment).every(t=>Math.abs(at(oldSegment,t)-at(newSegment,t))<=1e-12*Math.max(1,Math.abs(at(oldSegment,t)),Math.abs(at(newSegment,t)))))return project;
 return {...project,tracks:project.tracks.map(t=>t.id!==target.trackId?t:target.parameter==='gain'?{...t,automation:points}:pan?{...t,panAutomation:points}:{...t,effects:t.effects!.map((e,i)=>i!==target.effectIndex?e:{...e,automation:{...e.automation,[target.parameter]:points}})})};
}
