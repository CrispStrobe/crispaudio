import {invoke} from '@tauri-apps/api/core';
import {encodeSourceBufferWav} from '../../lib/wavExport';
import {computeWaveformPeaks} from '../utils/audioBufferUtils';
import {appendSourceEdit} from '../../lib/sourceEditJournal';
import type {AudioSource,TimelineProject,SourceEditOperation} from '../../types/audio';

interface State {project:TimelineProject;sources:Map<string,AudioSource>;isPlaying:boolean}
interface Input {snapshot:State;clipId:string;pcm:Float32Array[];operation:SourceEditOperation;name:string}
/** Own the derived file until one synchronous project/Undo publication. Never
 * remove a file after publication starts: a store subscriber can throw afterward. */
export async function commitSourceEdit(input:Input,current:()=>State,publish:(next:State)=>void,signal:AbortSignal){
 const {snapshot,clipId,pcm,name}=input;
 const track=snapshot.project.tracks.find(t=>t.segments.some(c=>c.id===clipId));
 const clip=track?.segments.find(c=>c.id===clipId),source=clip&&snapshot.sources.get(clip.sourceId);
 if(!clip||!source||track?.locked||track?.freeze)throw new Error('sourceEditor.changed');
 const check=()=>{signal.throwIfAborted();const next=current();if(next.project!==snapshot.project||next.sources!==snapshot.sources||next.isPlaying)throw new Error('sourceEditor.changed');};
 const start=Math.round(clip.sourceOffset*source.sampleRate),frames=Math.min(source.buffer.length-start,Math.round(clip.duration*source.sampleRate));
 if(start<0||frames<=0||source.sampleRate!==source.buffer.sampleRate||pcm.length!==source.buffer.numberOfChannels||pcm.some(c=>!(c instanceof Float32Array)||c.length!==frames))throw new Error('sourceEditor.invalidPcm');
 // Freeze the operation before any asynchronous work; caller controls may change.
 const operation=structuredClone(input.operation);
 let token:string|undefined,publicationStarted=false;
 try{
  check();const sourceEdit=appendSourceEdit(clip,source,snapshot.sources,operation,frames);
  const buffer=new AudioBuffer({length:frames,numberOfChannels:pcm.length,sampleRate:source.sampleRate});
  for(let ch=0;ch<pcm.length;ch++){
   for(const sample of pcm[ch])if(!Number.isFinite(sample))throw new Error('sourceEditor.invalidPcm');
   buffer.copyToChannel(pcm[ch] as Float32Array<ArrayBuffer>,ch);
  }
  let filePath:string|undefined;
  if('__TAURI_INTERNALS__' in window){
   const wav=await encodeSourceBufferWav(buffer,signal);check();
   token=crypto.randomUUID();await invoke('recording_conversion_begin',{token});check();
   const bytes=new Uint8Array(await wav.arrayBuffer());check();
   filePath=await invoke<string>('recording_conversion_write',bytes,{headers:{'x-conversion-token':token}});check();
   if(typeof filePath!=='string'||!filePath)throw new Error('sourceEditor.invalidPcm');
  }
  const id=crypto.randomUUID(),derived:AudioSource={id,name,buffer,filePath,peaks:computeWaveformPeaks(buffer.getChannelData(0),Math.min(8000,Math.ceil(buffer.duration*200))),duration:buffer.duration,sampleRate:source.sampleRate,channels:buffer.numberOfChannels,provenance:source.filePath?{path:source.filePath,offset:clip.sourceOffset,rate:1}:source.provenance};
  const sources=new Map(snapshot.sources);sources.set(id,derived);
  const project={...snapshot.project,tracks:snapshot.project.tracks.map(t=>({...t,segments:t.segments.map(c=>c.id===clipId?{...c,sourceId:id,sourceOffset:0,retime:undefined,sourceEdit}:c)}))};
  if(token){check();await invoke('recording_conversion_protect',{token});}
  check();publicationStarted=true;publish({project,sources,isPlaying:false});
 }finally{
  if(token)try{await invoke('recording_conversion_finish',{token,keep:publicationStarted});}catch(error){console.warn('Source edit conversion finalization deferred',error);}
 }
}
