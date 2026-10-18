import {useContext,useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {invoke} from '@tauri-apps/api/core';
import {TimelineEngineContext} from './timelineEngineContext';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {freezeTrack,prepareTrackFreeze,thawTrack} from '../../lib/trackFreeze';
import {projectSourceIds,validateFrozenProjectAudio} from '../../lib/projectFile';
import {computeWaveformPeaks} from '../../audio/utils/audioBufferUtils';
import {encodeSourceBufferWav} from '../../lib/wavExport';
import {Modal} from '../common/Modal';
import {InfoButton} from '../common/InfoButton';
import {NumberField} from './NumberField';
export function TrackFreezeControls(){
 const {t}=useTranslation(),engine=useContext(TimelineEngineContext),project=useProjectStore(s=>s.project),recording=useUIStore(s=>s.timelineRecording),[trackId,setTrackId]=useState<string>(),[tail,setTail]=useState(2),[busy,setBusy]=useState(false),[error,setError]=useState(''),job=useRef<AbortController|null>(null),alive=useRef(true);
 const close=()=>{job.current?.abort();setTrackId(undefined);};
 useEffect(()=>{alive.current=true;const open=(event:Event)=>{if(useUIStore.getState().timelineRecording)return;job.current?.abort();useProjectStore.getState().setIsPlaying(false);setError('');setTrackId((event as CustomEvent<string>).detail);};window.addEventListener('crispaudio-track-freeze',open);return()=>{alive.current=false;job.current?.abort();window.removeEventListener('crispaudio-track-freeze',open);};},[]);
 useEffect(()=>useProjectStore.subscribe((state,previous)=>{if(state.project!==previous.project||state.sources!==previous.sources||state.isPlaying&&!previous.isPlaying)job.current?.abort();if(state.project.id!==previous.project.id)setTrackId(undefined);}),[]);
 useEffect(()=>{if(recording)job.current?.abort();},[recording]);
 const track=project.tracks.find(t=>t.id===trackId);
 const run=async()=>{
  if(!track||recording||busy||!engine?.current)return;
  const state=useProjectStore.getState(),snapshot=state.project,sources=state.sources;
  if(state.isPlaying||useUIStore.getState().timelineRecording)return;
  if(track.freeze){try{validateFrozenProjectAudio(snapshot,sources);const retained={...snapshot,tracks:snapshot.tracks.map(tr=>tr.id===track.id?thawTrack(tr):tr)};if([...projectSourceIds(retained)].some(id=>!sources.has(id)))throw new Error('freeze.missing');useProjectStore.setState({project:retained,selection:null});close();}catch(e){setError(t(e instanceof Error?e.message:String(e)));}return;}
  const controller=new AbortController();job.current=controller;const signal=controller.signal;setBusy(true);setError('');
  try{
   const plan=prepareTrackFreeze(snapshot,track.id,sources,tail),buffer=await engine.current.renderToBuffer(plan.renderProject,0,undefined,signal,sources);signal.throwIfAborted();
   if(Math.abs(buffer.length-plan.frames)>1||buffer.sampleRate!==snapshot.sampleRate||buffer.numberOfChannels!==2)throw new Error('freeze.failed');
   // Reject invalid render output before it can be persisted or published.
   for(let ch=0;ch<2;ch++){const pcm=buffer.getChannelData(ch);for(let i=0;i<buffer.length;i++){if(!Number.isFinite(pcm[i]))throw new Error('freeze.failed');if(i%65536===65535){await new Promise<void>(resolve=>setTimeout(resolve,0));signal.throwIfAborted();}}}
   let filePath:string|undefined;
   if('__TAURI_INTERNALS__' in window){const wav=await encodeSourceBufferWav(buffer);signal.throwIfAborted();filePath=await invoke<string>('persist_recording',new Uint8Array(await wav.arrayBuffer()));}
   signal.throwIfAborted();const current=useProjectStore.getState();if(!alive.current||current.project!==snapshot||current.sources!==sources||current.isPlaying||useUIStore.getState().timelineRecording)throw new Error('freeze.changed');
   const id=crypto.randomUUID(),source={id,name:`${track.name} · ${t('freeze.frozen')}`,buffer,peaks:computeWaveformPeaks(buffer.getChannelData(0),Math.min(8000,Math.ceil(buffer.duration*200))),duration:buffer.duration,sampleRate:buffer.sampleRate,channels:2,filePath};
   const candidate=freezeTrack(snapshot,track.id,source,tail),nextSources=new Map([...sources,[id,source]]);validateFrozenProjectAudio(candidate,nextSources);
   useProjectStore.setState({project:candidate,sources:nextSources,selection:null,isPlaying:false});setTrackId(undefined);
  }catch(e){if(alive.current&&!signal.aborted)setError(t(e instanceof Error?e.message:String(e)));}
  finally{if(job.current===controller){job.current=null;if(alive.current)setBusy(false);}}
 };
 return <Modal isOpen={!!track} onClose={close} title={t(track?.freeze?'freeze.thaw':'freeze.title')} widthClass="max-w-sm"><div className="space-y-3 text-sm" data-track-freeze><div className="flex items-center gap-2"><strong className="truncate flex-1">{track?.name}</strong><InfoButton label={t('freeze.info')}>{t('freeze.help')}</InfoButton></div>{!track?.freeze&&<label className="flex items-center justify-between gap-2">{t('freeze.tail')}<NumberField label={t('freeze.tail')} value={tail} min={0} max={30} step={.1} disabled={busy} onCommit={value=>{setTail(value);return true;}}/></label>}{busy&&<p role="status">{t('freeze.rendering')}</p>}{error&&<p role="alert" className="text-amber-300">{error}</p>}<div className="flex justify-end gap-2"><button className="timeline-tool" onClick={close}>{t('common.cancel')}</button><button className="timeline-tool !bg-indigo-600" disabled={recording||busy} onClick={()=>void run()}>{t(track?.freeze?'freeze.thaw':'freeze.title')}</button></div></div></Modal>;
}
