import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import { useProjectStore } from '../../stores/projectStore';
import { editTimeRange, planRangeTransitionCuts, RangeEditError, type RangeOperation } from '../../lib/rangeEdits';

/** Preview scope and errors before a single undoable arrangement commit. */
export function RangeEditDialog({onClose}:{onClose:()=>void}) {
  const {t}=useTranslation();
  const project=useProjectStore(s=>s.project),range=project.editRange;
  const [ids,setIds]=useState(()=>project.tracks.filter(t=>t.rippleEnabled!==false).map(t=>t.id));
  const [picture,setPicture]=useState(()=>!!project.video&&project.video.rippleEnabled!==false);
  const [global,setGlobal]=useState(()=>!!project.video||!project.tracks.some(t=>t.rippleEnabled===false));
  const [operation,setOperation]=useState<RangeOperation>('extract');
  const [transitionPolicy,setTransitionPolicy]=useState<'preserve'|'cut'>('preserve');
  const review=useMemo(()=>{try{return picture&&range?planRangeTransitionCuts(project,range.start,range.end,operation):[];}catch{return [];}},[project,range,picture,operation]);
  const [notice,setNotice]=useState('');
  const preview=useMemo(()=>{
    try{return {project:range?editTimeRange(project,range.start,range.end,operation,{trackIds:ids,includeVideo:picture,retimeGlobal:global,transitionPolicy}):undefined};}
    catch(error){return {error:error instanceof RangeEditError?t(error.message):String(error)};}
  },[project,range,operation,ids,picture,global,transitionPolicy,t]);
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
      <label className="block">{t('rangeEdits.operation')}<select aria-label={t('rangeEdits.operation')} className="block w-full p-2 mt-1 bg-gray-800 rounded" value={operation} onChange={e=>setOperation(e.target.value as RangeOperation)}>
        {(['lift','extract','insert'] as const).map(op=><option key={op} value={op}>{t(`rangeEdits.${op}`)}</option>)}
      </select></label>
      <fieldset className="space-y-2"><legend className="mb-2">{t('rangeEdits.tracks')}</legend>
        {project.tracks.map(track=><label key={track.id} className="flex gap-2 items-center min-h-9"><input type="checkbox" checked={ids.includes(track.id)} onChange={e=>setIds(old=>e.target.checked?[...old,track.id]:old.filter(id=>id!==track.id))}/><span>{track.name}</span>{track.locked&&<span className="text-amber-300">{t('rangeEdits.lockedLabel')}</span>}</label>)}
        {project.video&&<label className="flex gap-2 items-center min-h-9"><input type="checkbox" checked={picture} onChange={e=>setPicture(e.target.checked)}/>{t('video.track')}{project.video.locked&&<span className="text-amber-300">{t('rangeEdits.lockedLabel')}</span>}</label>}
      </fieldset>
      <label className="flex gap-2 items-center min-h-9"><input type="checkbox" checked={global} onChange={e=>setGlobal(e.target.checked)}/>{t('rangeEdits.global')}</label>
      <p className="text-xs text-gray-400">{t('rangeEdits.linkHelp')}</p>
      {review.length>0&&<div className="space-y-2 rounded border border-gray-700 p-3">
        <label className="block">{t('rangeEdits.transitionPolicy')}<select aria-label={t('rangeEdits.transitionPolicy')} className="block w-full p-2 mt-1 bg-gray-800 rounded" value={transitionPolicy} onChange={e=>setTransitionPolicy(e.target.value as 'preserve'|'cut')}>
          <option value="preserve">{t('rangeEdits.preserveTransitions')}</option><option value="cut">{t('rangeEdits.cutTransitions')}</option>
        </select></label>
        <p className="text-xs text-gray-400">{t('rangeEdits.cutExplanation')}</p>
        <ul className="space-y-1">{review.map(c=><li key={c.clipId}>{t(c.resultingCutTime===null?'rangeEdits.cutReviewRemoved':'rangeEdits.cutReview',{kind:t(`editing.transition_${c.transition}`),start:c.start.toFixed(3),end:c.end.toFixed(3),cut:c.resultingCutTime?.toFixed(3)})}</li>)}</ul>
      </div>}
      {preview.project&&<p>{t('rangeEdits.duration',{before:project.duration.toFixed(3),after:preview.project.duration.toFixed(3)})}</p>}
      {(preview.error||notice)&&<p role={preview.error?'alert':'status'} className="text-amber-300">{preview.error||notice}</p>}
      <div className="flex flex-wrap gap-2"><button className="timeline-tool" onClick={saveScope}>{t('rangeEdits.saveScope')}</button><button className="timeline-tool bg-indigo-600 disabled:opacity-30" disabled={!preview.project} onClick={apply}>{t('rangeEdits.apply')}</button></div>
    </div>
  </Modal>;
}
