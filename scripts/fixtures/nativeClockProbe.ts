import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
interface ClockReport {kind:string;fault:number;blocks:number;frames:number;pcmExact:boolean;faultBlockSilent:boolean;muted:boolean;deviceBound:boolean;cancelled:boolean;callbackTimes:number[];hardwareTimes:[number,number][];worker:{helpers:number;graphLatency:number|null;helperClosed:boolean;processTimes:number[];maxProcessMs:number};impulses:number[];blockFrames:number;ringSlots:number;queueBuffers:number}
const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error(message);};
export async function nativeClockProbe(plugin:string,graphAU?:string){
 await invoke('native_validation_window',{hidden:false});
 const run=async(mode:'baseline'|'stall'|'starve'|'cancel')=>{
  let resolveStarted!:()=>void;const started=new Promise<void>(resolve=>{resolveStarted=resolve;});
  const unlisten=await listen('native-clock-started',()=>resolveStarted());
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const result=invoke<ClockReport>('native_validation_audio_clock',{plugin,starve:mode==='starve',graphAu:graphAU??null});void result.catch(()=>{});
  try{
   await Promise.race([started,result.then(()=>{throw new Error('Clock finished before start event');}),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Clock start timeout')),15000);})]);
   let stallStart=0,stallEnd=0;
   if(mode==='stall'){
    await new Promise(resolve=>setTimeout(resolve,1000));stallStart=Date.now();const until=performance.now()+500;while(performance.now()<until){Math.sqrt(performance.now());}stallEnd=Date.now();
   }else if(mode==='cancel'){
    await new Promise(resolve=>setTimeout(resolve,150));await invoke('native_validation_audio_clock_cancel');
   }
   const report=await result;
   assert(report.worker.helperClosed&&report.muted&&report.deviceBound&&report.worker.helpers===(graphAU?4:1),'Native clock cleanup/device guard failed');
   if(mode==='starve')assert(report.fault===1&&report.faultBlockSilent,'Starvation did not latch silent fault');
   else if(mode==='cancel')assert(report.cancelled&&report.fault===0&&report.blocks<300,'Cancellation did not stop cleanly');
   else assert(report.fault===0&&report.pcmExact&&report.blocks===300,`Native clock lost or changed wet PCM: ${JSON.stringify({...report,callbackTimes:report.callbackTimes.slice(-12),hardwareTimes:report.hardwareTimes.slice(-12),worker:{...report.worker,processTimes:report.worker.processTimes.slice(-12)}})}`);
   const callbacksDuringStall=report.callbackTimes.filter(t=>t>stallStart&&t<stallEnd).length,processDuringStall=report.worker.processTimes.filter(t=>t>stallStart&&t<stallEnd).length;
   const hardware=report.hardwareTimes.filter(([t])=>t>stallStart&&t<stallEnd);
   const hardwareFramesDuringStall=hardware.length>1?hardware.at(-1)![1]-hardware[0][1]:0;
   if(mode==='stall')assert(callbacksDuringStall>30&&processDuringStall>30&&hardwareFramesDuringStall>20000,'Native deadlines did not progress during UI stall');
   return {mode,...report,stallStart,stallEnd,callbacksDuringStall,processDuringStall,hardwareFramesDuringStall};
  }finally{clearTimeout(timeout);unlisten();await invoke('native_validation_audio_clock_cancel');await result.catch(()=>{});}
 };
 const runs=[];for(const mode of ['baseline','stall','starve','cancel'] as const)runs.push(await run(mode));
 // Keep the console report concise; the native traces were used above for checks.
 return {kind:graphAU?'native-graph-clock':'native-clock',runs:runs.map(({callbackTimes,hardwareTimes,worker,...run})=>({...run,callbackCount:callbackTimes.length,hardwareClockSamples:hardwareTimes.length,worker:{helpers:worker.helpers,graphLatency:worker.graphLatency,helperClosed:worker.helperClosed,processCount:worker.processTimes.length,maxProcessMs:worker.maxProcessMs}}))};
}
