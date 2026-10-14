import {invoke,convertFileSrc} from '@tauri-apps/api/core';
import workerUrl from './nativeWorkerAudio.ts?worker&url';
import pluginUrl from '../../src/audio/worklets/nativePluginProcessor.ts?worker&url';
import captureUrl from './nativeCapture.ts?worker&url';
interface BlockTrace {offset:number;emittedFrame:number;receivedAt:number;replyAt?:number;postedAt?:number;acceptedFrame?:number;acceptedAt?:number;backend?:{queueMs:number;processMs:number;receivedAt:number;finishedAt:number}}
interface WorkerReport {trace:BlockTrace[];faults:{reason:string;frame?:number;offset?:number;at:number}[];pending:number;heartbeat:number[];pulses:{sentAt:number;replyAt?:number;backend?:{queueMs:number;processMs:number;receivedAt:number;finishedAt:number};error?:string}[]}
const epoch=()=>performance.timeOrigin+performance.now();
export async function workerAudioProbe(plugin:string,stallMs:number){
 const runs=[];
 for(const stall of [0,stallMs]){
  const result=await run(plugin,stall);
  const status=await invoke<{active:number;opening:number}>('native_validation_status');
  if(status.active||status.opening)throw new Error('Worker probe retained native sessions');
  runs.push(result);
 }
 return {kind:'worker-audio',runs};
}
async function run(plugin:string,stallMs:number){
 const ctx=new AudioContext({sampleRate:48000}),worker=new Worker(workerUrl,{type:'module'});
 let session='',pulseSession='',requestId=0;
 const waiting=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 worker.onmessage=event=>{const task=waiting.get(event.data.id);if(!task)return;waiting.delete(event.data.id);clearTimeout(task.timer);if(event.data.error)task.reject(new Error(event.data.error));else task.resolve(event.data.result);};
 worker.onerror=()=>{for(const task of waiting.values()){clearTimeout(task.timer);task.reject(new Error('Validation audio worker failed'));}waiting.clear();};
 const request=<T>(type:string,data:unknown={},transfer:Transferable[]=[]):Promise<T>=>new Promise((resolve,reject)=>{const id=++requestId,timer=setTimeout(()=>{waiting.delete(id);reject(new Error(`Worker ${type} timeout`));},type==='open'?15000:5000);waiting.set(id,{resolve:value=>resolve(value as T),reject,timer});worker.postMessage({id,type,data},transfer);});
 try{
  await ctx.resume();await Promise.all([ctx.audioWorklet.addModule(pluginUrl),ctx.audioWorklet.addModule(captureUrl)]);
  const key=await invoke<string>('native_validation_worker_key');
  await invoke('native_validation_progress',{stage:'worker-audio-open'});
  const opened=await request<{session:string;info:{latencySamples:number}}>('open',{plugin,key,url:convertFileSrc('','ipc')});session=opened.session;await invoke('native_validation_progress',{stage:'worker-audio-pulse'});pulseSession=await request<string>('pulse-start');
  const origin=Math.ceil((ctx.currentTime*48000+48000)/128)*128,frames=288000,impulse=192000;
  const node=new AudioWorkletNode(ctx,'crispaudio-native-plugin',{numberOfInputs:1,numberOfOutputs:1,channelCount:2,channelCountMode:'explicit',outputChannelCount:[2],processorOptions:{channels:2,blockFrames:4096,delayBlocks:4,startFrame:origin,diagnostic:true}});
  const capture=new AudioWorkletNode(ctx,'crispaudio-native-validation-capture',{numberOfInputs:2,outputChannelCount:[2],processorOptions:{frames}}),silent=ctx.createGain();silent.gain.value=0;node.connect(capture);capture.connect(silent);silent.connect(ctx.destination);

  // A suspended-context clock is not used: epoch/frame calibration is approximate.
  const clock={frame:Math.round(ctx.currentTime*48000),at:epoch()};
  await invoke('native_validation_progress',{stage:'worker-audio-connect'});
  await request('connect',{port:node.port},[node.port]);
  if(ctx.currentTime*48000>=origin)throw new Error('Worker attachment missed origin');
  const done=new Promise<{peak:number;index:number}[]>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Worker capture timeout')),15000);capture.port.onmessage=event=>{clearTimeout(timeout);resolve(event.data);};});
  void done.catch(()=>{}); // Cleanup also handles failures before capture is awaited.
  capture.port.postMessage(origin+16384);
  const pcm=ctx.createBuffer(2,frames,48000);pcm.getChannelData(0)[impulse]=1.5;pcm.getChannelData(1)[impulse]=-1.25;
  const source=ctx.createBufferSource();source.buffer=pcm;source.connect(node);source.start(origin/48000);
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,(origin/48000+1-ctx.currentTime)*1000)));
  const stallStart=epoch(),end=performance.now()+stallMs;while(performance.now()<end){Math.sqrt(performance.now());}const stallEnd=epoch();
  const peaks=await done;await invoke('native_validation_progress',{stage:'worker-audio-capture'});const report=await request<WorkerReport>('report');
  const clockEnd={frame:Math.round(ctx.currentTime*48000),at:epoch()};
  const heartbeatDuringStall=report.heartbeat.filter(at=>at>=stallStart&&at<=stallEnd).length;
  const duringStall=report.trace.filter(block=>block.replyAt!==undefined&&block.replyAt>=stallStart&&block.replyAt<=stallEnd).length;
  return {stallMs,stallStart,stallEnd,clock,clockEnd,origin,frames,impulse,effectDelay:96,reportedLatency:opened.info.latencySamples,peaks,duringStall,heartbeatDuringStall,...report};
 }finally{
  await invoke('native_validation_progress',{stage:'worker-audio-close'});await ctx.close();
  try{await request('close');}finally{worker.terminate();for(const task of waiting.values()){clearTimeout(task.timer);task.reject(new Error('Validation worker closed'));}waiting.clear();if(pulseSession)await invoke('plugin_stream_close',{session:pulseSession}).catch(()=>{});if(session)await invoke('plugin_stream_close',{session}).catch(()=>{});}
 }
}
