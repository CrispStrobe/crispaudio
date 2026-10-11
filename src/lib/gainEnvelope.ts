import type {GainPoint,TimelineProject} from '../types/audio';
import {gainAt,normalizeGainPoints,panAt,normalizePanPoints} from './mixAutomation';
import {timelineDuration} from './timelineView';

/** Portable, source-independent automation on a relative clock. */
export interface GainEnvelope {parameter?:'gain'|'pan';duration:number;points:GainPoint[];sourceName?:string;sourceStart?:number}
const fail=(key:string):never=>{throw new Error(`automation.${key}`);};
function validPoints(points:GainPoint[],pan=false) {
  if(!Array.isArray(points)||points.some(p=>!p||!Number.isFinite(p.time)||!Number.isFinite(p.value)||p.time<0||(pan?(p.value< -1||p.value>1):p.value<0)))fail('invalidEnvelope');
}
function copyEnvelope(project:TimelineProject,trackId:string,start=0,end=timelineDuration(project),pan=false):GainEnvelope {
  const track=project.tracks.find(t=>t.id===trackId)??fail('missingTrack');
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>timelineDuration(project))fail('bounds');
  const field=pan?'panAutomation':'automation',normalize=pan?normalizePanPoints:normalizeGainPoints;
  const at=(points:GainPoint[],time:number)=>pan?panAt(points,time,track.pan):gainAt(points,time);
  validPoints(track[field]??[],pan);
  const points=normalize(track[field]);
  return {...(pan?{parameter:'pan' as const}:{}),sourceName:track.name,sourceStart:start,duration:end-start,points:[
    {time:0,value:at(points,start)},
    ...points.filter(p=>p.time>start&&p.time<end).map(p=>({...p,time:p.time-start})),
    {time:end-start,value:at(points,end)},
  ]};
}
/** Replace one bounded interval. One-sample guards preserve the old envelope
 * outside it; only time is stretched, and the interpolation remains linear in parameter values. */
function pasteEnvelope(project:TimelineProject,trackId:string,envelope:GainEnvelope,time:number,duration=envelope.duration,pan=false):TimelineProject {
  const track=project.tracks.find(t=>t.id===trackId)??fail('missingTrack');
  if((envelope.parameter??'gain')!==(pan?'pan':'gain'))fail('parameterMismatch');
  const field=pan?'panAutomation':'automation',normalize=pan?normalizePanPoints:normalizeGainPoints;
  const at=(points:GainPoint[],time:number,fallback=track.pan)=>pan?panAt(points,time,fallback):gainAt(points,time);
  if(track.locked)fail('lockedEnvelope');
  if(!Number.isFinite(envelope.duration)||envelope.duration<=0)fail('invalidEnvelope');
  const rate=project.sampleRate,canvas=timelineDuration(project),end=time+duration;
  if(!Number.isFinite(rate)||rate<=0||!Number.isFinite(time)||!Number.isFinite(duration)||time<0||duration<1/rate||end>canvas||!Number.isFinite(end))fail('bounds');
  validPoints(envelope.points,pan);validPoints(track[field]??[],pan);
  if(envelope.points.some(p=>p.time>envelope.duration))fail('invalidEnvelope');
  const source=normalize(envelope.points),before=normalize(track[field]);
  const left=Math.max(0,time-1/rate),right=Math.min(canvas,end+1/rate);
  const points=normalize([
    ...before.filter(p=>p.time<left||p.time>right),
    ...(time>0?[{time:left,value:at(before,left)}]:[]),
    {time,value:at(source,0,0)},
    ...source.filter(p=>p.time>0&&p.time<envelope.duration).map(p=>({...p,time:time+p.time/envelope.duration*duration})),
    {time:end,value:at(source,envelope.duration,0)},
    ...(end<canvas?[{time:right,value:at(before,right)}]:[]),
  ]);
  // Identity pastes and constant envelopes must not create undo or destroy redo.
  if([...before,...points].every(p=>{
    const a=at(before,p.time),b=at(points,p.time);
    return Math.abs(a-b)<=1e-12*Math.max(1,Math.abs(a),Math.abs(b));
  }))return project;
  return {...project,tracks:project.tracks.map(t=>t.id===trackId?{...t,[field]:points}:t)};
}

export function copyGainEnvelope(project:TimelineProject,trackId:string,start=0,end=timelineDuration(project)):GainEnvelope {return copyEnvelope(project,trackId,start,end);}
export function copyPanEnvelope(project:TimelineProject,trackId:string,start=0,end=timelineDuration(project)):GainEnvelope {return copyEnvelope(project,trackId,start,end,true);}
export function pasteGainEnvelope(project:TimelineProject,trackId:string,envelope:GainEnvelope,time:number,duration=envelope.duration):TimelineProject {return pasteEnvelope(project,trackId,envelope,time,duration);}
export function pastePanEnvelope(project:TimelineProject,trackId:string,envelope:GainEnvelope,time:number,duration=envelope.duration):TimelineProject {return pasteEnvelope(project,trackId,envelope,time,duration,true);}
