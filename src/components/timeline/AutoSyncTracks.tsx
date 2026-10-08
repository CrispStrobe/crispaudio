import { ToolButton } from '../common/ToolButton';
import { AudioLines } from 'lucide-react';
import { isIOSApp } from '../../lib/native';
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { timelineDuration } from '../../lib/timelineView';
import { analysisTrack, shiftedTrack, syncPayload } from '../../lib/trackSync';
import type { Alignment } from '../../lib/media';
import { Modal } from '../common/Modal';
export function AutoSyncTracks({onError}:{onError:(error:string)=>void}) {
  const {t}=useTranslation(), tracks=useProjectStore(s=>s.project.tracks);
  const [show,setShow]=useState(false),[reference,setReference]=useState(''),[selected,setSelected]=useState<string[]>([]);
  const [error,setError]=useState('');
  const report=(message:string)=>{setError(message);onError(message);};
  const [busy,setBusy]=useState(false),[results,setResults]=useState<{id:string;alignment:Alignment}[]>([]);
  const [snapshot,setSnapshot]=useState(useProjectStore.getState().project);
  const native='__TAURI_INTERNALS__' in window && !isIOSApp();
  const analyze=async()=>{
    setBusy(true);report('');setResults([]);
    try {
      const state=useProjectStore.getState();state.setIsPlaying(false);setSnapshot(state.project);
      const ref=analysisTrack(state.project.tracks.find(track=>track.id===reference)!,state.sources);
      const next=[];
      for(const id of selected.filter(id=>id!==reference)){
        const target=analysisTrack(state.project.tracks.find(track=>track.id===id)!,state.sources);
        const alignment=await invoke<Alignment>('estimate_track_sync',syncPayload(ref,target));
        next.push({id,alignment});
      }
      setResults(next);
    }catch(err){report(String(err));}finally{setBusy(false);}
  };
  return <>
    <ToolButton icon={AudioLines} label={t('sync.title')} disabled={!native || tracks.filter(track=>track.segments.length).length<2} title={!native?t('sync.desktop'):t('sync.title')} onClick={()=>{setReference(tracks.find(track=>track.segments.length)!.id);setSelected(tracks.filter(track=>track.segments.length).map(track=>track.id));setResults([]);setShow(true);}}/>
    <Modal isOpen={show} onClose={()=>{if(!busy)setShow(false);}} title={t('sync.title')} widthClass="max-w-2xl">
      {error && <p role="alert" className="text-amber-300 mb-3">{error}</p>}
      <p className="text-sm text-gray-300 mb-3">{t('sync.help')}</p>
      <label className="text-sm text-gray-200">{t('alignment.reference')} <select disabled={busy} className="bg-gray-800 min-h-11 rounded px-3" value={reference} onChange={e=>{setReference(e.target.value);setResults([]);}}>{tracks.filter(track=>track.segments.length).map(track=><option key={track.id} value={track.id}>{track.name}</option>)}</select></label>
      {tracks.filter(track=>track.segments.length && track.id!==reference).map(track=><label key={track.id} className="min-h-11 flex gap-3 items-center text-gray-200"><input disabled={busy} type="checkbox" checked={selected.includes(track.id)} onChange={e=>{setSelected(old=>e.target.checked?[...old,track.id]:old.filter(id=>id!==track.id));setResults([]);}}/>{track.name}</label>)}
      <button className="timeline-tool" disabled={busy || !selected.some(id=>id!==reference)} onClick={()=>void analyze()}>{t(busy?'sync.analyzing':'sync.analyze')}</button>
      {results.map(({id,alignment:a})=><p key={id} className={`text-sm mt-3 ${a.reliable?'text-green-300':'text-amber-300'}`}>{tracks.find(track=>track.id===id)?.name}: {a.offset.toFixed(4)} s · {(1e6*(a.rate-1)).toFixed(1)} ppm · {t(a.reliable?'interview.reliable':'interview.uncertain')}</p>)}
      {!!results.length && <><p className="text-sm text-amber-200 my-3">{t('sync.offsetOnly')}</p><button className="timeline-tool" disabled={busy || results.some(r=>!r.alignment.reliable)} onClick={()=>{
        const state=useProjectStore.getState();if(state.project!==snapshot){report(t('sync.changed'));return;}
        const offsets=new Map(results.map(r=>[r.id,r.alignment.offset]));
        const project={...state.project,tracks:state.project.tracks.map(track=>offsets.has(track.id)?shiftedTrack(track,offsets.get(track.id)!):track)};
        useProjectStore.setState({project:{...project,duration:timelineDuration(project)},selection:null,isPlaying:false});setShow(false);
      }}>{t('sync.apply')}</button></>}
    </Modal>
  </>;
}
