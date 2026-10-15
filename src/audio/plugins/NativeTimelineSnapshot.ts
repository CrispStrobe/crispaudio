import {invoke} from '@tauri-apps/api/core';
import type {TimelineProject,AudioSource} from '../../types/audio';
const interrupted=()=>new DOMException('Native timeline snapshot cancelled or superseded','AbortError');
interface Options {signal?:AbortSignal;isCurrent?:()=>boolean}
export interface NativeRangeCapture {kind:'native-snapshot-clock';frames:number;fault:number;endPaddingSilent:boolean;pcmHash:number;nonZeroFrames:number;samples:{frame:number;left:number;right:number}[];callbackTimes:number[];hardwareTimes:[number,number][];worker:{helperClosed:boolean;helpers:number;historyFrames:number;processTimes:number[]};cancelled:boolean}
/** Internal, validation-only bridge. Installed playback remains on rendered preview. */
export class NativeTimelineSnapshot {
 private closed=false;private active?:Promise<NativeRangeCapture>;private closing?:Promise<void>;
 private readonly id:string;private readonly durationFrames:number;private readonly isCurrent?:()=>boolean;
 private constructor(id:string,durationFrames:number,isCurrent?:()=>boolean){this.id=id;this.durationFrames=durationFrames;this.isCurrent=isCurrent;}
 static async create(project:TimelineProject,sources:Map<string,AudioSource>,options:Options={}){
  const check=()=>{options.signal?.throwIfAborted();if(options.isCurrent&&!options.isCurrent())throw interrupted();};check();
  const frozen=structuredClone(project);if(!Number.isFinite(frozen.duration)||frozen.duration<=0)throw new Error('Invalid native snapshot duration');if(frozen.sampleRate!==48000)throw new Error('Native snapshots require decoded 48 kHz audio');
  const required=[...new Set(frozen.tracks.flatMap(t=>t.segments.map(c=>c.sourceId)))];
  let bytes=0;
  // Copy before the first await, so caller mutations cannot change later chunks.
  const pcm=required.map(id=>{const buffer=sources.get(id)?.buffer;if(!buffer||buffer.sampleRate!==48000||buffer.numberOfChannels<1||buffer.numberOfChannels>2||buffer.length===0)throw new Error('Invalid native snapshot source');bytes+=buffer.length*16;if(bytes>256000000)throw new Error('Native snapshot memory limit reached');return {id,frames:buffer.length,sampleRate:48000,channels:Array.from({length:buffer.numberOfChannels},(_,ch)=>buffer.getChannelData(ch).slice())};});
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
  if(this.closed)return Promise.reject(interrupted());if(this.isCurrent&&!this.isCurrent())return this.close().then(()=>{throw interrupted();});if(this.active)return Promise.reject(new Error('Native snapshot capture already active'));
  if(!Number.isSafeInteger(startFrame)||!Number.isSafeInteger(endFrame)||startFrame<0||endFrame>this.durationFrames||endFrame-startFrame<2048||endFrame-startFrame>480000)return Promise.reject(new Error('Invalid native capture range'));
  const task=invoke<NativeRangeCapture>('native_snapshot_capture',{snapshot:this.id,startFrame,endFrame});this.active=task;
  return task.finally(()=>{if(this.active===task)this.active=undefined;});
 }
 close():Promise<void>{if(this.closing)return this.closing;this.closed=true;this.closing=(async()=>{await invoke('native_snapshot_close',{snapshot:this.id});await this.active?.catch(()=>{});})();return this.closing;}
}
