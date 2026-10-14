// Isolated validation transport. Never imported by the installed application.
import {encodePluginPacket,decodePluginPacket} from '../../src/audio/plugins/PluginStreamPacket';
import type {PluginStreamReply} from '../../src/audio/plugins/NativePluginStream';
interface Timing {queueMs:number;processMs:number;receivedAt:number;finishedAt:number}
interface BlockTrace {offset:number;emittedFrame:number;receivedAt:number;replyAt?:number;postedAt?:number;acceptedFrame?:number;acceptedAt?:number;backend?:Timing}
const epoch=()=>performance.timeOrigin+performance.now();
let url='',key='',session='',info:PluginStreamReply['metadata'],port:MessagePort|undefined;
let tail=Promise.resolve(),pending=0,closed=false,plugin='';
let pulseSession='',pulseTimer:ReturnType<typeof setInterval>|undefined,pulseTail=Promise.resolve(),pulsePending=false;
const pulses:{sentAt:number;replyAt?:number;backend?:Timing;error?:string}[]=[];
const heartbeat:number[]=[];
const heartbeatTimer=setInterval(()=>{heartbeat.push(epoch());if(heartbeat.length>512)heartbeat.shift();},20);
const trace:BlockTrace[]=[],faults:{reason:string;frame?:number;offset?:number;at:number}[]=[];
async function invoke<T>(command:string,args:Record<string,unknown>|ArrayBuffer):Promise<T>{
 const response=await fetch(url+command,{method:'POST',headers:{'Content-Type':args instanceof ArrayBuffer?'application/octet-stream':'application/json','Tauri-Callback':'0','Tauri-Error':'1','Tauri-Invoke-Key':key},body:args instanceof ArrayBuffer?args:JSON.stringify(args)});
 if(response.headers.get('Tauri-Response')!=='ok')throw new Error(await response.text());
 return (response.headers.get('Content-Type')?.includes('application/json')?await response.json():await response.arrayBuffer()) as T;
}
function fault(reason:string,frame?:number,offset?:number){
 if(closed)return;closed=true;faults.push({reason,frame,offset,at:epoch()});port?.postMessage({type:'fault'});
}
function connect(next:MessagePort){
 port=next;
 port.onmessage=event=>{
  const data=event.data;
  if(data.type==='fault'){fault(String(data.reason),data.frame,data.offset);return;}
  if(data.type==='diagnostic-accepted'){const block=trace.find(block=>block.offset===data.offset);if(block){block.acceptedFrame=data.frame;block.acceptedAt=epoch();}return;}
  if(data.type!=='block'||closed)return;
  const block:BlockTrace={offset:data.offset,emittedFrame:data.frame,receivedAt:epoch()};trace.push(block);if(trace.length>128)trace.shift();
  if(++pending>4){pending--;fault('backpressure');return;}
  // Snapshot transferable PCM before queueing; transport order is strictly serial.
  const packet=encodePluginPacket({session,channels:2,frames:4096,parameters:{},bypass:false},data.samples);
  tail=tail.then(async()=>{
   if(closed)return;
   const reply=decodePluginPacket(await invoke<ArrayBuffer>('plugin_stream_process_binary',packet),2,4096,48000);
   block.replyAt=epoch();block.backend=(reply.metadata as typeof reply.metadata&{validationTiming:Timing}).validationTiming;
   if(!block.backend||![block.backend.queueMs,block.backend.processMs,block.backend.receivedAt,block.backend.finishedAt].every(value=>Number.isFinite(value)&&value>=0))throw new Error('Missing worker backend timing');
   if(reply.metadata.latencySamples!==info.latencySamples)throw new Error('Latency changed');
   if(closed)return;
   const samples=reply.samples.map(sample=>sample instanceof Float32Array?sample:Float32Array.from(sample));
   port!.postMessage({type:'block',offset:data.offset,samples,recycle:data.samples},[...samples,...data.samples].map(sample=>sample.buffer));
   block.postedAt=epoch();
  }).catch(error=>fault(String(error))).finally(()=>{pending--;});
 };
 port.start();
}
self.onmessage=async(event:MessageEvent)=>{
 const {id,type,data}=event.data;
 try{
  let result:unknown;
  if(type==='open'){
   url=data.url;key=data.key;plugin=data.plugin;
   const opened=await invoke<{session:string;info:PluginStreamReply['metadata']}>('plugin_stream_open',{request:{id:data.plugin,sampleRate:48000,channels:2,processMode:'realtime',parameters:{'100':.002,'101':0}}});
   session=opened.session;info=opened.info;if(info.latencySamples!==0||info.processMode!=='realtime')throw new Error('Unexpected fixture plugin configuration');result=opened;
  }else if(type==='connect'){connect(data.port);}
  else if(type==='pulse-start'){
   const opened=await invoke<{session:string}>('plugin_stream_open',{request:{id:plugin,sampleRate:48000,channels:2,processMode:'realtime',parameters:{'100':.002,'101':0}}});pulseSession=opened.session;result=pulseSession;
   pulseTimer=setInterval(()=>{
    if(pulsePending)return;pulsePending=true;const pulse:{sentAt:number;replyAt?:number;backend?:Timing;error?:string}={sentAt:epoch()};pulses.push(pulse);if(pulses.length>256)pulses.shift();
    const packet=encodePluginPacket({session:pulseSession,channels:2,frames:128,parameters:{},bypass:false},[new Float32Array(128),new Float32Array(128)]);
    pulseTail=invoke<ArrayBuffer>('plugin_stream_process_binary',packet).then(bytes=>{const reply=decodePluginPacket(bytes,2,128,48000);pulse.replyAt=epoch();pulse.backend=(reply.metadata as typeof reply.metadata&{validationTiming:Timing}).validationTiming;}).catch(error=>{pulse.error=String(error);}).finally(()=>{pulsePending=false;});
   },40);
  }
  else if(type==='report'){result={trace,faults,pending,heartbeat,pulses};}
  else if(type==='close'){closed=true;clearInterval(heartbeatTimer);if(pulseTimer)clearInterval(pulseTimer);port?.postMessage({type:'dispose'});await Promise.all([tail,pulseTail]);if(pulseSession)await invoke('plugin_stream_close',{session:pulseSession});if(session)await invoke('plugin_stream_close',{session});port?.close();}
  else throw new Error('Unknown validation request');
  self.postMessage({id,result});
 }catch(error){self.postMessage({id,error:String(error)});}
};
