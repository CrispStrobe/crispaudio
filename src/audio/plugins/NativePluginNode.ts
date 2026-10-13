import url from '../worklets/nativePluginProcessor.ts?worker&url';
import {NativePluginStream,type PluginStreamRequest} from './NativePluginStream';
import type {PluginBlock} from './PluginBlockBuffer';
const prepared=new WeakMap<BaseAudioContext,Promise<void>>();
export function prepareNativePlugin(ctx:BaseAudioContext){let ready=prepared.get(ctx);if(!ready){ready=ctx.audioWorklet.addModule(url).catch(error=>{prepared.delete(ctx);throw error;});prepared.set(ctx,ready);}return ready;}
/** Internal real-time bridge. Callers must compensate its fixed delay in the complete graph. */
export async function createNativePluginNode(ctx:AudioContext,request:PluginStreamRequest,options:{startFrame:number;signal?:AbortSignal;onFault:(reason:string)=>void}){
 if(ctx.sampleRate!==request.sampleRate||!Number.isSafeInteger(options.startFrame)||options.startFrame<0)throw new Error('Invalid plugin bridge clock');
 await prepareNativePlugin(ctx);options.signal?.throwIfAborted();const stream=await NativePluginStream.open(request,options.signal),blockFrames=1024,delayBlocks=4;
 let node:AudioWorkletNode;try{if(options.startFrame<Math.round(ctx.currentTime*ctx.sampleRate))throw new Error('Plugin bridge start time expired');node=new AudioWorkletNode(ctx,'crispaudio-native-plugin',{numberOfInputs:1,numberOfOutputs:1,channelCount:request.channels,channelCountMode:'explicit',outputChannelCount:[request.channels],processorOptions:{channels:request.channels,blockFrames,delayBlocks,startFrame:options.startFrame}});}catch(error){await stream.close().catch(()=>{});throw error;}
 let closed=false,pending=0,parameters={...request.parameters},bypass=false;
 const close=async()=>{if(closed)return;closed=true;options.signal?.removeEventListener('abort',abort);node.port.postMessage({type:'dispose'});node.disconnect();node.port.onmessage=null;await stream.close();};
 const fault=(reason:string)=>{if(closed)return;node.port.postMessage({type:'fault'});try{options.onFault(reason);}finally{void close().catch(()=>{});}};const abort=()=>{void close().catch(()=>{});};options.signal?.addEventListener('abort',abort,{once:true});
 node.onprocessorerror=()=>fault('processor-error');
 node.port.onmessage=e=>{if(closed)return;if(e.data?.type==='fault'){fault(String(e.data.reason));return;}if(e.data?.type!=='block')return;
  const block=e.data as PluginBlock;if(++pending>4){fault('backpressure');return;}const values={...parameters},dry=bypass;
  void stream.process(block.samples,values,dry).then(reply=>{if(closed)return;if(reply.metadata.latencySamples!==stream.info.latencySamples){fault('latency-changed');return;}const samples=reply.samples.map(s=>Float32Array.from(s));node.port.postMessage({type:'block',offset:block.offset,samples,recycle:block.samples},[...samples,...block.samples].map(s=>s.buffer));}).catch(error=>{if(!closed)fault(String(error));}).finally(()=>{pending--;});
 };
 if(options.signal?.aborted){await close();options.signal.throwIfAborted();}
 return {node,delayFrames:blockFrames*delayBlocks+stream.info.latencySamples,transportFrames:blockFrames*delayBlocks,pluginLatencyFrames:stream.info.latencySamples,update:(values:Record<string,number>,dry=false)=>{parameters={...values};bypass=dry;},snapshot:()=>stream.snapshot(),close};
}
