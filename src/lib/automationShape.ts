import type {TimelineProject} from '../types/audio';
import {targetPoints,type AutomationTarget} from './automationRecording';
import {delayParameterMaximum} from './effectAutomation';
import {shapeEnvelopeSegment} from './shapeEnvelope';
import {timelineDuration} from './timelineView';
import {automationShapes,validShapeControls,type AutomationShape,type AutomationShapeControls} from './automationShapeMetadata';
export {automationShapes,defaultShapeControls,validShapeControls,customShapeProgress,shapeProgress,reviewedShapeSegment} from './automationShapeMetadata';
export type {AutomationShape,AutomationShapeControls} from './automationShapeMetadata';
const fail=(key:string):never=>{throw new Error(`automation.${key}`);};
/** Bake one adjacent segment into at most sixteen linear intervals. The points
 * remain ordinary, editable automation; outside segments retain their metadata. */
export function shapeAutomationSegment(project:TimelineProject,target:AutomationTarget,pointTime:number,shape:AutomationShape,controls?:AutomationShapeControls):TimelineProject {
 if(!automationShapes.includes(shape))fail('invalidShape');
 if(shape==='custom'&&!validShapeControls(controls))fail('invalidShapeControls');
 const track=project.tracks.find(t=>t.id===target.trackId)??fail('missingTrack');if(track.locked)fail('lockedEnvelope');
 const before=targetPoints(project,target)??[],points=shapeEnvelopeSegment(before,pointTime,shape,{rate:project.sampleRate,minimum:target.parameter==='pan'?-1:0,maximum:target.parameter==='pan'?1:target.parameter==='gain'?Infinity:delayParameterMaximum(target.parameter),endTime:timelineDuration(project)},controls);
 if(points===before)return project;
 const pan=target.parameter==='pan';
 return {...project,tracks:project.tracks.map(t=>t.id!==target.trackId?t:target.parameter==='gain'?{...t,automation:points}:pan?{...t,panAutomation:points}:{...t,effects:t.effects!.map((e,i)=>i!==target.effectIndex?e:{...e,automation:{...e.automation,[target.parameter]:points}})})};
}
