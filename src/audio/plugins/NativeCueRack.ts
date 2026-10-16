import {FrameDelay} from '../dsp/frameDelay';
import {NativePluginStream,type PluginStreamReply} from './NativePluginStream';
import type {NativeEffect} from '../../types/audio';
import {validNativeEffects} from '../../lib/nativeEffects';
/** Static input inserts share one Web Audio bridge; each native helper keeps its own state. */
export async function openNativeCueRack(sampleRate:number,effects:NativeEffect[],signal:AbortSignal){
 if(!effects.length||effects.length>2||effects.some(effect=>!effect.enabled)||!validNativeEffects(effects))throw new Error('recording.cueInvalid');
 const entries:{stream:NativePluginStream;dry?:FrameDelay;bypass:boolean;latency:number}[]=[];
 let closed=false,closing:Promise<void>|undefined;
 const close=()=>{if(closing)return closing;closed=true;signal.removeEventListener('abort',abort);closing=Promise.allSettled(entries.map(entry=>entry.stream.close())).then(()=>{});return closing;};
 const abort=()=>{void close();};signal.addEventListener('abort',abort,{once:true});
 try{
  signal.throwIfAborted();
  for(const effect of effects){
   const stream=await NativePluginStream.open({id:effect.pluginId,sampleRate,channels:2,parameters:effect.parameters,state:effect.state,processMode:'realtime'},signal);
   if(closed||signal.aborted){await stream.close();throw new DOMException('Cue rack closed','AbortError');}
   // Register before allocating delay history, so every failure closes this stream too.
   const entry={stream,latency:stream.info.latencySamples,bypass:effect.bypass,dry:undefined as FrameDelay|undefined};entries.push(entry);
   entry.dry=new FrameDelay(2,entry.latency);signal.throwIfAborted();
  }
  const info={...entries[0].stream.info,latencySamples:entries.reduce((sum,entry)=>sum+entry.latency,0)};
  if(closed)throw new DOMException('Cue rack closed','AbortError');
  return {info,close,snapshot:async():Promise<PluginStreamReply>=>{throw new Error('Input cue rack uses saved static state');},process:async(samples:Float32Array[],parameters:Record<string,number>={},bypass=false):Promise<PluginStreamReply>=>{
   if(closed)throw new DOMException('Cue rack closed','AbortError');
   if(Object.keys(parameters).length||bypass)throw new Error('Input cue rack uses saved static settings');
   try{
    let pcm=samples,reply:PluginStreamReply|undefined;
    for(const entry of entries){
     const dry=entry.bypass?pcm.map(channel=>new Float32Array(channel.length)):undefined;
     if(dry)entry.dry!.process(pcm,dry);
     reply=await entry.stream.process(pcm);
     if(closed)throw new DOMException('Cue rack closed','AbortError');
     if(reply.metadata.latencySamples!==entry.latency)throw new Error('Native cue latency changed');
     pcm=dry??reply.samples.map(channel=>channel instanceof Float32Array?channel:Float32Array.from(channel));
    }
    return {metadata:{...reply!.metadata,latencySamples:info.latencySamples},samples:pcm};
   }catch(error){await close();throw error;}
  }};
 }catch(error){await close();throw error;}
}
