import type {TimelineProject} from '../types/audio';
import {targetPoints,type AutomationTarget} from './automationRecording';
import {delayParameterMaximum} from './effectAutomation';
import {normalizeGainPoints,normalizePanPoints,gainAt,panAt,validAutomationCurve,automationCheckTimes} from './mixAutomation';
import {timelineDuration} from './timelineView';
export type AutomationShape='linear'|'ease-in'|'ease-out'|'s-curve';
export const automationShapes:AutomationShape[]=['linear','ease-in','ease-out','s-curve'];
const fail=(key:string):never=>{throw new Error(`automation.${key}`);};
export function shapeProgress(p:number,shape:AutomationShape):number {
 return shape==='ease-in'?p*p:shape==='ease-out'?p*(2-p):shape==='s-curve'?p*p*(3-2*p):p;
}
/** Bake one adjacent segment into at most sixteen linear intervals. The points
 * remain ordinary, editable automation; outside segments retain their metadata. */
export function shapeAutomationSegment(project:TimelineProject,target:AutomationTarget,pointTime:number,shape:AutomationShape):TimelineProject {
 if(!automationShapes.includes(shape))fail('invalidShape');
 const track=project.tracks.find(t=>t.id===target.trackId)??fail('missingTrack');if(track.locked)fail('lockedEnvelope');
 const before=targetPoints(project,target)??[],pan=target.parameter==='pan',minimum=pan?-1:0,maximum=target.parameter==='pan'?1:target.parameter==='gain'?Infinity:delayParameterMaximum(target.parameter);
 if(!Array.isArray(before)||before.some(p=>!p||!validAutomationCurve(p)||!Number.isFinite(p.time)||p.time<0||!Number.isFinite(p.value)||p.value<minimum||p.value>maximum))fail('invalidEnvelope');
 const normalize=pan?normalizePanPoints:normalizeGainPoints,original=normalize(before),index=original.findIndex(p=>p.time===pointTime),a=original[index],b=original[index+1],rate=project.sampleRate;
 if(!Number.isFinite(pointTime)||!Number.isFinite(rate)||rate<=0||!a||!b||b.time>timelineDuration(project)||b.time-a.time<2/rate-1e-12)fail('shapeBounds');
 const intervals=shape==='linear'?1:Math.min(16,Math.max(2,Math.floor((b.time-a.time)*rate+1e-9)));
 if(original.length+intervals-1>100000)fail('recordLimit');
 const first={...a};delete first.curve;
 const generated=[first,...Array.from({length:intervals-1},(_,j)=>{const i=j+1;return {time:a.time+(b.time-a.time)*i/intervals,value:a.value+(b.value-a.value)*shapeProgress(i/intervals,shape)};})];
 const points=[...original.slice(0,index),...generated,...original.slice(index+1)];
 const at=pan?panAt:gainAt;
 const oldSegment=[a,b],newSegment=[...generated,b];
 if(automationCheckTimes(oldSegment,newSegment).every(t=>Math.abs(at(oldSegment,t)-at(newSegment,t))<=1e-12*Math.max(1,Math.abs(at(oldSegment,t)),Math.abs(at(newSegment,t)))))return project;
 return {...project,tracks:project.tracks.map(t=>t.id!==target.trackId?t:target.parameter==='gain'?{...t,automation:points}:pan?{...t,panAutomation:points}:{...t,effects:t.effects!.map((e,i)=>i!==target.effectIndex?e:{...e,automation:{...e.automation,[target.parameter]:points}})})};
}
