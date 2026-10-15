import {invoke} from '@tauri-apps/api/core';
import {TimelineEngine} from '../../src/audio/engine/TimelineEngine';
import {DELIVERY_DEFAULTS,DeliveryQueue,planDelivery} from '../../src/lib/delivery';
import {deliveryFile,runDelivery} from '../../src/lib/deliveryRunner';
import type {TimelineProject,AudioSource} from '../../src/types/audio';
export async function nativeLiveDelivery(base:TimelineProject){
 const ctx=new AudioContext({sampleRate:48000}),engine=new TimelineEngine(ctx),buffer=ctx.createBuffer(2,48000,48000);
 for(let i=0;i<48000;i++)for(let ch=0;ch<2;ch++)buffer.getChannelData(ch)[i]=.2*Math.sin(2*Math.PI*(ch?660:440)*i/48000);
 const project={...base,duration:1,tracks:base.tracks.map(track=>({...track,segments:track.segments.map(clip=>({...clip,duration:1}))}))},sources=new Map([['source',{id:'source',buffer}as AudioSource]]);
 const directory=await invoke<string>('native_validation_delivery_directory'),queue=new DeliveryQueue((job,signal,phase)=>runDelivery(job,engine,signal,phase),()=>{});
 try{
  for(const format of ['wav','flac','aac']as const){const [plan]=planDelivery(project,sources,{...DELIVERY_DEFAULTS,format});queue.add(plan,deliveryFile(directory,'Wet mix',format));}
  const end=performance.now()+30000;while(queue.jobs.some(job=>job.status==='queued'||job.status==='running')){if(performance.now()>end)throw new Error('Native delivery queue timed out');await new Promise(resolve=>setTimeout(resolve,20));}
  if(queue.jobs.some(job=>job.status!=='done'))throw new Error(JSON.stringify(queue.jobs.map(job=>({status:job.status,error:job.error}))));
  const controller=new AbortController(),[plan]=planDelivery(project,sources,{...DELIVERY_DEFAULTS,format:'flac'}),cancelled=deliveryFile(directory,'Cancelled','flac');
  await runDelivery({id:'cancel',plan,output:cancelled,status:'running',phase:'rendering'},engine,controller.signal,phase=>{if(phase==='encoding')controller.abort();}).then(()=>{throw new Error('Cancelled export published');},error=>{if(!(error instanceof DOMException&&error.name==='AbortError'))throw error;});
  return {files:queue.jobs.map(job=>job.output),cancelled,wet:true,queue:'passed',cancellation:'passed'};
 }finally{queue.dispose();engine.stop();await ctx.close();}
}
