import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {RefreshCw,Square} from 'lucide-react';
import {NativeRecordingRecovery as recovery,type RecoveryDiscovery,type RecoveryReview} from '../../audio/plugins/NativeRecordingRecovery';
import {useProjectStore} from '../../stores/projectStore';
import {InfoButton} from '../common/InfoButton';
import {ToolButton} from '../common/ToolButton';
export function NativeRecordingRecovery({context,disabled,crossfade,onBusy}:{context:()=>BaseAudioContext;disabled:boolean;crossfade:number;onBusy:(busy:boolean)=>void}){
 const {t}=useTranslation(),project=useProjectStore(s=>s.project),playing=useProjectStore(s=>s.isPlaying);
 const [storedFound,setFound]=useState<{projectId:string;result:RecoveryDiscovery}>(),[selected,setSelected]=useState(''),[storedReview,setReview]=useState<RecoveryReview>(),[busy,setBusy]=useState(false),[blocks,setBlocks]=useState(0),[page,setPage]=useState(1),[operation,setOperation]=useState<'scan'|'review'|'import'>('review'),[error,setError]=useState(''),[imported,setImported]=useState(false);
 const job=useRef<AbortController|null>(null),alive=useRef(true),cursor=useRef<string|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;job.current?.abort();if(cursor.current){void recovery.closeDiscovery(cursor.current).catch(()=>{});cursor.current=null;}onBusy(false);};},[onBusy]);
 useEffect(()=>{job.current?.abort();},[project,disabled,playing]);
 useEffect(()=>()=>{if(cursor.current){void recovery.closeDiscovery(cursor.current).catch(()=>{});cursor.current=null;}},[project.id]);
 const found=storedFound?.projectId===project.id?storedFound.result:undefined;
 const review=!disabled&&storedReview?.snapshot===project?storedReview:undefined;
 const candidates=found?.candidates.filter(c=>c.projectId===project.id)??[],candidate=candidates.find(c=>c.group===selected)??candidates[0];
 const reason=candidate?.tracks.map(id=>{const track=project.tracks.find(track=>track.id===id);return !track||track.kind==='bus'?t('recording.recoveryMissing'):track.locked?t('recording.locked'):!track.recordArmed?t('recording.recoveryUnarmed'):'';}).find(Boolean);
 const already=!!candidate&&!!project.nativeRecordingImports?.includes(candidate.importId);
 const perform=async(action:(signal:AbortSignal)=>Promise<void>,operation:'scan'|'review'|'import'='review')=>{
  if(job.current||disabled||playing)return;const controller=new AbortController();job.current=controller;setBusy(true);onBusy(true);setError('');setImported(false);setBlocks(0);setOperation(operation);
  try{await action(controller.signal);}catch(error){if(!controller.signal.aborted){const message=error instanceof Error?error.message:String(error);if(message==='recording.recoveryRefresh'){cursor.current=null;setFound(value=>value?{...value,result:{...value.result,nextCursor:null}}:value);}setError(t(message));}}
  finally{if(job.current===controller){job.current=null;if(alive.current){setBusy(false);onBusy(false);}}}
 };
 const scan=(more=false)=>perform(async signal=>{setReview(undefined);if(!more&&cursor.current)await recovery.closeDiscovery(cursor.current);const result=await recovery.discover(more?cursor.current:undefined,signal,project.id);signal.throwIfAborted();cursor.current=result.nextCursor??null;setFound({projectId:project.id,result});setSelected('');setPage(value=>more?value+1:1);},'scan');
 const check=()=>perform(async signal=>{if(!candidate)return;setReview(undefined);const result=await recovery.review(candidate,project,context(),t('recording.captured'),signal,value=>{if(!signal.aborted)setBlocks(value);});signal.throwIfAborted();if(useProjectStore.getState().project!==project)throw new Error('recording.projectChanged');setReview(result);});
 const insert=()=>{if(!review)return;void perform(async signal=>{const prepared=await recovery.prepareImport(review,()=>useProjectStore.getState().project,signal);signal.throwIfAborted();const state=useProjectStore.getState();if(state.isPlaying)throw new Error('recording.recoveryStopPlayback');const next=recovery.insert(prepared,state.project,state.sources,t(prepared.result.incomplete?'recording.recoveryTake':'recording.take'),crossfade);useProjectStore.setState(next);setReview(undefined);setImported(true);},'import');};
 return <details data-recording-section="recovery"><summary className="min-h-11 content-center cursor-pointer border-t border-gray-800">{t('recording.recovery')}</summary><div className="space-y-2 pt-2">
  <div className="flex items-center justify-end gap-2"><ToolButton icon={RefreshCw} label={t('recording.recoveryScan')} disabled={disabled||playing||busy} onClick={()=>void scan()}/><InfoButton label={t('recording.recovery')}><p>{t('recording.recoveryHelp')}</p></InfoButton></div>
  {candidate&&<><label className="flex items-center gap-2 justify-between">{t('recording.recoveryGroup')}<select aria-label={t('recording.recoveryGroup')} disabled={disabled||busy} className="bg-gray-800 rounded min-h-11 min-w-0 w-44" value={candidate.group} onChange={event=>{setSelected(event.target.value);setReview(undefined);setImported(false);setError('');}}>{candidates.map(c=><option key={c.group} value={c.group}>{t(c.kind==='complete'?'recording.recoveryComplete':'recording.recoveryInterrupted')} · {c.group.slice(-6)}</option>)}</select></label>
   {!review&&<ul className="text-xs text-gray-400">{candidate.tracks.map(id=><li key={id}>{project.tracks.find(track=>track.id===id)?.name??t('recording.recoveryMissing')}</li>)}</ul>}
   {(already||reason)&&<p role="status" className="text-xs text-amber-300">{already?t('recording.recoveryAlreadyImported'):reason}</p>}
   {!review&&<button className="timeline-tool" disabled={disabled||playing||busy||already||!!reason} onClick={()=>void check()}>{t(busy?'recording.recoveryChecking':'recording.recoveryReview')}</button>}
  </>}
  {review&&<><p className="text-xs text-emerald-300" role="status">{t(review.result.incomplete?'recording.recoveryVerifiedPrefix':'recording.recoveryVerifiedComplete')}</p><div className="text-xs tabular-nums">{review.result.manifest.clips.map(clip=>{const placements=review.result.manifest.timing!.placements.filter(p=>p.trackId===clip.track_id);return <div key={clip.track_id} className="flex justify-between gap-2"><span className="truncate">{project.tracks.find(track=>track.id===clip.track_id)?.name}</span><span>{(placements.reduce((sum,p)=>sum+p.frames,0)/48000).toFixed(2)} s · {placements.length} {t('recording.recoveryPasses',{count:placements.length})}</span></div>;})}</div><button className="timeline-tool" disabled={disabled||playing||busy||already||!!reason} onClick={insert}>{t('recording.recoveryImport')}</button></>}
  {found&&!candidates.length&&<p className="text-xs text-gray-400">{t('recording.recoveryEmpty')}</p>}
  {found?.nextCursor&&<div className="flex justify-between items-center gap-2"><span className="text-xs text-gray-400">{t('recording.recoveryPage',{count:page})}</span><button className="timeline-tool" disabled={disabled||playing||busy} onClick={()=>void scan(true)}>{t('recording.recoveryNext')}</button></div>}
  {busy&&<div className="flex items-center gap-2"><progress className="min-w-0 flex-1" aria-label={t('recording.recoveryChecking')}/><output className="text-xs tabular-nums">{operation==='review'?t('recording.recoveryBlocks',{count:blocks}):t(operation==='scan'?'recording.recoverySearching':'recording.recoveryPreparingImport')}</output><ToolButton icon={Square} label={t('recording.recoveryCancel')} onClick={()=>job.current?.abort()}/></div>}
  {!!found?.rejected&&<p className="text-xs text-amber-300">{t('recording.recoveryRejected',{count:found.rejected})}</p>}
  {imported&&<p role="status" className="text-xs text-emerald-300">{t('recording.recoveryImported')}</p>}{error&&<p role="alert" className="text-xs text-amber-300 break-words">{error}</p>}
 </div></details>;
}
