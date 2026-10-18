import {invoke} from '@tauri-apps/api/core';
import {NativeTimelineRecording,type NativeRecordingOptions} from './NativeTimelineRecording';
import type {TimelineProject,AudioSource} from '../../types/audio';
import {NativeTimelinePlayback,type NativePlaybackOptions} from './NativeTimelinePlayback';
const interrupted=()=>new DOMException('Native timeline snapshot cancelled or superseded','AbortError');
interface Options {signal?:AbortSignal;isCurrent?:()=>boolean}
export interface NativeRangeCapture {kind:'native-snapshot-clock';frames:number;fault:number;endPaddingSilent:boolean;pcmHash:number;nonZeroFrames:number;samples:{frame:number;left:number;right:number}[];callbackTimes:number[];hardwareTimes:[number,number][];worker:{helperClosed:boolean;helpers:number;historyFrames:number;processTimes:number[]};cancelled:boolean}
/** Frozen, bounded PCM upload for native-owned Mac playback. */
export class NativeTimelineSnapshot {
 private closed=false;private active?:Promise<NativeRangeCapture>;private closing?:Promise<void>;
 private recording?:NativeTimelineRecording;private startingRecording?:Promise<NativeTimelineRecording>;
 private playback?:NativeTimelinePlayback;private starting?:Promise<NativeTimelinePlayback>;
 private readonly id:string;private readonly durationFrames:number;private readonly isCurrent?:()=>boolean;
 private constructor(id:string,durationFrames:number,isCurrent?:()=>boolean){this.id=id;this.durationFrames=durationFrames;this.isCurrent=isCurrent;}
 static async create(project:TimelineProject,sources:Map<string,AudioSource>,options:Options={}){
  const check=()=>{options.signal?.throwIfAborted();if(options.isCurrent&&!options.isCurrent())throw interrupted();};check();
  const frozen=structuredClone(project);if(!Number.isFinite(frozen.duration)||frozen.duration<=0)throw new Error('Invalid native snapshot duration');if(!Number.isFinite(frozen.sampleRate)||frozen.sampleRate<8000||frozen.sampleRate>192000)throw new Error('Invalid native snapshot sample rate');frozen.sampleRate=48000;
  const required=[...new Set(frozen.tracks.flatMap(t=>t.segments.map(c=>c.sourceId)))];
  let bytes=0;
  // Copy before the first await, so caller mutations cannot change later chunks.
  const pcm=required.map(id=>{const buffer=sources.get(id)?.buffer;if(!buffer||!Number.isFinite(buffer.sampleRate)||buffer.sampleRate<8000||buffer.sampleRate>192000||buffer.numberOfChannels<1||buffer.numberOfChannels>2||buffer.length===0)throw new Error('Invalid native snapshot source');bytes+=Math.max(buffer.length,Math.ceil(buffer.length*48000/buffer.sampleRate)+2)*16;if(bytes>256000000)throw new Error('Native snapshot memory limit reached');return {id,frames:buffer.length,sampleRate:buffer.sampleRate,channels:Array.from({length:buffer.numberOfChannels},(_,ch)=>buffer.getChannelData(ch).slice())};});
  for(const source of pcm){
   check();if(source.sampleRate===48000)continue;
   const frames=Math.ceil(source.frames*48000/source.sampleRate)+2;
   const offline=new OfflineAudioContext(source.channels.length,frames,48000),input=offline.createBuffer(source.channels.length,source.frames,source.sampleRate);
   source.channels.forEach((channel,index)=>input.copyToChannel(channel,index));
   const node=offline.createBufferSource();node.buffer=input;node.connect(offline.destination);node.start();
   const rendered=await offline.startRendering();check();
   source.frames=frames;source.sampleRate=48000;source.channels=Array.from({length:source.channels.length},(_,index)=>rendered.getChannelData(index).slice());
  }
  const id=await invoke<string>('native_snapshot_begin',{project:frozen,descriptors:pcm.map(s=>({id:s.id,frames:s.frames,sampleRate:s.sampleRate,channels:s.channels.length}))});
  try{
   check();for(let source=0;source<pcm.length;source++){const s=pcm[source];for(let offset=0;offset<s.frames;offset+=8192){check();const frames=Math.min(8192,s.frames-offset),header=new TextEncoder().encode(JSON.stringify({snapshot:id,source,offset,frames})),packet=new ArrayBuffer(8+header.length+frames*s.channels.length*4),view=new DataView(packet);new Uint8Array(packet,0,4).set([67,80,83,49]);view.setUint32(4,header.length,true);new Uint8Array(packet,8,header.length).set(header);
    for(let ch=0;ch<s.channels.length;ch++)for(let i=0;i<frames;i++){const value=s.channels[ch][offset+i];if(!Number.isFinite(value))throw new Error('Non-finite native snapshot PCM');view.setFloat32(8+header.length+(ch*frames+i)*4,value,true);}
    await invoke('native_snapshot_write',packet);check();
   }}
   await invoke('native_snapshot_seal',{snapshot:id});check();return new NativeTimelineSnapshot(id,Math.round(frozen.duration*48000),options.isCurrent);
  }catch(error){await invoke('native_snapshot_close',{snapshot:id}).catch(()=>{});throw error;}
 }
 /** Silent, finite native range capture; no production transport activation. */
 captureRange(startFrame:number,endFrame:number):Promise<NativeRangeCapture>{
  if(this.closed)return Promise.reject(interrupted());if(this.isCurrent&&!this.isCurrent())return this.close().then(()=>{throw interrupted();});if(this.active||this.playback||this.starting||this.recording||this.startingRecording)return Promise.reject(new Error('Native snapshot capture already active'));
  if(!Number.isSafeInteger(startFrame)||!Number.isSafeInteger(endFrame)||startFrame<0||endFrame>this.durationFrames||endFrame-startFrame<2048||endFrame-startFrame>480000)return Promise.reject(new Error('Invalid native capture range'));
  const task=invoke<NativeRangeCapture>('native_snapshot_capture',{snapshot:this.id,startFrame,endFrame});this.active=task;
  return task.finally(()=>{if(this.active===task)this.active=undefined;});
 }
 startPlayback(options:NativePlaybackOptions):Promise<NativeTimelinePlayback>{
  if(this.closed)return Promise.reject(interrupted());if(this.active||this.playback||this.starting||this.recording||this.startingRecording)return Promise.reject(new Error('Native snapshot playback already active'));
  if(!Number.isSafeInteger(options.startFrame)||!Number.isSafeInteger(options.endFrame)||options.startFrame<0||options.endFrame>this.durationFrames||options.startFrame>=options.endFrame)return Promise.reject(new Error('Invalid native playback range'));
  if(this.isCurrent&&!this.isCurrent())return this.close().then(()=>{throw interrupted();});
  const task=(async()=>{
   const playback=await NativeTimelinePlayback.open(this.id,options,()=>{this.playback=undefined;});
   if(this.closed||(this.isCurrent&&!this.isCurrent())){await playback.close();throw interrupted();}
   this.playback=playback;return playback;
  })();this.starting=task;return task.finally(()=>{if(this.starting===task)this.starting=undefined;});
 }
 /** Recording shares this snapshot's source lease and exclusive transport owner. */
 startRecording(options:NativeRecordingOptions):Promise<NativeTimelineRecording>{
  if(this.closed)return Promise.reject(interrupted());
  if(this.active||this.playback||this.starting||this.recording||this.startingRecording)return Promise.reject(new Error('Native snapshot transport already active'));
  if(this.isCurrent&&!this.isCurrent())return this.close().then(()=>{throw interrupted();});
  const task=(async()=>{
   const recording=await NativeTimelineRecording.open(this.id,options,()=>{this.recording=undefined;});
   if(this.closed||(this.isCurrent&&!this.isCurrent())){await recording.close(true);throw interrupted();}
   this.recording=recording;return recording;
  })();this.startingRecording=task;
  return task.finally(()=>{if(this.startingRecording===task)this.startingRecording=undefined;});
 }
 close():Promise<void>{
  if(this.closing)return this.closing;this.closed=true;
  this.closing=(async()=>{
   const failures:unknown[]=[];
   const finish=async(task:Promise<unknown>|undefined,abortExpected=false)=>{try{await task;}catch(error){if(!abortExpected||!(error instanceof DOMException&&error.name==='AbortError'))failures.push(error);}};
   // A failed registry close must still stop/join its owned audio session.
   await finish(invoke('native_snapshot_close',{snapshot:this.id}));
   await finish(this.starting,true);await finish(this.startingRecording,true);
   await finish(this.recording?.close(true));await finish(this.playback?.close());
   await this.active?.catch(()=>{});
   if(failures.length)throw failures[0];
  })();return this.closing;
 }
}
