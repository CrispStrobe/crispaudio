import type {AudioSource,RecordingInput,RecordingTake,TimelineProject} from '../types/audio';
import {chooseTake} from './recordingTakes';
export const defaultRecordingInput:RecordingInput={deviceId:'',channel:'mono',monitor:false,countIn:0,latencyMs:0};
/** Prefer explicit setup, then an armed/selected track. Locked targets stay protected. */
export function quickRecordingTrack(project:TimelineProject,preferred:string,selected?:string){
 const configured=project.tracks.find(t=>t.id===preferred&&t.kind!=='bus');
 if(configured?.locked)throw new Error('recording.locked');
 return configured??project.tracks.find(t=>t.kind!=='bus'&&t.recordArmed&&!t.locked)??project.tracks.find(t=>t.id===selected&&t.kind!=='bus'&&!t.locked)??project.tracks.find(t=>t.kind!=='bus'&&!t.locked);
}
export function recordingTargets(project:TimelineProject,selectedId:string,allArmed:boolean){
 const tracks=allArmed?project.tracks.filter(t=>t.kind!=='bus'&&t.recordArmed):project.tracks.filter(t=>t.id===selectedId);
 if(!tracks.length||tracks.length>8)throw new Error('recording.groupCount');
 if(tracks.some(t=>t.kind==='bus'||t.locked||!t.recordArmed))throw new Error('recording.locked');
 if(tracks.reduce((count,t)=>count+(t.recordingInput?.monitor&&t.recordingInput.monitorFx?t.nativeEffects?.filter(e=>e.enabled).length??0:0),0)>8)throw new Error('recording.cueInvalid');
 return tracks.map(t=>({trackId:t.id,input:{...(t.recordingInput??defaultRecordingInput)}}));
}
export interface PreparedRecording {trackId:string;source:AudioSource;takes:RecordingTake[]}
/** Every stream is prepared before publication; failures cannot leave half a group. */
export function publishRecordingGroup(snapshot:TimelineProject,current:TimelineProject,existing:Map<string,AudioSource>,prepared:PreparedRecording[],crossfade:number,window?:{start:number;end:number}){
 if(snapshot!==current)throw new Error('recording.projectChanged');
 if(!prepared.length||prepared.length>8||new Set(prepared.map(p=>p.trackId)).size!==prepared.length||new Set(prepared.map(p=>p.source.id)).size!==prepared.length)throw new Error('recording.groupCount');
 const sources=new Map(existing);let project=current;
 for(const item of prepared){
  const track=project.tracks.find(t=>t.id===item.trackId);
  if(!track||track.locked||track.kind==='bus'||!track.recordArmed)throw new Error('recording.locked');
  if(!item.takes.length||existing.has(item.source.id)||item.takes.some(t=>t.sourceId!==item.source.id)||new Set(item.takes.map(t=>t.id)).size!==item.takes.length||item.takes.some(t=>track.takes?.some(old=>old.id===t.id)))throw new Error('recording.empty');
  sources.set(item.source.id,item.source);
  project={...project,tracks:project.tracks.map(t=>t.id===track.id?{...t,takes:[...(t.takes??[]),...item.takes]}:t)};
  const chosen=window?[...item.takes].reverse().find(t=>t.duration>=window.end-window.start-.05)??item.takes.at(-1)!:item.takes.at(-1)!;
  project=chooseTake(project,item.trackId,chosen.id,chosen.startTime,chosen.startTime+chosen.duration,crossfade,sources);
 }
 return {project,sources};
}
