import {invoke} from '@tauri-apps/api/core';
import type {AudioSource,TimelineProject} from '../../types/audio';
import type {NativeRecordingManifest} from '../../lib/nativeRecordingTakes';
import {publishNativeRecordingGroup,prepareNativeRecordingGroup} from '../../lib/nativeRecordingTakes';
import {validNativeImportId} from '../../lib/nativeRecordingImports';
import {loadNativeRecordingSources} from './NativeRecordingController';
export interface RecoveryCandidate {kind:'complete'|'interrupted';importId:string;group:string;projectId:string;tracks:string[];outputEndFrame:number;recovered:boolean}
export interface RecoveryDiscovery {candidates:RecoveryCandidate[];scanned:number;rejected:number;truncated:boolean}
export interface RecoveryResult {phase:'complete'|'recovered';incomplete:boolean;group:string;directory:string;manifest:NativeRecordingManifest;reasons:(string|null)[]}
export interface RecoveryReview {candidate:RecoveryCandidate;result:RecoveryResult;loaded:Map<string,AudioSource>;snapshot:TimelineProject}
const managed=(id:string)=>/^native-group-[A-Za-z0-9_-]+$/.test(id)&&id.length<=128;
function invalid():never {throw new Error('recording.timingInvalid');}
export const NativeRecordingRecovery={
 async discover(){
  const value=await invoke<RecoveryDiscovery>('native_recording_discover');
  if(!value||!Array.isArray(value.candidates)||value.candidates.length>64||!Number.isInteger(value.scanned)||value.scanned<0||value.scanned>512||!Number.isInteger(value.rejected)||value.rejected<0||typeof value.truncated!=='boolean')invalid();
  const groups=new Set<string>();
  for(const c of value.candidates){if(!c||!['complete','interrupted'].includes(c.kind)||!managed(c.group)||groups.has(c.group)||!validNativeImportId(c.importId)||!validNativeImportId(c.projectId)||!Array.isArray(c.tracks)||!c.tracks.length||c.tracks.length>8||new Set(c.tracks).size!==c.tracks.length||c.tracks.some(id=>!validNativeImportId(id))||!Number.isSafeInteger(c.outputEndFrame)||c.outputEndFrame<0||typeof c.recovered!=='boolean')invalid();groups.add(c.group);}
  return value;
 },
 async review(candidate:RecoveryCandidate,snapshot:TimelineProject,context:BaseAudioContext,sourceName:string,signal:AbortSignal):Promise<RecoveryReview>{
  if(!managed(candidate.group))invalid();
  if(candidate.projectId!==snapshot.id)throw new Error('recording.projectChanged');
  if(snapshot.nativeRecordingImports?.includes(candidate.importId))throw new Error('recording.recoveryAlreadyImported');
  signal.throwIfAborted();
  const result=await invoke<RecoveryResult>('native_recording_recover',{group:candidate.group});
  signal.throwIfAborted();
  if(!result||result.group!==candidate.group||result.phase!==(candidate.kind==='complete'?'complete':'recovered')||result.incomplete!==(candidate.kind==='interrupted')||typeof result.directory!=='string'||!result.directory||/[\p{Cc}]/u.test(result.directory)||!result.directory.replace(/\/+$/,'').endsWith(`/${candidate.group}${candidate.kind==='interrupted'?'/recovered-v1':''}`)||result.manifest?.timing?.intent.context?.scope!==candidate.importId||result.manifest.timing.intent.projectId!==snapshot.id||!Array.isArray(result.manifest.clips)||result.manifest.clips.length!==candidate.tracks.length||result.manifest.clips.some(c=>!c||!candidate.tracks.includes(c.track_id)))invalid();
  const loaded=await loadNativeRecordingSources(result.directory,result.manifest,{targets:candidate.tracks.map(trackId=>({trackId})),context,sampleRate:snapshot.sampleRate,sourceName},signal);
  signal.throwIfAborted();prepareNativeRecordingGroup(result.directory,result.manifest,loaded,sourceName);
  return {candidate,result,loaded,snapshot};
 },
 insert(review:RecoveryReview,current:TimelineProject,sources:Map<string,AudioSource>,takeName:string,crossfade:number){
  const {result,snapshot,loaded}=review;
  return publishNativeRecordingGroup(result.directory,result.manifest,loaded,snapshot,current,sources,takeName,crossfade,undefined,result.incomplete);
 }
};
