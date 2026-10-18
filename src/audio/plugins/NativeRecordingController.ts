import {readFile} from '@tauri-apps/plugin-fs';
import {invoke} from '@tauri-apps/api/core';
import type {AudioSource,RecordingInput,TimelineProject} from '../../types/audio';
import {recordingLeadIn} from '../../lib/recordingLeadIn';
import {publishNativeRecordingGroup,type NativeRecordingManifest} from '../../lib/nativeRecordingTakes';
import {computeWaveformPeaks} from '../utils/audioBufferUtils';
import {encodeAudioBufferWav} from '../../lib/wavExport';
import {NativeTimelineSnapshot} from './NativeTimelineSnapshot';
import {NativeTimelineRecording,type NativeInputInventory,type NativeRecordingOptions} from './NativeTimelineRecording';
import type {PlaybackDevice} from '../../lib/audioOutput';
const RATE=48000;
const aborted=()=>new DOMException('Native recording cancelled','AbortError');
export interface RecordingRoute {device:string;channels:number[];correctionFrames?:number}
export interface NativeRecordingSpec {
 project:TimelineProject;sources:Map<string,AudioSource>;
 targets:{trackId:string;input:RecordingInput}[];
 cursor:number;window?:{start:number;end:number};loop:boolean;crossfade:number;output:string;
 current:()=>{project:TimelineProject;sources:Map<string,AudioSource>};
 context:BaseAudioContext;takeName:string;sourceName:string;
}
/** Resolve CoreAudio routes independently of browser media IDs and compensation. */
export function nativeRecordingOptions(spec:NativeRecordingSpec,inventory:NativeInputInventory,outputs:PlaybackDevice[]):NativeRecordingOptions {
 if(inventory.permission!=='Authorized')throw new Error('recording.nativePermission');
 if(!spec.targets.length||spec.targets.length>8)throw new Error('recording.groupCount');
 const lead=recordingLeadIn(spec.project,spec.targets.map(target=>target.input),spec.cursor,spec.window,spec.loop);
 if(spec.loop&&!spec.window)throw new Error('recording.rangeRequired');
 const device=outputs.find(device=>spec.output?device.id===spec.output:device.isDefault);
 if(!device)throw new Error('recording.nativeOutputMissing');
 const toFrame=(seconds:number)=>{const frame=Math.round(seconds*RATE);if(!Number.isSafeInteger(frame)||frame<0||frame>0xffffffff)throw new Error('recording.rangeRequired');return frame;};
 const leadFrames=toFrame(lead.delay+lead.countSeconds),countInFrames=toFrame(lead.countSeconds),projectStartFrame=toFrame(lead.playbackStart),recordStartFrame=toFrame(lead.recordStart);
 const maxFrames=Math.min(Math.floor(32000000/spec.targets.length),Math.floor(240*1024*1024/(spec.targets.length*8*Math.max(1,spec.project.sampleRate/RATE))));
 if(maxFrames<9600+leadFrames+recordStartFrame-projectStartFrame)throw new Error('recording.backingBudget');
 const inputs=spec.targets.map(({trackId,input})=>{
  const route=input.native,device=inventory.devices.find(device=>route?.device?device.uid===route.device:device.isDefault);
  if(!device)throw new Error('recording.nativeInputMissing');
  const channels=route?.channels??(input.channel==='stereo'?[0,1]:[input.channel==='right'?1:0]);
  if(!Array.isArray(channels)||channels.length<1||channels.length>2||new Set(channels).size!==channels.length||channels.some(channel=>!Number.isInteger(channel)||channel<0||channel>=Math.min(32,device.channels)))throw new Error('recording.nativeChannels');
  const correction=route?.correctionFrames;
  if(correction!==undefined&&(!Number.isInteger(correction)||Math.abs(correction)>RATE))throw new Error('recording.timingInvalid');
  return {trackId,device:device.uid,channels:[...channels],monitorFx:input.monitor&&!!input.monitorFx,correction:{frames:correction??0,basis:correction===undefined?'unqualified' as const:'manual' as const},...(input.monitor?{cue:{gain:10**((input.monitorLevelDb??-12)/20),pan:input.monitorPan??0,mono:input.monitorMono??false}}:{})};
 });
 return {device:device.id,projectStartFrame,recordStartFrame,recordEndFrame:spec.window?toFrame(spec.window.end):undefined,cycle:spec.loop,leadFrames,countInFrames,maxFrames,inputs,click:{tempo:lead.music.tempo,numerator:lead.music.numerator,denominator:lead.music.denominator,originSeconds:lead.music.origin,level:lead.music.clickLevel,metronome:lead.music.metronome}};
}
export class NativeRecordingFailure extends Error {
 readonly directory?:string;
 constructor(message:string,directory?:string){super(message);this.directory=directory;}
}
export class NativeRecordingController {
 private readonly spec:NativeRecordingSpec;
 private readonly controller=new AbortController();
 private snapshot?:NativeTimelineSnapshot;
 private recorder?:NativeTimelineRecording;
 private starting?:Promise<void>;
 private closing?:Promise<{directory?:string;next?:ReturnType<typeof publishNativeRecordingGroup>}>;
 private cancelled=false;
 constructor(spec:NativeRecordingSpec){this.spec={...spec,sources:new Map(spec.sources)};}
 start(options:NativeRecordingOptions){
  if(this.closing)return Promise.reject(aborted());
  if(this.starting)return this.starting;
  this.starting=this.prepare(options);return this.starting;
 }
 private async prepare(options:NativeRecordingOptions){
  const {spec,controller}=this;
  const isCurrent=()=>!controller.signal.aborted&&spec.current().project===spec.project;
  try{
   // Empty sessions still need a positive native graph duration; extending the
   // frozen backing does not mutate the editor project or allocate silence PCM.
   const backing={...spec.project,duration:Math.max(spec.project.duration,(options.recordEndFrame??options.recordStartFrame+48000)/RATE)};
   this.snapshot=await NativeTimelineSnapshot.create(backing,spec.sources,{signal:controller.signal,isCurrent});
   controller.signal.throwIfAborted();
   this.recorder=await this.snapshot.startRecording(options);
   controller.signal.throwIfAborted();
  }catch(error){await this.snapshot?.close().catch(()=>{});throw error;}
 }
 status(){return this.recorder&&!this.closing?this.recorder.status():Promise.reject(aborted());}
 /** No browser timestamp is used to stop or place native samples. */
 stop(cancel=false){
  if(cancel){this.cancelled=true;this.controller.abort();}
  if(this.closing)return this.closing;
  if(!this.recorder)this.controller.abort();
  this.closing=this.finish();return this.closing;
 }
 private async finish(){
  let directory:string|undefined;
  try{
   try{await this.starting;}catch(error){if(this.cancelled||error instanceof DOMException&&error.name==='AbortError')return {};throw error;}
   const result=await this.recorder?.close(this.cancelled);
   directory=result?.directory;
   await this.snapshot?.close();
   if(this.cancelled||!result)return {directory};
   if(result.phase!=='complete'||!directory||!result.manifest)throw new Error(result.error??'recording.timingInvalid');
   const loaded=await this.load(directory,result.manifest);
   if(this.cancelled)return {directory};
   const {spec}=this,current=spec.current();
   const next=publishNativeRecordingGroup(directory,result.manifest,loaded,spec.project,current.project,current.sources,spec.takeName,spec.crossfade,spec.window);
   return {directory,next};
  }catch(error){throw new NativeRecordingFailure(error instanceof Error?error.message:String(error),directory);}
  finally{await this.snapshot?.close().catch(()=>{});}
 }
 private async load(directory:string,manifest:NativeRecordingManifest){
  if(manifest.version!==2||!Array.isArray(manifest.clips)||manifest.clips.length!==this.spec.targets.length||manifest.clips.length>8)throw new Error('recording.timingInvalid');
  let frames=0;const tracks=new Set<string>();
  for(const clip of manifest.clips){
   if(!clip||!this.spec.targets.some(target=>target.trackId===clip.track_id)||tracks.has(clip.track_id)||!/^native-take-[^/\\\p{Cc}]+\/take\.wav$/u.test(clip.audio)||!clip.info||!Number.isSafeInteger(clip.info.frames)||clip.info.frames<=0||clip.info.sample_rate!==RATE||![1,2].includes(clip.info.channels))throw new Error('recording.timingInvalid');
   tracks.add(clip.track_id);frames+=clip.info.frames;if(frames>32000000)throw new Error('recording.timingInvalid');
  }
  const loaded=new Map<string,AudioSource>();
  for(const clip of manifest.clips){
   if(this.cancelled)throw aborted();
   const originalPath=`${directory.replace(/\/+$/,'')}/${clip.audio}`,bytes=await readFile(originalPath);
   if(bytes.byteLength>clip.info.frames*clip.info.channels*4+65536)throw new Error('recording.timingInvalid');
   let buffer=await this.spec.context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);
   if(Math.abs(buffer.duration-clip.info.frames/RATE)>1/buffer.sampleRate||buffer.numberOfChannels!==clip.info.channels)throw new Error('recording.timingInvalid');
   if(buffer.sampleRate!==this.spec.project.sampleRate){
    const offline=new OfflineAudioContext(buffer.numberOfChannels,Math.round(buffer.duration*this.spec.project.sampleRate),this.spec.project.sampleRate),node=offline.createBufferSource();node.buffer=buffer;node.connect(offline.destination);node.start();buffer=await offline.startRendering();
   }
   if(this.cancelled)throw aborted();
   let filePath=originalPath;
   if(buffer.sampleRate!==RATE){const wav=await encodeAudioBufferWav(buffer,32);filePath=await invoke<string>('persist_recording',new Uint8Array(await wav.arrayBuffer()));}
   const source:AudioSource={id:crypto.randomUUID(),name:this.spec.sourceName,buffer,duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,filePath,...(filePath!==originalPath?{provenance:{path:originalPath,offset:0,rate:1}}:{}),peaks:computeWaveformPeaks(buffer.getChannelData(0),Math.min(8000,Math.ceil(buffer.duration*200)))};
   loaded.set(clip.track_id,source);
  }
  return loaded;
 }
}
