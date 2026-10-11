import type {GainPoint,TimelineProject} from '../types/audio';
import {gainAt,normalizeGainPoints} from './mixAutomation';
import {timelineDuration} from './timelineView';

/** Portable, source-independent automation on a relative clock. */
export interface GainEnvelope {duration:number;points:GainPoint[];sourceName?:string;sourceStart?:number}
const fail=(key:string):never=>{throw new Error(`automation.${key}`);};
function validPoints(points:GainPoint[]) {
  if(!Array.isArray(points)||points.some(p=>!p||!Number.isFinite(p.time)||!Number.isFinite(p.value)||p.time<0||p.value<0))fail('invalidEnvelope');
}
export function copyGainEnvelope(project:TimelineProject,trackId:string,start=0,end=timelineDuration(project)):GainEnvelope {
  const track=project.tracks.find(t=>t.id===trackId)??fail('missingTrack');
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>timelineDuration(project))fail('bounds');
  validPoints(track.automation??[]);
  const points=normalizeGainPoints(track.automation);
  return {sourceName:track.name,sourceStart:start,duration:end-start,points:[
    {time:0,value:gainAt(points,start)},
    ...points.filter(p=>p.time>start&&p.time<end).map(p=>({...p,time:p.time-start})),
    {time:end-start,value:gainAt(points,end)},
  ]};
}
/** Replace one bounded interval. One-sample guards preserve the old envelope
 * outside it; only time is stretched, and the interpolation remains linear gain. */
export function pasteGainEnvelope(project:TimelineProject,trackId:string,envelope:GainEnvelope,time:number,duration=envelope.duration):TimelineProject {
  const track=project.tracks.find(t=>t.id===trackId)??fail('missingTrack');
  if(track.locked)fail('lockedEnvelope');
  if(!Number.isFinite(envelope.duration)||envelope.duration<=0)fail('invalidEnvelope');
  const rate=project.sampleRate,canvas=timelineDuration(project),end=time+duration;
  if(!Number.isFinite(rate)||rate<=0||!Number.isFinite(time)||!Number.isFinite(duration)||time<0||duration<1/rate||end>canvas||!Number.isFinite(end))fail('bounds');
  validPoints(envelope.points);validPoints(track.automation??[]);
  if(envelope.points.some(p=>p.time>envelope.duration))fail('invalidEnvelope');
  const source=normalizeGainPoints(envelope.points),before=normalizeGainPoints(track.automation);
  const left=Math.max(0,time-1/rate),right=Math.min(canvas,end+1/rate);
  const points=normalizeGainPoints([
    ...before.filter(p=>p.time<left||p.time>right),
    ...(time>0?[{time:left,value:gainAt(before,left)}]:[]),
    {time,value:gainAt(source,0)},
    ...source.filter(p=>p.time>0&&p.time<envelope.duration).map(p=>({...p,time:time+p.time/envelope.duration*duration})),
    {time:end,value:gainAt(source,envelope.duration)},
    ...(end<canvas?[{time:right,value:gainAt(before,right)}]:[]),
  ]);
  // Identity pastes and constant envelopes must not create undo or destroy redo.
  if([...before,...points].every(p=>{
    const a=gainAt(before,p.time),b=gainAt(points,p.time);
    return Math.abs(a-b)<=1e-12*Math.max(1,a,b);
  }))return project;
  return {...project,tracks:project.tracks.map(t=>t.id===trackId?{...t,automation:points}:t)};
}
