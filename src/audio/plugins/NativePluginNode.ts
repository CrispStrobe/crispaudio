import url from '../worklets/nativePluginProcessor.ts?worker&url';
import {FrameDelay} from '../dsp/frameDelay';
import {NativePluginStream,type PluginStreamRequest} from './NativePluginStream';
import type {PluginBlock} from './PluginBlockBuffer';
const prepared=new WeakMap<BaseAudioContext,Promise<void>>();
export function prepareNativePlugin(ctx:BaseAudioContext){let ready=prepared.get(ctx);if(!ready){ready=ctx.audioWorklet.addModule(url).catch(error=>{prepared.delete(ctx);throw error;});prepared.set(ctx,ready);}return ready;}
/** Internal real-time bridge. Callers must compensate its fixed delay in the complete graph. */
export async function prepareNativePluginNode(ctx:AudioContext,request:PluginStreamRequest,options:{blockFrames?:number;signal?:AbortSignal;onFault:(reason:string)=>void}){
 if(ctx.sampleRate!==request.sampleRate)throw new Error('Invalid plugin bridge clock');
 const blockFrames=options.blockFrames??4096,delayBlocks=4;if(!Number.isInteger(blockFrames)||blockFrames<128||blockFrames>4096||blockFrames%128)throw new Error('Invalid plugin bridge buffer');
 await prepareNativePlugin(ctx);options.signal?.throwIfAborted();const stream=await NativePluginStream.open(request,options.signal);
 let dryDelay:FrameDelay;try{dryDelay=new FrameDelay(request.channels,stream.info.latencySamples);}catch(error){await stream.close().catch(()=>{});throw error;}
 const dryScratch=Array.from({length:request.channels},()=>new Float32Array(blockFrames));
 let node:AudioWorkletNode|undefined;
 const idle=new Set<()=>void>();
 let closing:Promise<void>|undefined;
 let closed=false,pending=0,parameters={...request.parameters},bypass=false,dirty=false;
 const close=()=>{if(closing)return closing;closed=true;options.signal?.removeEventListener('abort',abort);node?.port.postMessage({type:'dispose'});node?.disconnect();if(node)node.port.onmessage=null;closing=stream.close();return closing;};
 const fault=(reason:string)=>{if(closed)return;node?.port.postMessage({type:'fault'});try{options.onFault(reason);}finally{void close().catch(()=>{});}};const abort=()=>{void close().catch(()=>{});};options.signal?.addEventListener('abort',abort,{once:true});
 const attach=(startFrame:number)=>{
 if(closed||node)throw new Error('Plugin bridge already attached or closed');if(!Number.isSafeInteger(startFrame)||startFrame<Math.round(ctx.currentTime*ctx.sampleRate))throw new Error('Plugin bridge start time expired');
 node=new AudioWorkletNode(ctx,'crispaudio-native-plugin',{numberOfInputs:1,numberOfOutputs:1,channelCount:request.channels,channelCountMode:'explicit',outputChannelCount:[request.channels],processorOptions:{channels:request.channels,blockFrames,delayBlocks,startFrame}});
 const active=node;
 node.onprocessorerror=()=>fault('processor-error');
 node.port.onmessage=e=>{if(closed)return;if(e.data?.type==='fault'){fault(String(e.data.reason));return;}if(e.data?.type!=='block')return;
  const block=e.data as PluginBlock;if(++pending>4){fault('backpressure');return;}const values=dirty?{...parameters}:{},dry=bypass,drySamples=dry?Array.from({length:request.channels},()=>new Float32Array(blockFrames)):dryScratch;if(dry||stream.info.latencySamples)dryDelay.process(block.samples,drySamples);dirty=false;
  void stream.process(block.samples,values,false).then(reply=>{if(closed)return;if(reply.metadata.latencySamples!==stream.info.latencySamples){fault('latency-changed');return;}const samples=dry?drySamples:reply.samples.map(s=>s instanceof Float32Array?s:Float32Array.from(s));active.port.postMessage({type:'block',offset:block.offset,samples,recycle:block.samples},[...samples,...block.samples].map(s=>s.buffer));}).catch(error=>{if(!closed)fault(String(error));}).finally(()=>{pending--;if(!pending){for(const resolve of idle)resolve();idle.clear();}});
 };
 return active;
 };
 if(options.signal?.aborted){await close();options.signal.throwIfAborted();}
 return {attach,delayFrames:blockFrames*delayBlocks+stream.info.latencySamples,transportFrames:blockFrames*delayBlocks,pluginLatencyFrames:stream.info.latencySamples,update:(values:Record<string,number>,dry=false)=>{parameters={...values};dirty=true;bypass=dry;},snapshot:async()=>{if(pending)await new Promise<void>(resolve=>idle.add(resolve));return stream.snapshot();},close};
}

export async function createNativePluginNode(ctx:AudioContext,request:PluginStreamRequest,options:{startFrame:number;blockFrames?:number;signal?:AbortSignal;onFault:(reason:string)=>void}){
 if(!Number.isSafeInteger(options.startFrame)||options.startFrame<0)throw new Error('Invalid plugin bridge clock');
 const prepared=await prepareNativePluginNode(ctx,request,options);try{return {...prepared,node:prepared.attach(options.startFrame)};}catch(error){await prepared.close().catch(()=>{});throw error;}
}
