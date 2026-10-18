import {invoke} from '@tauri-apps/api/core';
import {encodeAudioBufferWav} from '../../lib/wavExport';
import {publishNativeRecordingGroup} from '../../lib/nativeRecordingTakes';
import type {AudioSource,TimelineProject} from '../../types/audio';
import type {RecoveryReview} from './NativeRecordingRecovery';
type State={project:TimelineProject;sources:Map<string,AudioSource>;isPlaying:boolean};
/** Own every derived conversion until synchronous editor publication starts.
 * Retain on an uncertain publication outcome: a store subscriber may throw after
 * the state/Undo already references the files. Never roll those files back. */
export async function importRecoveredTakes(review:RecoveryReview,current:()=>State,publish:(next:{project:TimelineProject;sources:Map<string,AudioSource>})=>void,takeName:string,crossfade:number,signal:AbortSignal){
 const loaded=new Map(review.loaded);
 const check=()=>{signal.throwIfAborted();const state=current();if(state.project!==review.snapshot)throw new Error('recording.projectChanged');if(state.isPlaying)throw new Error('recording.recoveryStopPlayback');return state;};
 let token:string|undefined,publicationStarted=false;
 try{
  check();
  for(const [id,source] of loaded){
   if(source.buffer.sampleRate===48000||source.filePath)continue;
   check();const wav=await encodeAudioBufferWav(source.buffer,32,signal);check();
   if(!token){token=crypto.randomUUID();await invoke<void>('recording_conversion_begin',{token});check();}
   const bytes=new Uint8Array(await wav.arrayBuffer());check();
   const filePath=await invoke<string>('recording_conversion_write',bytes,{headers:{'x-conversion-token':token}});
   check();if(typeof filePath!=='string'||!filePath)throw new Error('recording.timingInvalid');loaded.set(id,{...source,filePath});
  }
  if(token){check();await invoke<void>('recording_conversion_protect',{token});}
  const state=check();
  const next=publishNativeRecordingGroup(review.result.directory,review.result.manifest,loaded,review.snapshot,state.project,state.sources,takeName,crossfade,undefined,review.result.incomplete);
  // No await between final validation and publication. Protect before any project,
  // Undo or synchronous subscriber can observe the new source paths.
  publicationStarted=true;publish(next);
 }finally{
  if(token){
   try{await invoke<void>('recording_conversion_finish',{token,keep:publicationStarted});}
   catch(error){console.warn('Recovery conversion finalization deferred',error);}
  }
 }
}
