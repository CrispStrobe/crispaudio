import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Modal} from '../common/Modal';
import {useProjectStore} from '../../stores/projectStore';
import {pasteGainEnvelope,pastePanEnvelope,type GainEnvelope} from '../../lib/gainEnvelope';
import type {TimelineProject} from '../../types/audio';

/** Review a bounded replacement without touching project state until Apply. */
export function GainEnvelopePaste({project,trackId,envelope,onClose}:{project:TimelineProject;trackId:string;envelope:GainEnvelope;onClose:()=>void}) {
  const {t}=useTranslation(),isPan=envelope.parameter==='pan';
  const [time,setTime]=useState(String(project.editRange?.start??useProjectStore.getState().playheadPosition));
  const [duration,setDuration]=useState(String(project.editRange?project.editRange.end-project.editRange.start:envelope.duration));
  const current=useProjectStore(s=>s.project);
  const track=project.tracks.find(t=>t.id===trackId);
  let error='',preview:TimelineProject|undefined;
  try {
    if(current!==project)throw new Error('automation.changed');
    if(!time.trim()||!duration.trim())throw new Error('automation.bounds');
    preview=(isPan?pastePanEnvelope:pasteGainEnvelope)(project,trackId,envelope,Number(time),Number(duration));
  } catch(reason) {error=t(reason instanceof Error?reason.message:String(reason));}
  const replaced=((isPan?track?.panAutomation:track?.automation)??[]).filter(p=>p.time>=Number(time)-1/project.sampleRate&&p.time<=Number(time)+Number(duration)+1/project.sampleRate).length;
  return <Modal isOpen onClose={onClose} title={t(isPan?'automation.panPaste':'automation.paste')}>
    <form className="space-y-3 text-sm" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onClose();}}} onSubmit={e=>{
      e.preventDefault();if(!preview||useProjectStore.getState().project!==project)return;
      if(preview!==project)useProjectStore.setState({project:preview});onClose();
    }}>
      <p className="text-gray-300 break-words">{envelope.sourceName??t('automation.title')} → {track?.name}</p>
      <p className="text-xs text-gray-400">{t('automation.copiedRange',{start:(envelope.sourceStart??0).toFixed(3),end:((envelope.sourceStart??0)+envelope.duration).toFixed(3)})}</p>
      <div className="flex flex-wrap gap-3">
        <label className="flex-1 min-w-28">{t('automation.destination')}<input autoFocus aria-label={t('automation.destination')} type="number" min={0} step="any" value={time} onChange={e=>setTime(e.target.value)} className="block w-full min-h-11 bg-gray-800 rounded p-2"/></label>
        <label className="flex-1 min-w-28">{t('automation.length')}<input aria-label={t('automation.length')} type="number" min={1/project.sampleRate} step="any" value={duration} onChange={e=>setDuration(e.target.value)} className="block w-full min-h-11 bg-gray-800 rounded p-2"/></label>
      </div>
      {error?<p role="alert" className="text-amber-300 text-xs">{error}</p>:<p className="text-xs text-gray-400">{t('automation.replaceReview',{count:replaced,end:(Number(time)+Number(duration)).toFixed(3),factor:(Number(duration)/envelope.duration).toFixed(3)})}</p>}
      <p className="text-xs text-gray-400">{t(isPan?'automation.panPasteHelp':'automation.pasteHelp')}</p>
      <div className="flex justify-end gap-2"><button type="button" className="timeline-tool" onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="timeline-tool bg-indigo-700" disabled={!preview}>{t('automation.applyPaste')}</button></div>
    </form>
  </Modal>;
}
