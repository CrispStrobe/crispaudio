import {invoke} from '@tauri-apps/api/core';
import {importRecoveredTakes} from './NativeRecordingConversionImport';
import type {AudioSource,TimelineProject} from '../../types/audio';
import type {NativeRecordingManifest} from '../../lib/nativeRecordingTakes';
import {publishNativeRecordingGroup,prepareNativeRecordingGroup} from '../../lib/nativeRecordingTakes';
import {validNativeImportId} from '../../lib/nativeRecordingImports';
import {loadNativeRecordingSources} from './NativeRecordingController';
export interface RecoveryCandidate {kind:'complete'|'interrupted';importId:string;group:string;projectId:string;tracks:string[];outputEndFrame:number;recovered:boolean}
export interface RecoveryDiscovery {candidates:RecoveryCandidate[];scanned:number;rejected:number;truncated:boolean;nextCursor?:string|null}
export interface RecoveryResult {phase:'complete'|'recovered';incomplete:boolean;group:string;directory:string;manifest:NativeRecordingManifest;reasons:(string|null)[]}
export interface RecoveryReview {candidate:RecoveryCandidate;result:RecoveryResult;loaded:Map<string,AudioSource>;snapshot:TimelineProject}
const managed=(id:string)=>/^native-group-[A-Za-z0-9_-]+$/.test(id)&&id.length<=128;
function invalid():never {throw new Error('recording.timingInvalid');}
export const NativeRecordingRecovery={
 async discover(cursor?:string|null,signal?:AbortSignal,project?:string){
  const scan=cursor??crypto.randomUUID();
  const cancel=()=>{void this.closeDiscovery(scan).catch(()=>{});};
  signal?.throwIfAborted();signal?.addEventListener('abort',cancel,{once:true});
  let value:RecoveryDiscovery,retained=false;
  try{value=await invoke<RecoveryDiscovery>('native_recording_discover',{scan,more:!!cursor,project:project??null});signal?.throwIfAborted();
  if(!value||!Array.isArray(value.candidates)||value.candidates.length>64||!Number.isInteger(value.scanned)||value.scanned<0||value.scanned>512||!Number.isInteger(value.rejected)||value.rejected<0||typeof value.truncated!=='boolean')invalid();
  const groups=new Set<string>();
  for(const c of value.candidates){if(!c||!['complete','interrupted'].includes(c.kind)||!managed(c.group)||groups.has(c.group)||!validNativeImportId(c.importId)||!validNativeImportId(c.projectId)||!Array.isArray(c.tracks)||!c.tracks.length||c.tracks.length>8||new Set(c.tracks).size!==c.tracks.length||c.tracks.some(id=>!validNativeImportId(id))||!Number.isSafeInteger(c.outputEndFrame)||c.outputEndFrame<0||typeof c.recovered!=='boolean')invalid();groups.add(c.group);}
  if(value.nextCursor!==undefined&&value.nextCursor!==null&&value.nextCursor!==scan)invalid();
  retained=!!value.nextCursor;return value;
  }finally{signal?.removeEventListener('abort',cancel);if(signal?.aborted||!retained)await this.closeDiscovery(scan).catch(()=>{});}
 },
 closeDiscovery(scan:string){return invoke<void>('native_recording_discovery_close',{scan});},
 async review(candidate:RecoveryCandidate,snapshot:TimelineProject,context:BaseAudioContext,sourceName:string,signal:AbortSignal,onProgress?:(blocks:number)=>void):Promise<RecoveryReview>{
  if(!managed(candidate.group))invalid();
  if(candidate.projectId!==snapshot.id)throw new Error('recording.projectChanged');
  if(snapshot.nativeRecordingImports?.includes(candidate.importId))throw new Error('recording.recoveryAlreadyImported');
  signal.throwIfAborted();
  let job:string|undefined,closing:Promise<RecoveryResult>|undefined;
  const close=(cancel:boolean)=>closing??=invoke<RecoveryResult>('native_recording_recovery_close',{job,cancel});
  const cancel=()=>{if(job)void close(true).catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  let result:RecoveryResult;
  try{
   job=await invoke<string>('native_recording_recovery_start',{group:candidate.group});signal.throwIfAborted();
   for(;;){
    const status=await invoke<{phase:string;blocks:number}>('native_recording_recovery_status',{job});signal.throwIfAborted();
    if(!status||!['verifying','cancelling','complete','cancelled','fault'].includes(status.phase)||!Number.isSafeInteger(status.blocks)||status.blocks<0)invalid();
    onProgress?.(status.blocks);
    if(['complete','cancelled','fault'].includes(status.phase)){result=await close(false);break;}
    await new Promise<void>(resolve=>setTimeout(resolve,80));signal.throwIfAborted();
   }
  }catch(error){if(signal.aborted)signal.throwIfAborted();throw error;}
  finally{signal.removeEventListener('abort',cancel);if(job)await close(true).catch(()=>{});}

  signal.throwIfAborted();
  if(!result||result.group!==candidate.group||result.phase!==(candidate.kind==='complete'?'complete':'recovered')||result.incomplete!==(candidate.kind==='interrupted')||typeof result.directory!=='string'||!result.directory||/[\p{Cc}]/u.test(result.directory)||!result.directory.replace(/\/+$/,'').endsWith(`/${candidate.group}${candidate.kind==='interrupted'?'/recovered-v1':''}`)||result.manifest?.timing?.intent.context?.scope!==candidate.importId||result.manifest.timing.intent.projectId!==snapshot.id||!Array.isArray(result.manifest.clips)||result.manifest.clips.length!==candidate.tracks.length||result.manifest.clips.some(c=>!c||!candidate.tracks.includes(c.track_id)))invalid();
  const loaded=await loadNativeRecordingSources(result.directory,result.manifest,{targets:candidate.tracks.map(trackId=>({trackId})),context,sampleRate:snapshot.sampleRate,sourceName,persistConverted:false},signal);
  signal.throwIfAborted();prepareNativeRecordingGroup(result.directory,result.manifest,loaded,sourceName);
  return {candidate,result,loaded,snapshot};
 },
 importTakes:importRecoveredTakes,
 insert(review:RecoveryReview,current:TimelineProject,sources:Map<string,AudioSource>,takeName:string,crossfade:number){
  const {result,snapshot,loaded}=review;
  if([...loaded.values()].some(source=>source.buffer.sampleRate!==48000&&!source.filePath))throw new Error('recording.recoveryReview');
  return publishNativeRecordingGroup(result.directory,result.manifest,loaded,snapshot,current,sources,takeName,crossfade,undefined,result.incomplete);
 }
};
