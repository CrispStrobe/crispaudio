import {useTimelineTool} from '../../hooks/useTimelineTool';
import {decodeDerivedAudio} from '../../lib/derivedAudio';
import {isIOSApp} from '../../lib/native';
import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {invoke} from '@tauri-apps/api/core';
import {readFile} from '@tauri-apps/plugin-fs';
import {useProjectStore} from '../../stores/projectStore';
import {Modal} from '../common/Modal';
import {NumberField} from './NumberField';
import {planRetime,applyRetime,type RetimeOptions} from '../../lib/clipRetime';
import {mediaJob} from '../../lib/mediaJob';
import {encodeAudioBufferWav} from '../../lib/wavExport';
import {computeWaveformPeaks} from '../../audio/utils/audioBufferUtils';
import type {TimelineProject,AudioSource} from '../../types/audio';
const defaults:RetimeOptions={rate:1,reverse:false,preservePitch:true,semitones:0};
export function ClipRetimeControls({launcher=true}:{launcher?:boolean}={}){
 const {t}=useTranslation(),selection=useProjectStore(s=>s.selection),[open,setOpen]=useState(false),[settings,setSettings]=useState(defaults),[busy,setBusy]=useState(false),[error,setError]=useState(''),[review,setReview]=useState<{snapshot:TimelineProject;project:TimelineProject;sources:Map<string,AudioSource>;count:number}>();
 const controller=useRef<AbortController|null>(null);useEffect(()=>()=>controller.current?.abort(),[]);
 const prepare=async(restore=false)=>{
  controller.current?.abort();const abort=new AbortController();controller.current=abort;setBusy(true);setError('');setReview(undefined);
  try{
   const state=useProjectStore.getState(),snapshot=state.project,plans=planRetime(snapshot,state.selection?.segmentIds??[],settings,state.sources),sources=new Map(state.sources),derived=new Map<string,{id:string;path?:string;duration:number}>();
   if(!restore&&(!('__TAURI_INTERNALS__' in window)||isIOSApp()))throw new Error('retime.desktop');
   for(const plan of plans){
    abort.signal.throwIfAborted();if(restore)continue;
    const video=!('trackId' in plan.clip);let path=plan.original.path;
    if(!video){const source=sources.get(plan.original.sourceId!)!;path=source.filePath;if(!path){const wav=await encodeAudioBufferWav(source.buffer,32);path=await invoke<string>('persist_recording',new Uint8Array(await wav.arrayBuffer()));sources.set(source.id,{...source,filePath:path});}}
    if(!path)throw new Error('retime.bounds');
    const output=await mediaJob<string>('retime_media_asset',{path,settings:{...plan.settings,offset:plan.original.offset,duration:plan.original.duration,video,frameRate:snapshot.frameRate??25}},abort.signal),id=crypto.randomUUID();
    if(video){derived.set(plan.clip.id,{id,path:output,duration:plan.duration});}
    else{const bytes=await readFile(output),buffer=await decodeDerivedAudio(bytes,snapshot.sampleRate,abort.signal);abort.signal.throwIfAborted();sources.set(id,{id,name:'name' in plan.clip?plan.clip.name:t('retime.derived'),filePath:output,buffer,duration:buffer.duration,channels:buffer.numberOfChannels,sampleRate:buffer.sampleRate,peaks:computeWaveformPeaks(buffer.getChannelData(0),Math.min(8000,Math.ceil(buffer.duration*200)))});derived.set(plan.clip.id,{id,path:output,duration:buffer.duration});}
   }
   abort.signal.throwIfAborted();const project=applyRetime(snapshot,plans,derived,restore);if(useProjectStore.getState().project!==snapshot)throw new Error('retime.stale');setReview({snapshot,project,sources,count:plans.length});
  }catch(e){if(!abort.signal.aborted)setError(t(e instanceof Error?e.message:String(e)));}finally{if(controller.current===abort){controller.current=null;setBusy(false);}}
 };
 useTimelineTool('retime',()=>{if(useProjectStore.getState().selection?.segmentIds.length){setOpen(true);setReview(undefined);setError('');const state=useProjectStore.getState(),clip=state.project.tracks.flatMap(t=>t.segments).find(c=>state.selection?.segmentIds.includes(c.id))??state.project.video?.clips?.find(c=>state.selection?.segmentIds.includes(c.id));setSettings(clip?.retime??defaults);};});
    return <>{launcher && <button className="timeline-tool" disabled={!selection?.segmentIds.length} onClick={()=>{setOpen(true);setReview(undefined);setError('');const state=useProjectStore.getState(),clip=state.project.tracks.flatMap(t=>t.segments).find(c=>state.selection?.segmentIds.includes(c.id))??state.project.video?.clips?.find(c=>state.selection?.segmentIds.includes(c.id));setSettings(clip?.retime??defaults);}}>{t('retime.title')}</button>}<Modal isOpen={open} title={t('retime.title')} onClose={()=>{controller.current?.abort();setReview(undefined);setOpen(false);}}>
  <div className="space-y-3 text-sm"><p>{t('retime.help')}</p><fieldset disabled={busy} className="space-y-3">{(['rate','semitones'] as const).map(key=><label key={key} className="flex justify-between items-center gap-2">{t(`retime.${key}`)}<NumberField label={t(`retime.${key}`)} value={settings[key]} min={key==='rate'?.25:-24} step={key==='rate'?.05:1} onCommit={v=>{if(v>(key==='rate'?4:24))return false;setSettings(s=>({...s,[key]:v}));setReview(undefined);return true;}}/></label>)}{(['reverse','preservePitch'] as const).map(key=><label key={key} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={settings[key]} onChange={e=>{setSettings(s=>({...s,[key]:e.target.checked}));setReview(undefined);}}/>{t(`retime.${key}`)}</label>)}</fieldset>
  <p className="text-xs text-gray-400">{t('retime.quality')}</p><div className="flex flex-wrap gap-2"><button className="timeline-tool" disabled={busy} onClick={()=>void prepare()}>{t('retime.prepare')}</button><button className="timeline-tool" disabled={busy} onClick={()=>void prepare(true)}>{t('retime.restore')}</button>{busy&&<button className="timeline-tool" onClick={()=>controller.current?.abort()}>{t('audioExport.cancel')}</button>}</div>
  {review&&<div className="space-y-2"><p>{t('retime.review',{count:review.count,duration:review.project.duration.toFixed(3)})}</p><button className="timeline-tool" onClick={()=>{if(useProjectStore.getState().project!==review.snapshot){setError(t('retime.stale'));setReview(undefined);return;}useProjectStore.setState({project:review.project,sources:review.sources,isPlaying:false});setOpen(false);setReview(undefined);}}>{t('retime.apply')}</button></div>}{error&&<p role="alert" className="text-amber-300 break-words">{error}</p>}
  </div>
 </Modal></>;
}
