import {nativeAutomationPacketFits,compileNativeParameterAutomation,validNativeParameterAutomation} from '../../lib/nativeParameterCurves';
import type {NativeParameterCurve} from '../../types/audio';
import url from '../worklets/nativePluginProcessor.ts?worker&url';
import {FrameDelay} from '../dsp/frameDelay';
import {NativePluginStream,type PluginStreamRequest} from './NativePluginStream';
import {validatePluginTransport,type PluginTransport} from './PluginTransport';
import type {PluginBlock} from './PluginBlockBuffer';
export type PluginNodeRequest=PluginStreamRequest & {transport?:PluginTransport;parameterAutomation?:Record<string,NativeParameterCurve>};
export interface NativePluginDiagnostic {stage:'input'|'reply'|'posted'|'accepted'|'fault';id:string;instance:number;offset?:number;frame:number;mainFrame:number;reason?:string}
let diagnosticInstance=0;
const diagnostics=new WeakMap<BaseAudioContext,(event:NativePluginDiagnostic)=>void>();
/** Opt-in validation telemetry. Normal playback sends no diagnostic messages. */
export function observeNativePluginBridge(ctx:BaseAudioContext,observer:(event:NativePluginDiagnostic)=>void){diagnostics.set(ctx,observer);return ()=>{if(diagnostics.get(ctx)===observer)diagnostics.delete(ctx);};}
const prepared=new WeakMap<BaseAudioContext,Promise<void>>();
export function prepareNativePlugin(ctx:BaseAudioContext){let ready=prepared.get(ctx);if(!ready){ready=ctx.audioWorklet.addModule(url).catch(error=>{prepared.delete(ctx);throw error;});prepared.set(ctx,ready);}return ready;}
/** Internal real-time bridge. Callers must compensate its fixed delay in the complete graph. */
export async function prepareNativePluginNode(ctx:BaseAudioContext,request:PluginNodeRequest,options:{blockFrames?:number;signal?:AbortSignal;onFault:(reason:string)=>void}){
 if(ctx.sampleRate!==request.sampleRate)throw new Error('Invalid plugin bridge clock');
 const {transport:configuration,parameterAutomation,...streamRequest}=request;
 if(!validNativeParameterAutomation(parameterAutomation)||!nativeAutomationPacketFits(request.parameters??{},parameterAutomation))throw new Error('Invalid native parameter automation');
 const parameterValues=compileNativeParameterAutomation(parameterAutomation);
 const transport=configuration?validatePluginTransport(configuration):undefined;
 const blockFrames=options.blockFrames??4096,delayBlocks=4;if(!Number.isInteger(blockFrames)||blockFrames<128||blockFrames>4096||blockFrames%128)throw new Error('Invalid plugin bridge buffer');
 await prepareNativePlugin(ctx);options.signal?.throwIfAborted();const stream=await NativePluginStream.open(streamRequest,options.signal);
 let dryDelay:FrameDelay;try{dryDelay=new FrameDelay(request.channels,stream.info.latencySamples);}catch(error){await stream.close().catch(()=>{});throw error;}
 const dryScratch=Array.from({length:request.channels},()=>new Float32Array(blockFrames));
 let node:AudioWorkletNode|undefined;
 const barriers=new Map<number,{resolve:()=>void;reject:(error:Error)=>void}>();let barrierId=0;
 const idle=new Set<()=>void>(),awaiting=new Set<number>(),offline=request.processMode==='offline';
 const notifyIdle=()=>{if(!pending&&!awaiting.size){for(const resolve of idle)resolve();idle.clear();}};
 let closing:Promise<void>|undefined;
 let closed=false,pending=0,parameters={...request.parameters},bypass=false,dirty=false;
 const close=()=>{if(closing)return closing;closed=true;options.signal?.removeEventListener('abort',abort);node?.port.postMessage({type:'dispose'});node?.disconnect();if(node)node.port.onmessage=null;awaiting.clear();for(const waiter of barriers.values())waiter.reject(new DOMException('Plugin bridge closed','AbortError'));barriers.clear();for(const resolve of idle)resolve();idle.clear();closing=stream.close();return closing;};
 const fault=(reason:string)=>{if(closed)return;node?.port.postMessage({type:'fault'});try{options.onFault(reason);}finally{void close().catch(()=>{});}};const abort=()=>{void close().catch(()=>{});};options.signal?.addEventListener('abort',abort,{once:true});
 const attach=(startFrame:number)=>{
 if(closed||node)throw new Error('Plugin bridge already attached or closed');if(!Number.isSafeInteger(startFrame)||startFrame<Math.round(ctx.currentTime*ctx.sampleRate))throw new Error('Plugin bridge start time expired');
 node=new AudioWorkletNode(ctx,'crispaudio-native-plugin',{numberOfInputs:1,numberOfOutputs:1,channelCount:request.channels,channelCountMode:'explicit',outputChannelCount:[request.channels],processorOptions:{channels:request.channels,blockFrames,delayBlocks,startFrame,acknowledge:offline,diagnostic:diagnostics.has(ctx)}});
 const active=node,instance=diagnostics.has(ctx)?++diagnosticInstance:0;
 const trace=(stage:NativePluginDiagnostic['stage'],frame:number,offset?:number,reason?:string)=>diagnostics.get(ctx)?.({stage,id:request.id,instance,offset,frame,mainFrame:Math.round(ctx.currentTime*ctx.sampleRate),reason});
 node.onprocessorerror=()=>fault('processor-error');
 node.port.onmessage=e=>{if(closed)return;if(e.data?.type==='fault'){trace('fault',e.data.frame,e.data.offset,String(e.data.reason));fault(String(e.data.reason));return;}if(e.data?.type==='barrier'){const waiter=barriers.get(e.data.id);barriers.delete(e.data.id);if(e.data.active)waiter?.resolve();else waiter?.reject(new Error('Native processor fault'));return;}if(e.data?.type==='diagnostic-accepted'){trace('accepted',e.data.frame,e.data.offset);return;}if(e.data?.type==='block-accepted'){awaiting.delete(e.data.offset);notifyIdle();return;}if(e.data?.type!=='block')return;
  const block=e.data as PluginBlock;trace('input',e.data.frame,block.offset);if(offline)awaiting.add(block.offset);if(++pending>4){fault('backpressure');return;}const automated=parameterValues(((transport?.projectPosition??transport?.samplePosition??0)+block.offset)/request.sampleRate),values={...(dirty?parameters:{}),...automated},dry=bypass,drySamples=dry?Array.from({length:request.channels},()=>new Float32Array(blockFrames)):dryScratch;if(dry||stream.info.latencySamples)dryDelay.process(block.samples,drySamples);dirty=false;
  void (transport?stream.process(block.samples,values,false,{...transport,samplePosition:transport.samplePosition+block.offset}):stream.process(block.samples,values,false)).then(reply=>{if(closed)return;if(reply.metadata.latencySamples!==stream.info.latencySamples){fault('latency-changed');return;}trace('reply',Math.round(ctx.currentTime*ctx.sampleRate),block.offset);const samples=dry?drySamples:reply.samples.map(s=>s instanceof Float32Array?s:Float32Array.from(s));active.port.postMessage({type:'block',offset:block.offset,samples,recycle:block.samples},[...samples,...block.samples].map(s=>s.buffer));if(instance)trace('posted',Math.round(ctx.currentTime*ctx.sampleRate),block.offset);}).catch(error=>{if(!closed)fault(String(error));}).finally(()=>{pending--;notifyIdle();});
 };
 return active;
 };
 if(options.signal?.aborted){await close();options.signal.throwIfAborted();}
 const barrier=async()=>{if(closed)throw new DOMException('Plugin bridge closed','AbortError');if(node)await new Promise<void>((resolve,reject)=>{const id=++barrierId;barriers.set(id,{resolve,reject});node!.port.postMessage({type:'barrier',id});});};
 const drain=async()=>{if(closed)throw new DOMException('Plugin bridge closed','AbortError');if(pending||awaiting.size)await new Promise<void>(resolve=>idle.add(resolve));if(closed)throw new DOMException('Plugin bridge closed','AbortError');if(offline)await barrier();};
 return {attach,drain,bindContext:async(next:BaseAudioContext)=>{if(closed||node)throw new Error('Cannot rebind active plugin');if(next.sampleRate!==request.sampleRate)throw new Error('Invalid plugin bridge clock');await prepareNativePlugin(next);options.signal?.throwIfAborted();if(closed)throw new DOMException('Plugin bridge closed','AbortError');ctx=next;},delayFrames:blockFrames*delayBlocks+stream.info.latencySamples,transportFrames:blockFrames*delayBlocks,pluginLatencyFrames:stream.info.latencySamples,update:(values:Record<string,number>,dry=false)=>{parameters={...values};dirty=true;bypass=dry;},snapshot:async()=>{if(closed)throw new DOMException('Plugin bridge closed','AbortError');if(node&&ctx.state!=='suspended')throw new Error('Pause playback before querying native plugin state');await barrier();await drain();if(!offline)await barrier();if(closed)throw new DOMException('Plugin bridge closed','AbortError');if(node&&ctx.state!=='suspended')throw new Error('Pause playback before querying native plugin state');const reply=await stream.snapshot();if(closed)throw new DOMException('Plugin bridge closed','AbortError');if(node&&ctx.state!=='suspended')throw new Error('Pause playback before querying native plugin state');return reply;},close};
}

export async function createNativePluginNode(ctx:BaseAudioContext,request:PluginNodeRequest,options:{startFrame:number;blockFrames?:number;signal?:AbortSignal;onFault:(reason:string)=>void}){
 if(!Number.isSafeInteger(options.startFrame)||options.startFrame<0)throw new Error('Invalid plugin bridge clock');
 const prepared=await prepareNativePluginNode(ctx,request,options);try{return {...prepared,node:prepared.attach(options.startFrame)};}catch(error){await prepared.close().catch(()=>{});throw error;}
}
