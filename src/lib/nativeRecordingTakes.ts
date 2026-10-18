import {projectSourceIds} from './projectFile';
import {validNativeImportId,validNativeRecordingImports} from './nativeRecordingImports';
import type {AudioSource,RecordingTake,TimelineProject} from '../types/audio';
import {publishRecordingGroup,type PreparedRecording} from './recordingGroup';

/** A verified backend v2 manifest. Host clocks remain backend-owned; only integer
 * placements cross into the editor. Loading audio must finish before publication. */
export interface NativeRecordingManifest {
 version:number;
 clips:{track_id:string;audio:string;info:{frames:number;sample_rate:number;channels:number}}[];
 timing?:{version:number;intent:{context?:{scope:string};projectId:string;corrections:Record<string,{frames:number;basis:string}>};placements:{trackId:string;pass:number;projectStartFrame:number;sourceOffsetFrames:number;frames:number}[]};
}
const RATE=48000,MAX_FRAMES=32000000,MAX_PROJECT=0xffffffff;
const integer=(value:number,max:number)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
function invalid():never{throw new Error('recording.timingInvalid');}
const controls=(value:string)=>/\p{Cc}/u.test(value);

export function prepareNativeRecordingGroup(directory:string,manifest:NativeRecordingManifest,loaded:Map<string,AudioSource>,takeName:string):PreparedRecording[]{
 const timing=manifest?.timing;
 if(typeof directory!=='string'||!directory||controls(directory)||manifest?.version!==2||!Array.isArray(manifest.clips)||manifest.clips.length<1||manifest.clips.length>8||timing?.version!==1||!Array.isArray(timing.placements)||!timing.placements.length||timing.placements.length>4096||typeof timing.intent?.projectId!=='string'||!timing.intent.projectId||timing.intent.projectId.length>128||controls(timing.intent.projectId)||!timing.intent.corrections||loaded.size!==manifest.clips.length)invalid();
 const corrections=timing.intent.corrections,ids=new Set<string>(),sourceIds=new Set<string>(),rows=new Map<string,RecordingTake[]>(),seenPasses=new Map<string,Set<number>>();let total=0;
 if(Object.keys(corrections).length!==manifest.clips.length)invalid();
 const capturedAt=new Date().toISOString(),root=directory.replace(/\/+$/,'');
 for(const clip of manifest.clips){
  if(!clip||typeof clip.track_id!=='string'||!clip.track_id||clip.track_id.length>128||controls(clip.track_id)||ids.has(clip.track_id)||typeof clip.audio!=='string'||controls(clip.audio)||!/^native-take-[^/\\]+\/take\.wav$/.test(clip.audio)||!clip.info||!integer(clip.info.frames,MAX_FRAMES)||!clip.info.frames||clip.info.sample_rate!==RATE||![1,2].includes(clip.info.channels)||!Object.hasOwn(corrections,clip.track_id))invalid();
  total+=clip.info.frames;if(total>MAX_FRAMES)invalid();ids.add(clip.track_id);rows.set(clip.track_id,[]);seenPasses.set(clip.track_id,new Set());
  const correction=corrections[clip.track_id],source=loaded.get(clip.track_id);
  if(!correction||!Number.isInteger(correction.frames)||Math.abs(correction.frames)>RATE||!['unqualified','manual','measured'].includes(correction.basis)||(correction.basis==='unqualified'&&correction.frames!==0)||!source||!source.id||sourceIds.has(source.id))invalid();
  sourceIds.add(source.id);
  const buffer=source.buffer;
  if((source.provenance&&(source.provenance.offset!==0||source.provenance.rate!==1))||(source.provenance?.path??source.filePath)!==`${root}/${clip.audio}`||!buffer||!Number.isFinite(source.sampleRate)||source.sampleRate<=0||buffer.sampleRate!==source.sampleRate||source.channels!==clip.info.channels||buffer.numberOfChannels!==source.channels||!integer(buffer.length,MAX_FRAMES*4)||!Number.isFinite(source.duration)||Math.abs(source.duration-clip.info.frames/RATE)>1/source.sampleRate||Math.abs(buffer.duration-source.duration)>1/source.sampleRate||Math.abs(buffer.length-source.duration*source.sampleRate)>1)invalid();
 }
 for(const placement of timing.placements){
  const clip=manifest.clips.find(clip=>clip.track_id===placement?.trackId);
  if(!placement||!clip||!integer(placement.pass,MAX_PROJECT)||!integer(placement.projectStartFrame,MAX_PROJECT)||!integer(placement.sourceOffsetFrames,clip.info.frames)||!integer(placement.frames,clip.info.frames)||!placement.frames||placement.sourceOffsetFrames+placement.frames>clip.info.frames||placement.projectStartFrame+placement.frames>MAX_PROJECT||seenPasses.get(placement.trackId)!.has(placement.pass))invalid();
  seenPasses.get(placement.trackId)!.add(placement.pass);
  // Keep the editor's existing minimum take length; retain all raw audio on disk.
  if(placement.frames/RATE<.01)continue;
  const source=loaded.get(placement.trackId)!,correction=corrections[placement.trackId];
  rows.get(placement.trackId)!.push({id:crypto.randomUUID(),name:`${takeName} ${placement.pass+1}`,sourceId:source.id,sourceOffset:placement.sourceOffsetFrames/RATE,startTime:placement.projectStartFrame/RATE,duration:placement.frames/RATE,pass:placement.pass+1,capturedAt,droppedFrames:0,notes:[],latencyMs:correction.frames===0?0:-correction.frames/RATE*1000});
 }
 return manifest.clips.map(clip=>{
  const takes=rows.get(clip.track_id)!;if(!takes.length)throw new Error('recording.empty');takes.sort((a,b)=>a.pass-b.pass);
  return {trackId:clip.track_id,source:loaded.get(clip.track_id)!,takes};
 });
}
/** Return one complete editor transaction. Caller performs ONE setState, keeping
 * project-change/lock checks and source retention for Undo/Redo in the shared path. */
export function publishNativeRecordingGroup(directory:string,manifest:NativeRecordingManifest,loaded:Map<string,AudioSource>,snapshot:TimelineProject,current:TimelineProject,existing:Map<string,AudioSource>,takeName:string,crossfade:number,window?:{start:number;end:number},incomplete=false){
 const prepared=prepareNativeRecordingGroup(directory,manifest,loaded,takeName);
 const key=manifest.timing?.intent.context?.scope;
 if(!validNativeRecordingImports(current)||key!==undefined&&!validNativeImportId(key))invalid();
 if(key&&current.nativeRecordingImports?.includes(key))throw new Error('recording.recoveryAlreadyImported');
 if(key&&(current.nativeRecordingImports?.length??0)>=4096)throw new Error('recording.recoveryReceiptLimit');
 const paths=new Set(manifest.clips.map(clip=>`${directory.replace(/\/+$/,'')}/${clip.audio}`));
 const used=projectSourceIds(current);
 if([...existing.values()].some(source=>used.has(source.id)&&paths.has(source.provenance?.path??source.filePath??'')))throw new Error('recording.recoveryAlreadyImported');
 if(manifest.timing!.intent.projectId!==snapshot.id)throw new Error('recording.projectChanged');
 if(incomplete)for(const item of prepared)for(const take of item.takes)take.notes.push('Recovered incomplete recording');
 const result=publishRecordingGroup(snapshot,current,existing,prepared,crossfade,window);
 if(key)result.project={...result.project,nativeRecordingImports:[...(current.nativeRecordingImports??[]),key]};
 return result;
}
