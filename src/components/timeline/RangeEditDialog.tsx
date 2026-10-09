import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import { useProjectStore } from '../../stores/projectStore';
import { editTimeRange, RangeEditError, type RangeOperation } from '../../lib/rangeEdits';

/** Preview scope and errors before a single undoable arrangement commit. */
export function RangeEditDialog({onClose}:{onClose:()=>void}) {
  const {t}=useTranslation();
  const project=useProjectStore(s=>s.project),range=project.editRange;
  const [ids,setIds]=useState(()=>project.tracks.filter(t=>t.rippleEnabled!==false).map(t=>t.id));
  const [picture,setPicture]=useState(()=>!!project.video&&project.video.rippleEnabled!==false);
  const [global,setGlobal]=useState(()=>!!project.video||!project.tracks.some(t=>t.rippleEnabled===false));
  const [operation,setOperation]=useState<RangeOperation>('extract');
  const [notice,setNotice]=useState('');
  const preview=useMemo(()=>{
    try{return {project:range?editTimeRange(project,range.start,range.end,operation,{trackIds:ids,includeVideo:picture,retimeGlobal:global}):undefined};}
    catch(error){return {error:error instanceof RangeEditError?t(error.message):String(error)};}
  },[project,range,operation,ids,picture,global,t]);
  const apply=()=>{
    const state=useProjectStore.getState();
    if(state.project!==project){setNotice(t('rangeEdits.changed'));return;}
    if(!preview.project)return;
    useProjectStore.setState({project:preview.project,isPlaying:false,rangePlayback:false,selection:null,playheadPosition:Math.min(range!.start,preview.project.duration)});
    if(useProjectStore.getState().project===preview.project)onClose();
  };
  const saveScope=()=>{
    useProjectStore.setState(state=>({project:{...state.project,tracks:state.project.tracks.map(track=>({...track,rippleEnabled:ids.includes(track.id)})),video:state.project.video?{...state.project.video,rippleEnabled:picture}:undefined}}));
    setNotice(t('rangeEdits.scopeSaved'));
  };
  return <Modal isOpen onClose={onClose} title={t('rangeEdits.title')} widthClass="max-w-lg">
    <div className="space-y-3 text-sm text-gray-200">
      <p className="text-gray-400">{t('rangeEdits.explain')}</p>
      <label className="block">{t('rangeEdits.operation')}<select className="block w-full p-2 mt-1 bg-gray-800 rounded" value={operation} onChange={e=>setOperation(e.target.value as RangeOperation)}>
        {(['lift','extract','insert'] as const).map(op=><option key={op} value={op}>{t(`rangeEdits.${op}`)}</option>)}
      </select></label>
      <fieldset className="space-y-2"><legend className="mb-2">{t('rangeEdits.tracks')}</legend>
        {project.tracks.map(track=><label key={track.id} className="flex gap-2 items-center min-h-9"><input type="checkbox" checked={ids.includes(track.id)} onChange={e=>setIds(old=>e.target.checked?[...old,track.id]:old.filter(id=>id!==track.id))}/><span>{track.name}</span>{track.locked&&<span className="text-amber-300">{t('rangeEdits.lockedLabel')}</span>}</label>)}
        {project.video&&<label className="flex gap-2 items-center min-h-9"><input type="checkbox" checked={picture} onChange={e=>setPicture(e.target.checked)}/>{t('video.track')}{project.video.locked&&<span className="text-amber-300">{t('rangeEdits.lockedLabel')}</span>}</label>}
      </fieldset>
      <label className="flex gap-2 items-center min-h-9"><input type="checkbox" checked={global} onChange={e=>setGlobal(e.target.checked)}/>{t('rangeEdits.global')}</label>
      <p className="text-xs text-gray-400">{t('rangeEdits.linkHelp')}</p>
      {preview.project&&<p>{t('rangeEdits.duration',{before:project.duration.toFixed(3),after:preview.project.duration.toFixed(3)})}</p>}
      {(preview.error||notice)&&<p role={preview.error?'alert':'status'} className="text-amber-300">{preview.error||notice}</p>}
      <div className="flex flex-wrap gap-2"><button className="timeline-tool" onClick={saveScope}>{t('rangeEdits.saveScope')}</button><button className="timeline-tool bg-indigo-600 disabled:opacity-30" disabled={!preview.project} onClick={apply}>{t('rangeEdits.apply')}</button></div>
    </div>
  </Modal>;
}
