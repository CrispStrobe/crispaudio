import {invoke} from '@tauri-apps/api/core';
import {encodeSourceBufferWav} from '../../lib/wavExport';
import {computeWaveformPeaks} from '../utils/audioBufferUtils';
import {assertSourcePluginRecallCurrent,sourcePluginRecallCommit,type SourcePluginRecallPlan,type PreparedSourcePluginRecall,type RecallState} from '../../lib/sourcePluginRecall';
import type {AudioSource} from '../../types/audio';

/** Own derived storage through the single synchronous editor publication. A
 * subscriber may throw after publication; retain conservatively in that case. */
export async function commitSourcePluginRecall(plan:SourcePluginRecallPlan,prepared:PreparedSourcePluginRecall,current:()=>RecallState,publish:(next:ReturnType<typeof sourcePluginRecallCommit>)=>void,signal:AbortSignal){
 const check=()=>{signal.throwIfAborted();const state=current();assertSourcePluginRecallCurrent(plan,state);return state;};
 let token:string|undefined,publicationStarted=false;
 try{
  check();const buffer=new AudioBuffer({numberOfChannels:prepared.pcm.length,length:plan.outputFrames,sampleRate:plan.rate});prepared.pcm.forEach((c,ch)=>buffer.copyToChannel(c as Float32Array<ArrayBuffer>,ch));
  let filePath:string|undefined;
  if('__TAURI_INTERNALS__' in window){
   const wav=await encodeSourceBufferWav(buffer,signal);check();
   token=crypto.randomUUID();await invoke('recording_conversion_begin',{token});check();
   const bytes=new Uint8Array(await wav.arrayBuffer());check();
   filePath=await invoke<string>('recording_conversion_write',bytes,{headers:{'x-conversion-token':token}});check();
   if(typeof filePath!=='string'||!filePath)throw new Error('sourceRecall.format');
  }
  const source:AudioSource={id:crypto.randomUUID(),name:`${plan.original.name} · ${prepared.recipe.name}`,buffer,filePath,sampleRate:plan.rate,channels:buffer.numberOfChannels,duration:buffer.duration,peaks:computeWaveformPeaks(buffer.getChannelData(0),Math.min(8000,Math.ceil(buffer.duration*200))),provenance:plan.original.filePath?{path:plan.original.filePath,offset:plan.clip.sourceEdit!.offset,rate:1}:undefined};
  if(token){check();await invoke('recording_conversion_protect',{token});}
  const next=sourcePluginRecallCommit(plan,prepared,source,check());
  publicationStarted=true;publish(next);
 }finally{
  if(token)try{await invoke('recording_conversion_finish',{token,keep:publicationStarted});}catch(error){console.warn('Source effect conversion finalization deferred',error);}
 }
}
