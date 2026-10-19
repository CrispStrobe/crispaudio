import {invoke} from '@tauri-apps/api/core';
import {readFile,remove,stat} from '@tauri-apps/plugin-fs';
import {mediaJob} from '../../lib/mediaJob';
import {encodeSourceChannelsWav} from '../../lib/wavExport';
import {validNativeEffects} from '../../lib/nativeEffects';
import type {NativeSourceInput} from './NativeSourceAudition';

export const SOURCE_PLUGIN_WAVEFORM_BYTES=64*1024*1024;
/** Allocation estimate includes encode/IPC/decode/copy overlap and ten seconds
 * of helper latency padding. Plug-in internals are outside this PCM estimate. */
export function sourcePluginWaveformPlan(input:NativeSourceInput,budget=SOURCE_PLUGIN_WAVEFORM_BYTES){
 const {channels,sampleRate,effect}=input,frames=channels[0]?.length??0,range=input.range??{start:0,end:frames};
 if(![44100,48000].includes(sampleRate)||![1,2].includes(channels.length)||!frames||frames/sampleRate>120||channels.some(c=>!(c instanceof Float32Array)||c.length!==frames)||!validNativeEffects([effect])||!effect.enabled||effect.parameterAutomation!==undefined||!Number.isInteger(range.start)||!Number.isInteger(range.end)||range.start<0||range.end<=range.start||range.end>frames)throw new Error('Unsupported plug-in waveform snapshot');
 const pcmBytes=frames*channels.length*4,estimatedBytes=pcmBytes*8+sampleRate*channels.length*4*20+65536;
 if(!Number.isFinite(budget)||estimatedBytes>budget)throw new Error('Plug-in waveform snapshot memory limit reached');
 return {frames,range,estimatedBytes,maxFileBytes:pcmBytes+65536};
}
interface Result {path?:string;sampleRate:number;frames:number;latency:number}
const discard=async(result:Result)=>{if(result.path)await remove(result.path);};
let settled=Promise.resolve();
export async function waitSourcePluginWaveforms(){await settled;}
/** Fresh source-rate, display-only render. No playback command, saved source,
 * transient DSP state or monitor control is read or mutated. Owned input files
 * are always rolled back; the returned PCM never enables Apply. */
export async function renderSourcePluginWaveform(input:NativeSourceInput,signal:AbortSignal){
 return (await renderSourcePluginPass(input,signal)).pcm;
}
/** Shared owned offline pass. Recipe preparation has a separately admitted budget;
 * callers own any later editor publication. Returned state never seeds a pass. */
export async function renderSourcePluginPass(input:NativeSourceInput,signal:AbortSignal,budget=SOURCE_PLUGIN_WAVEFORM_BYTES){
 // Serialize across editor unmount/remount too: cancelling a helper is not proof
 // that it has exited or that its buffers/files have been released.
 const previous=settled;let release!:()=>void;settled=new Promise<void>(done=>{release=done;});
 try{await previous;signal.throwIfAborted();return await render(input,signal,budget);}finally{release();}
}
async function render(input:NativeSourceInput,signal:AbortSignal,budget:number){
 const plan=sourcePluginWaveformPlan(input,budget);signal.throwIfAborted();
 const effect=structuredClone(input.effect),token=crypto.randomUUID();
 let begun=false,output:string|undefined;
 try{
  const wav=await encodeSourceChannelsWav(input.channels,input.sampleRate,signal);signal.throwIfAborted();
  // Mark before await: a late successful begin still belongs to this finally.
  begun=true;await invoke('recording_conversion_begin',{token});signal.throwIfAborted();
  const bytes=new Uint8Array(await wav.arrayBuffer());signal.throwIfAborted();
  const path=await invoke<string>('recording_conversion_write',bytes,{headers:{'x-conversion-token':token}});signal.throwIfAborted();
  const result=await mediaJob<Result>('audio_unit_plugin',{operation:'plugin-render',request:{id:effect.pluginId,path,offset:0,duration:plan.frames/input.sampleRate,parameters:effect.parameters,state:effect.state,bypass:false}},signal,discard);
  output=result.path;signal.throwIfAborted();
  if(!output||result.sampleRate!==input.sampleRate||result.frames!==plan.frames||!Number.isFinite(result.latency)||result.latency<0||result.latency>10)throw new Error('Invalid plug-in waveform format');
  const file=await stat(output);signal.throwIfAborted();
  if(!file.isFile||file.size<44||file.size>plan.maxFileBytes)throw new Error('Plug-in waveform file exceeds its budget');
  const encoded=await readFile(output);signal.throwIfAborted();
  if(encoded.byteLength>plan.maxFileBytes)throw new Error('Plug-in waveform file exceeds its budget');
  const decoder=new OfflineAudioContext(input.channels.length,1,input.sampleRate),decoded=await decoder.decodeAudioData(encoded.buffer.slice(encoded.byteOffset,encoded.byteOffset+encoded.byteLength) as ArrayBuffer);signal.throwIfAborted();
  if(decoded.sampleRate!==input.sampleRate||decoded.length!==plan.frames||decoded.numberOfChannels!==input.channels.length)throw new Error('Invalid plug-in waveform PCM');
  const pcm:Float32Array[]=[];
  for(let ch=0;ch<input.channels.length;ch++){
   const processed=decoded.getChannelData(ch),next=new Float32Array(input.channels[ch]);
   for(let start=0;start<processed.length;start+=65536){
    signal.throwIfAborted();const end=Math.min(start+65536,processed.length);
    for(let i=start;i<end;i++)if(!Number.isFinite(processed[i]))throw new Error('Invalid plug-in waveform PCM');
    if(end<processed.length)await new Promise(resolve=>setTimeout(resolve,0));
   }
   next.set(processed.subarray(plan.range.start,plan.range.end),plan.range.start);pcm.push(next);
  }
  signal.throwIfAborted();return {pcm,latency:result.latency};
 }finally{
  // Attempt both cleanups even if output removal fails. Never retain a display
  // input as a recording or add its path to the project/Undo history.
  try{if(output)await remove(output);}finally{if(begun)await invoke('recording_conversion_finish',{token,keep:false});}
 }
}
