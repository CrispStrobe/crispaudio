import type {AudioSegment,AudioSource,TimelineProject,TimelineTrack} from '../types/audio';
import {captureMix,validMixVersion} from './mixVersions';

export const FREEZE_FIELDS=['segments','effects','nativeEffects','automation','fadeInDuration','fadeOutDuration','fadeInCurve','fadeOutCurve'] as const;
export type FrozenTrackOriginal=Pick<TimelineTrack,typeof FREEZE_FIELDS[number]>;
export interface TrackFreeze {version:1;sourceId:string;frames:number;sampleRate:number;tail:number;original:FrozenTrackOriginal}
const pickOriginal=(track:TimelineTrack):FrozenTrackOriginal=>Object.fromEntries(FREEZE_FIELDS.map(key=>[key,structuredClone(track[key])])) as FrozenTrackOriginal;
export function thawTrack(track:TimelineTrack):TimelineTrack {
 if(!track.freeze)throw new Error('freeze.changed');
 return {...track,...structuredClone(track.freeze.original),freeze:undefined,locked:false};
}
export function retainedFreezeProject(project:TimelineProject):TimelineProject {return {...project,tracks:project.tracks.map(t=>t.freeze?thawTrack(t):t)};}
/** Frozen content is immutable; only these monitor/mix-independent fields remain live. */
export function frozenTrackChangeAllowed(before:TimelineTrack,after:TimelineTrack|undefined):boolean {
 if(!after)return false;
 if(!after.freeze)return JSON.stringify(after)===JSON.stringify(thawTrack(before));
 const live=['name','muted','solo','volume','pan','waveformMode'] as const;
 const expected={...before};for(const key of live)Object.assign(expected,{[key]:after[key]});
 return JSON.stringify(expected)===JSON.stringify(after);
}
export function prepareTrackFreeze(project:TimelineProject,trackId:string,sources:Map<string,AudioSource>,tail:number){
 const track=project.tracks.find(t=>t.id===trackId);
 if(!track||track.freeze||track.locked||track.recordArmed||track.kind==='bus'||track.ducking||!track.segments.length||track.segments.some(c=>c.linkGroup||c.editGroup))throw new Error('freeze.unsupported');
 if(!Number.isFinite(tail)||tail<0||tail>30)throw new Error('freeze.tailInvalid');
 const rate=project.sampleRate,end=Math.max(...track.segments.map(c=>c.startTime+c.duration));
 const frames=Math.ceil((end+tail)*rate);
 if(!Number.isFinite(rate)||rate<8000||rate>192000||!Number.isSafeInteger(frames)||frames<=0||frames>rate*600||frames*8>256*1024*1024)throw new Error('freeze.budget');
 for(const clip of track.segments){const source=sources.get(clip.sourceId);if(!source||!Number.isFinite(clip.startTime)||clip.startTime<0||!Number.isFinite(clip.duration)||clip.duration<=0||!Number.isFinite(clip.sourceOffset)||clip.sourceOffset<0||Math.round((clip.sourceOffset+clip.duration)*source.sampleRate)>source.buffer.length)throw new Error('freeze.missing');}
 // Render before fader/pan/routing. Track gain automation is upstream of inserts.
 const renderedTrack={...structuredClone(track),muted:false,solo:false,volume:1,pan:0,panAutomation:undefined,output:undefined,sends:[],ducking:undefined};
 const renderProject:TimelineProject={...structuredClone(project),tracks:[renderedTrack],masterEffects:[],nativeEffects:[],masterVolume:1,outputLimiter:undefined,duration:frames/rate,minimumDuration:frames/rate,video:undefined};
 return {track,renderProject,frames};
}
export function freezeTrack(project:TimelineProject,trackId:string,source:AudioSource,tail:number):TimelineProject {
 const track=project.tracks.find(t=>t.id===trackId);if(!track||track.freeze||track.locked)throw new Error('freeze.changed');
 const segment:AudioSegment={id:crypto.randomUUID(),trackId,sourceId:source.id,startTime:0,duration:source.buffer.length/project.sampleRate,sourceOffset:0,fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear',effects:[],gain:1,color:track.segments[0]?.color??'#38bdf8',name:track.name};
 const next:TimelineTrack={...track,locked:true,recordArmed:false,segments:[segment],effects:[],nativeEffects:[],automation:undefined,fadeInDuration:0,fadeOutDuration:0,fadeInCurve:undefined,fadeOutCurve:undefined,freeze:{version:1,sourceId:source.id,frames:source.buffer.length,sampleRate:project.sampleRate,tail,original:pickOriginal(track)}};
 return {...project,tracks:project.tracks.map(t=>t.id===trackId?next:t),duration:Math.max(project.duration,segment.duration)};
}
/** Structural validation plus original mix metadata. Source/retime/take validators run on both views at load. */
export function validTrackFreezes(project:TimelineProject,sourceIds:Set<string>):boolean {
 try{return project.tracks.every(track=>{
  const f=track.freeze;if(f===undefined)return true;
  if(!f||!Number.isFinite(f.sampleRate)||f.sampleRate<8000||f.sampleRate>192000||Object.keys(f).some(k=>!['version','sourceId','frames','sampleRate','tail','original'].includes(k))||f.version!==1||typeof f.sourceId!=='string'||!sourceIds.has(f.sourceId)||!Number.isSafeInteger(f.frames)||f.frames<=0||f.sampleRate!==project.sampleRate||f.frames>f.sampleRate*600||f.frames*8>256*1024*1024||!Number.isFinite(f.tail)||f.tail<0||f.tail>30||!f.original||Object.keys(f.original).some(k=>!FREEZE_FIELDS.includes(k as typeof FREEZE_FIELDS[number]))||!Array.isArray(f.original.segments)||!f.original.segments.length||f.original.segments.length>10000)return false;
  if(track.kind==='bus'||track.locked!==true||track.recordArmed||track.ducking||track.segments.length!==1||track.effects?.length||track.nativeEffects?.length||track.automation?.length||track.fadeInDuration||track.fadeOutDuration)return false;
  const clip=track.segments[0];
  if(clip.sourceId!==f.sourceId||clip.trackId!==track.id||clip.startTime!==0||clip.sourceOffset!==0||clip.duration!==f.frames/f.sampleRate||clip.gain!==1||clip.effects.length||clip.nativeEffects?.length||clip.fadeInDuration||clip.fadeOutDuration||clip.retime||clip.sourceEdit||clip.midi||clip.linkGroup||clip.editGroup)return false;
  const original=thawTrack(track);
  if(Math.abs(f.frames-Math.ceil((Math.max(...original.segments.map(c=>c.startTime+c.duration))+f.tail)*f.sampleRate))>1)return false;
  if(!validMixVersion(captureMix({...project,tracks:[original],masterEffects:[],nativeEffects:[]})))return false;
  return original.segments.every(c=>c&&c.trackId===track.id&&typeof c.id==='string'&&!!c.id&&sourceIds.has(c.sourceId)&&Number.isFinite(c.startTime)&&c.startTime>=0&&Number.isFinite(c.duration)&&c.duration>0&&Number.isFinite(c.sourceOffset)&&c.sourceOffset>=0&&!c.linkGroup&&!c.editGroup)&&new Set(original.segments.map(c=>c.id)).size===original.segments.length;
 });}catch{return false;}
}
