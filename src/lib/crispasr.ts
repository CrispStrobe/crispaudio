/** In-process CrispASR audio tasks (desktop). The native side loads libcrispasr
 * through its C ABI; PCM crosses IPC as raw planar f32, never JSON/base64.
 * Only audio processing: separation, speech regeneration, VAD and beats. */
import {invoke} from '@tauri-apps/api/core';
import {editTimeRange} from './rangeEdits';
import {timelineDuration} from './timelineView';
import {sampleRanges,type SampleRange} from './sourceEditing';
import {DEFAULT_MUSIC,validMusic,type MusicalSettings} from './musicalTime';
import type {TimelineProject,TimelineMarker} from '../types/audio';

export type CrispModelKind='separation'|'speech'|'vad'|'beats';
export interface CrispStatus {available:boolean;path?:string|null;error?:string|null}
export interface CrispStem {name:string;channels:Float32Array[]}
export interface VadOptions {threshold?:number;minSpeechMs?:number;minSilenceMs?:number;padMs?:number}

export const crispDesktop=()=>typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window;
export async function crispStatus(library:string):Promise<CrispStatus>{
 if(!crispDesktop())return {available:false,error:'crisp.desktopOnly'};
 return invoke<CrispStatus>('crispasr_status',{library:library||null});
}

const MAX_SECONDS=20*60;
function body(channels:Float32Array[]):Uint8Array{
 const frames=channels[0]?.length??0;if(!frames||channels.length>2||channels.some(c=>c.length!==frames))throw new Error('crisp.invalidAudio');
 const out=new Float32Array(frames*channels.length);channels.forEach((c,i)=>out.set(c,i*frames));
 return new Uint8Array(out.buffer);
}
/** Raw-body invoke with cooperative cancellation through cancel_media_job. */
async function job<T>(command:string,header:Record<string,unknown>,channels:Float32Array[],signal:AbortSignal):Promise<T>{
 signal.throwIfAborted();
 const jobId=crypto.randomUUID();let finished=false,timer:ReturnType<typeof setTimeout>|undefined;
 const cancel=()=>{void invoke<boolean>('cancel_media_job',{jobId}).then(done=>{if(!done&&!finished)timer=setTimeout(cancel,100);}).catch(()=>{});};
 signal.addEventListener('abort',cancel,{once:true});
 try{const result=await invoke<T>(command,body(channels),{headers:{'x-crispasr':JSON.stringify({...header,jobId})}});signal.throwIfAborted();return result;}
 finally{finished=true;if(timer)clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}
export function decodeStems(bytes:ArrayBuffer):CrispStem[]{
 const view=new DataView(bytes);let at=0;const u32=()=>{const v=view.getUint32(at,true);at+=4;return v;};
 const count=u32(),stems:CrispStem[]=[];if(count<1||count>16)throw new Error('crisp.invalidResult');
 for(let i=0;i<count;i++){
  const length=u32();if(length>256)throw new Error('crisp.invalidResult');
  const name=new TextDecoder().decode(new Uint8Array(bytes,at,length));at+=length;
  const channels=u32(),frames=u32();if(channels<1||channels>2||at+channels*frames*4>bytes.byteLength)throw new Error('crisp.invalidResult');
  const pcm:Float32Array[]=[];for(let c=0;c<channels;c++){const values=new Float32Array(frames);for(let f=0;f<frames;f++){const v=view.getFloat32(at,true);at+=4;if(!Number.isFinite(v))throw new Error('crisp.invalidResult');values[f]=v;}pcm.push(values);}
  stems.push({name,channels:pcm});
 }
 if(at!==bytes.byteLength)throw new Error('crisp.invalidResult');
 return stems;
}
export async function crispProcess(task:'separate'|'speech',library:string,model:string,channels:Float32Array[],rate:number,signal:AbortSignal):Promise<CrispStem[]>{
 if(!model)throw new Error('crisp.chooseModel');
 if(channels[0].length/rate>MAX_SECONDS)throw new Error('crisp.tooLong');
 const bytes=await job<ArrayBuffer>('crispasr_process',{task,library:library||null,model,rate,channels:channels.length},channels,signal);
 const stems=decodeStems(bytes);
 if(stems.some(s=>s.channels[0].length!==channels[0].length))throw new Error('crisp.invalidResult');
 return stems;
}
export async function crispRegions(library:string,model:string,mono:Float32Array,rate:number,vad:VadOptions,signal:AbortSignal):Promise<[number,number][]>{
 if(!model)throw new Error('crisp.chooseModel');
 const result=await job<{regions:[number,number][]}>('crispasr_analyze',{task:'regions',library:library||null,model,rate,channels:1,vad},[mono],signal);
 return result.regions;
}
export interface BeatGrid {tempoBpm:number;beats:{time:number;downbeat:boolean}[]}
export async function crispBeats(library:string,model:string,mono:Float32Array,rate:number,signal:AbortSignal):Promise<BeatGrid>{
 if(!model)throw new Error('crisp.chooseModel');
 return job<BeatGrid>('crispasr_analyze',{task:'beats',library:library||null,model,rate,channels:1},[mono],signal);
}

/** Processing window: selected hull plus context, so models see real surroundings. */
export function processingWindow(ranges:SampleRange[],length:number,context:number):{start:number;end:number}{
 const selected=sampleRanges(ranges,length);if(!selected.length)throw new Error('sourceEditor.select');
 return {start:Math.max(0,selected[0].start-context),end:Math.min(length,selected.at(-1)!.end+context)};
}
/** Replace only selected samples/channels, ramping in and out inside each range
 * so audio outside the selection stays bit-identical. Mono results feed every channel. */
export function blendSelection(original:Float32Array[],processed:Float32Array[],offset:number,ranges:SampleRange[],channel:number,fade:number):Float32Array[]{
 const length=original[0]?.length??0,selected=sampleRanges(ranges,length);
 if(!processed.length||channel< -1||channel>=original.length)throw new Error('sourceEditor.select');
 return original.map((source,ch)=>{
  const out=source.slice();if(channel>=0&&ch!==channel)return out;
  const wet=processed[Math.min(ch,processed.length-1)];
  for(const r of selected){
   const ramp=Math.max(1,Math.min(fade,Math.floor((r.end-r.start)/2)));
   for(let i=r.start;i<r.end;i++){
    const j=i-offset;if(j<0||j>=wet.length)throw new Error('crisp.invalidResult');
    const w=Math.min(1,(i-r.start+.5)/ramp,(r.end-i-.5)/ramp);
    out[i]=source[i]*(1-w)+wet[j]*w;
   }
  }
  return out;
 });
}

/** Interior silences between speech regions at least minPause long. */
export function planPauses(regions:[number,number][],minPause:number):{start:number;end:number}[]{
 const sorted=[...regions].filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a).sort((a,b)=>a[0]-b[0]),merged:[number,number][]=[];
 for(const [a,b] of sorted){const last=merged.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else merged.push([a,b]);}
 const out:{start:number;end:number}[]=[];
 for(let i=1;i<merged.length;i++){const start=merged[i-1][1],end=merged[i][0];if(end-start>=minPause-1e-9)out.push({start,end});}
 return out;
}
/** Same semantics as media::crispasr::pause_cuts (CLI tighten-pauses). */
export function pauseCuts(pauses:{start:number;end:number}[],keep:number,fps?:number):{start:number;end:number}[]{
 if(!Number.isFinite(keep)||keep<0||(fps!==undefined&&(!Number.isFinite(fps)||fps<=0)))throw new Error('crisp.invalidPauses');
 const out:{start:number;end:number}[]=[];let previous=-Infinity;
 for(const p of pauses){
  if(!Number.isFinite(p.start)||!Number.isFinite(p.end)||p.start<0||p.end<=p.start||p.start<previous-1e-9)throw new Error('crisp.invalidPauses');
  previous=p.end;let start=p.start+keep/2,end=p.end-keep/2;
  if(fps){start=Math.ceil(start*fps-1e-7)/fps;end=Math.floor(end*fps+1e-7)/fps;}
  if(end-start>1e-6)out.push({start,end});
 }
 if(out.length>2000)throw new Error('crisp.tooManyCuts');
 return out;
}
/** Extract every cut across all lanes in descending order: one immutable result. */
export function tightenPauses(project:TimelineProject,pauses:{start:number;end:number}[],keep:number):TimelineProject{
 const duration=timelineDuration(project);
 if(pauses.some(p=>p.end>duration+1e-6))throw new Error('crisp.invalidPauses');
 const cuts=pauseCuts(pauses,keep,project.video?project.frameRate??25:undefined);
 let next=project;
 for(const cut of [...cuts].reverse())next=editTimeRange(next,cut.start,cut.end,'extract',{trackIds:project.tracks.map(t=>t.id),includeVideo:!!project.video,retimeGlobal:true});
 return next;
}

/** Meter and first downbeat only when the model's downbeats are consistent:
 * spacing >= 2 beats and at least 60% of bars agreeing. Otherwise undefined. */
export function downbeatMeter(grid:BeatGrid):{numerator:number;origin:number}|undefined{
 const downs=grid.beats.map((b,i)=>b.downbeat?i:-1).filter(i=>i>=0);if(downs.length<3)return undefined;
 const counts=new Map<number,number>();for(let i=1;i<downs.length;i++){const n=downs[i]-downs[i-1];counts.set(n,(counts.get(n)??0)+1);}
 const [numerator,agree]=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0];
 if(numerator<2||numerator>32||agree<.6*(downs.length-1))return undefined;
 return {numerator,origin:grid.beats[downs[0]].time};
}
/** Tempo from a detected beat grid; meter/origin follow downbeatMeter, else the
 * current meter is kept and bar 1 starts at the first beat (tempo only). */
export function musicFromBeats(grid:BeatGrid,current:MusicalSettings|undefined):MusicalSettings|undefined{
 if(grid.beats.length<4||!Number.isFinite(grid.tempoBpm)||grid.tempoBpm<20||grid.tempoBpm>300)return undefined;
 const meter=downbeatMeter(grid),base=current??DEFAULT_MUSIC;
 const next:MusicalSettings={...base,tempo:Math.round(grid.tempoBpm*100)/100,...(meter?{numerator:meter.numerator,denominator:4,origin:meter.origin}:{origin:grid.beats[0].time})};
 return validMusic(next)?next:undefined;
}
export function beatMarkers(grid:BeatGrid,offset:number,downbeatsOnly:boolean,name:(bar:number,beat:number)=>string):TimelineMarker[]{
 const out:TimelineMarker[]=[];let bar=0,beat=0,previous=-Infinity;
 for(const b of grid.beats){
  const time=b.time+offset;if(!Number.isFinite(time)||time<0||time<=previous)throw new Error('crisp.invalidResult');previous=time;
  beat++;if(b.downbeat){bar++;beat=1;}
  if(downbeatsOnly&&!b.downbeat)continue;
  out.push({id:crypto.randomUUID(),time,name:name(bar,beat)});
 }
 if(out.length>5000)throw new Error('crisp.tooManyMarkers');
 return out;
}

/** Downmix and resample an AudioBuffer for analysis with the browser resampler. */
export async function analysisPcm(buffer:AudioBuffer,rate:number,start=0,end=buffer.duration):Promise<Float32Array>{
 const length=Math.max(1,Math.round((end-start)*rate));
 const context=new OfflineAudioContext({numberOfChannels:1,length,sampleRate:rate});
 const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);source.start(0,start,end-start);
 return (await context.startRendering()).getChannelData(0).slice();
}
