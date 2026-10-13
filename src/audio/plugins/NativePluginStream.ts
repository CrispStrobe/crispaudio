import {invoke} from '@tauri-apps/api/core';
import {validatePluginTransport,type PluginTransport} from './PluginTransport';
import {encodePluginPacket,decodePluginPacket} from './PluginStreamPacket';
export interface PluginStreamRequest {id:string;sampleRate:number;channels:1|2;parameters?:Record<string,number>;state?:string;processMode?:'realtime'|'offline'}
export interface PluginStreamReply {metadata:{sequence:number;frames:number;channels:number;sampleRate:number;latencySamples:number;processMode?:'realtime'|'offline';transport?:PluginTransport;state?:string;parameters?:{address:string;value:number}[]};samples:number[][]|Float32Array[]}
interface OpenReply {session:string;info:PluginStreamReply['metadata']}
const interrupted=()=>new DOMException('Plugin stream closed or superseded','AbortError');
/** Internal ordered transport. AudioWorklet scheduling and timeline inserts are separate. */
export class NativePluginStream {
 private session:string;private generation=0;private pending=0;private tail:Promise<void>=Promise.resolve();private closed=false;readonly info:PluginStreamReply['metadata'];
 private constructor(reply:OpenReply){this.session=reply.session;this.info=reply.info;}
 static async open(request:PluginStreamRequest,signal?:AbortSignal){signal?.throwIfAborted();const result=await invoke<OpenReply>('plugin_stream_open',{request});if(signal?.aborted){await invoke('plugin_stream_close',{session:result.session}).catch(()=>{});signal.throwIfAborted();}if(request.processMode&&result.info.processMode!==request.processMode){await invoke('plugin_stream_close',{session:result.session}).catch(()=>{});throw new Error('Native plugin process mode mismatch');}return new NativePluginStream(result);}
 process(samples:Float32Array[],parameters:Record<string,number>={},bypass=false,transport?:PluginTransport):Promise<PluginStreamReply>{
  if(this.closed)return Promise.reject(interrupted());if(this.pending>=4)return Promise.reject(new Error('Plugin stream backpressure'));
  const frames=samples[0]?.length;if(samples.length!==this.info.channels||!frames||frames>4096||samples.some(s=>s.length!==frames||s.some(v=>!Number.isFinite(v))))return Promise.reject(new Error('Invalid plugin stream audio'));
  let packet:ArrayBuffer,expected:PluginTransport|undefined;try{expected=transport?validatePluginTransport(transport):undefined;packet=encodePluginPacket({session:this.session,channels:this.info.channels,frames,parameters:{...parameters},bypass,...(expected?{transport:expected}:{})},samples);}catch(error){return Promise.reject(error);}return this.enqueue(async()=>{const reply=decodePluginPacket(await invoke<ArrayBuffer>('plugin_stream_process_binary',packet),this.info.channels,frames,this.info.sampleRate);if(expected&&(!reply.metadata.transport||Object.entries(expected).some(([key,value])=>reply.metadata.transport![key as keyof PluginTransport]!==value)))throw new Error('Invalid native transport acknowledgement');return reply;});
 }
 snapshot():Promise<PluginStreamReply>{return this.enqueue(()=>invoke<PluginStreamReply>('plugin_stream_snapshot',{session:this.session}));}
 private enqueue(task:()=>Promise<PluginStreamReply>){if(this.closed)return Promise.reject(interrupted());if(this.pending>=4)return Promise.reject(new Error('Plugin stream backpressure'));const generation=this.generation;this.pending++;
  const result=this.tail.then(async()=>{if(this.closed||generation!==this.generation)throw interrupted();try{const reply=await task();if(this.closed||generation!==this.generation)throw interrupted();return reply;}catch(error){if(this.closed||generation!==this.generation)throw interrupted();this.closed=true;this.generation++;await invoke('plugin_stream_close',{session:this.session}).catch(()=>{});throw error;}});this.tail=result.then(()=>{},()=>{});return result.finally(()=>{this.pending--;});
 }
 async close(){if(this.closed)return;this.closed=true;this.generation++;await invoke('plugin_stream_close',{session:this.session});}
}
