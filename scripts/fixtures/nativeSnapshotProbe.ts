import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {NativeTimelineSnapshot,type NativeRangeCapture} from '../../src/audio/plugins/NativeTimelineSnapshot';
import {useProjectStore} from '../../src/stores/projectStore';
import type {TimelineProject,AudioSource} from '../../src/types/audio';
const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error(message);};
export async function nativeSnapshotProbe(plugin:string){
 await invoke('native_validation_window',{hidden:false});const ctx=new AudioContext({sampleRate:48000}),buffer=ctx.createBuffer(2,192000,48000);
 buffer.getChannelData(0)[23950]=1;buffer.getChannelData(1)[23950]=-0.8;buffer.getChannelData(0)[60000]=1.5;buffer.getChannelData(1)[60000]=-1.25;buffer.getChannelData(0)[170100]=1;
 const project:TimelineProject={id:'snapshot',name:'Owned snapshot',duration:4,sampleRate:48000,masterVolume:0.5,masterEffects:[],nativeEffects:[{instanceId:'fx',pluginId:plugin,name:'ADelay',format:'VST3',enabled:true,bypass:false,parameters:{'100':0.002,'101':0},state:''}],tracks:[{id:'track',name:'Track',volume:1,pan:0,muted:false,solo:false,segments:[{id:'clip',trackId:'track',sourceId:'source',name:'Clip',color:'#4488cc',startTime:0,sourceOffset:0,duration:4,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'}]}]};
 const sources=new Map([['source',{id:'source',buffer} as AudioSource]]);useProjectStore.setState({project,sources});
 const empty=async()=>{const status=await invoke<{entries:number;bytes:number}>('native_snapshot_status');assert(status.entries===0&&status.bytes===0,'Snapshot reservation leaked');};
 let snapshot:NativeTimelineSnapshot|undefined;try{
  let checks=0;let stale=false;try{await NativeTimelineSnapshot.create(project,sources,{isCurrent:()=>++checks<4});}catch(error){stale=error instanceof DOMException&&error.name==='AbortError';}assert(stale,'Stale upload started');await empty();
  snapshot=await NativeTimelineSnapshot.create(useProjectStore.getState().project,useProjectStore.getState().sources);
  buffer.getChannelData(0).fill(0);buffer.getChannelData(1).fill(0);
  const run=async(start:number,end:number,stall:boolean)=>{
   let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});const unlisten=await listen('native-clock-started',()=>started());const task=snapshot!.captureRange(start,end);void task.catch(()=>{});
   try{await Promise.race([ready,task.then(()=>{throw new Error('Capture ended before readiness');})]);let first=0,last=0;if(stall){await new Promise(resolve=>setTimeout(resolve,700));first=Date.now();const until=performance.now()+500;while(performance.now()<until){Math.sqrt(performance.now());}last=Date.now();}const result=await task;assert(result.kind==='native-snapshot-clock'&&result.fault===0&&result.frames===end-start&&result.worker.helperClosed&&result.endPaddingSilent,'Native snapshot capture failed');const expected=[24046,60096].filter(frame=>frame>=start&&frame<end).map(frame=>frame-start);assert(JSON.stringify(result.samples.map(s=>s.frame))===JSON.stringify(expected),'Seek changed wet impulse positions');for(const sample of result.samples){const frame=sample.frame+start;assert(Math.abs(sample.left-(frame===24046?0.5:0.75))<2e-6&&Math.abs(sample.right-(frame===24046?-0.4:-0.625))<2e-6,'Snapshot PCM or fader changed');}
    const callbacks=result.callbackTimes.filter(t=>t>first&&t<last).length,processing=result.worker.processTimes.filter(t=>t>first&&t<last).length;if(stall)assert(callbacks>30&&processing>30,'Snapshot audio waited for UI');return {frames:result.frames,history:result.worker.historyFrames,samples:result.samples,callbacksDuringStall:callbacks,processingDuringStall:processing};
   }finally{unlisten();}
  };
  const full=await run(0,153600,true),seek=await run(24000,170123,false);assert(seek.history===24000&&seek.samples[0].frame===46,'Seek omitted pre-range FX history');
  let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});const unlisten=await listen('native-clock-started',()=>started());let cancelled:NativeRangeCapture;
  try{const task=snapshot.captureRange(0,153600);void task.catch(()=>{});await Promise.race([ready,task.then(()=>{throw new Error('Cancellation capture ended early');})]);await snapshot.close();cancelled=await task;assert(cancelled.cancelled&&cancelled.fault===0&&cancelled.worker.helperClosed,'Owned capture cancellation failed');}finally{unlisten();}
  await empty();return {kind:'native-snapshot',full,seek,cancelled:true,staleUpload:'closed',sourceMutation:'isolated',registry:'empty'};
 }finally{await snapshot?.close();await ctx.close();}
}
