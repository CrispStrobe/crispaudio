import {invoke} from '@tauri-apps/api/core';
import {encodeSourceBufferWav} from '../../lib/wavExport';
import {computeWaveformPeaks} from '../utils/audioBufferUtils';
import type {AudioSegment,AudioSource,TimelineProject,TimelineTrack} from '../../types/audio';

interface State {project:TimelineProject;sources:Map<string,AudioSource>;isPlaying:boolean}
interface Input {snapshot:State;clipId:string;stems:{name:string;channels:Float32Array[]}[];trackName:(stem:string)=>string;sourceName:(stem:string)=>string}
/** Conversion transactions accept at most eight files / 256 MiB. */
const MAX_FILES=8,MAX_BYTES=256*1024*1024;

/** Publish separated stems as new tracks below the clip's track in one Undo step.
 * Stems join the clip's named edit group so they move together; the original
 * clip is kept. Its track is muted only when that clip is its only content.
 * Ownership follows commitSourceEdit: never remove files once publication starts. */
export async function commitStemTracks(input:Input,current:()=>State,publish:(next:State)=>void,signal:AbortSignal):Promise<{mutedOriginal:boolean}>{
 const {snapshot,clipId,stems}=input;
 const track=snapshot.project.tracks.find(t=>t.segments.some(c=>c.id===clipId));
 const clip=track?.segments.find(c=>c.id===clipId),source=clip&&snapshot.sources.get(clip.sourceId);
 if(!track||!clip||!source||track.locked||track.freeze)throw new Error('sourceEditor.changed');
 const check=()=>{signal.throwIfAborted();const next=current();if(next.project!==snapshot.project||next.sources!==snapshot.sources||next.isPlaying)throw new Error('sourceEditor.changed');};
 const frames=Math.min(source.buffer.length-Math.round(clip.sourceOffset*source.sampleRate),Math.round(clip.duration*source.sampleRate));
 if(!stems.length||stems.length>MAX_FILES||frames<=0)throw new Error('crisp.invalidResult');
 for(const stem of stems)if(!stem.channels.length||stem.channels.length>2||stem.channels.some(c=>c.length!==frames||c.some(v=>!Number.isFinite(v))))throw new Error('sourceEditor.invalidPcm');
 if(stems.reduce((n,s)=>n+s.channels.length*frames*4,0)>MAX_BYTES)throw new Error('crisp.tooLarge');
 let token:string|undefined,publicationStarted=false;
 try{
  check();
  const created:{stem:string;source:AudioSource}[]=[];
  for(const stem of stems){
   const buffer=new AudioBuffer({length:frames,numberOfChannels:stem.channels.length,sampleRate:source.sampleRate});
   stem.channels.forEach((pcm,ch)=>buffer.copyToChannel(pcm as Float32Array<ArrayBuffer>,ch));
   let filePath:string|undefined;
   if('__TAURI_INTERNALS__' in window){
    const wav=await encodeSourceBufferWav(buffer,signal);check();
    if(!token){token=crypto.randomUUID();await invoke('recording_conversion_begin',{token});check();}
    filePath=await invoke<string>('recording_conversion_write',new Uint8Array(await wav.arrayBuffer()),{headers:{'x-conversion-token':token}});check();
    if(typeof filePath!=='string'||!filePath)throw new Error('sourceEditor.invalidPcm');
   }
   created.push({stem:stem.name,source:{id:crypto.randomUUID(),name:input.sourceName(stem.name),buffer,filePath,peaks:computeWaveformPeaks(buffer.getChannelData(0),Math.min(8000,Math.ceil(buffer.duration*200))),duration:buffer.duration,sampleRate:source.sampleRate,channels:buffer.numberOfChannels,provenance:source.filePath?{path:source.filePath,offset:clip.sourceOffset,rate:1}:source.provenance}});
  }
  const group=clip.editGroup??{id:crypto.randomUUID(),name:clip.name};
  const mutedOriginal=track.segments.length===1;
  const tracks:TimelineTrack[]=created.map(({stem,source:derived})=>{
   const id=crypto.randomUUID();
   const segment:AudioSegment={id:crypto.randomUUID(),trackId:id,sourceId:derived.id,startTime:clip.startTime,duration:clip.duration,sourceOffset:0,fadeInDuration:clip.fadeInDuration,fadeOutDuration:clip.fadeOutDuration,fadeInCurve:clip.fadeInCurve,fadeOutCurve:clip.fadeOutCurve,effects:structuredClone(clip.effects),gain:clip.gain,color:clip.color,name:`${clip.name} (${stem})`,editGroup:group};
   return {id,name:input.trackName(stem),segments:[segment],muted:false,solo:false,volume:track.volume,pan:track.pan};
  });
  const sources=new Map(snapshot.sources);for(const {source:derived} of created)sources.set(derived.id,derived);
  const index=snapshot.project.tracks.indexOf(track);
  const original:TimelineTrack={...track,muted:mutedOriginal||track.muted,segments:track.segments.map(c=>c.id===clipId?{...c,editGroup:group}:c)};
  const project={...snapshot.project,tracks:[...snapshot.project.tracks.slice(0,index),original,...tracks,...snapshot.project.tracks.slice(index+1)]};
  if(token){check();await invoke('recording_conversion_protect',{token});}
  check();publicationStarted=true;publish({project,sources,isPlaying:false});
  return {mutedOriginal};
 }finally{
  if(token)try{await invoke('recording_conversion_finish',{token,keep:publicationStarted});}catch(error){console.warn('Stem conversion finalization deferred',error);}
 }
}
