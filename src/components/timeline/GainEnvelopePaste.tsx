import {NumberField} from './NumberField';
import {pasteEffectEnvelope,type EffectEnvelope} from '../../lib/effectEnvelope';
import {useState,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {Modal} from '../common/Modal';
import {useProjectStore} from '../../stores/projectStore';
import {pasteGainEnvelope,pastePanEnvelope,type GainEnvelope} from '../../lib/gainEnvelope';
import type {TimelineProject} from '../../types/audio';

/** Review a bounded replacement without touching project state until Apply. */
export function GainEnvelopePaste({project,trackId,envelope,effectIndex,onClose}:{project:TimelineProject;trackId:string;envelope:GainEnvelope|EffectEnvelope;effectIndex?:number;onClose:()=>void}) {
  const {t}=useTranslation(),isPan=envelope.parameter==='pan',isFx='effectType' in envelope;
  const title=isFx?(envelope.parameter==='rate'?'automation.chorusRatePaste':envelope.parameter==='depth'?'automation.chorusDepthPaste':envelope.effectType!=='delay'?`automation.${envelope.effectType}MixPaste`:`automation.${envelope.parameter}Paste`):isPan?'automation.panPaste':'automation.paste';
  const timeInput=useRef<HTMLInputElement>(null);
  const [time,setTime]=useState(String(project.editRange?.start??useProjectStore.getState().playheadPosition));
  const [duration,setDuration]=useState(String(project.editRange?project.editRange.end-project.editRange.start:envelope.duration));
  const current=useProjectStore(s=>s.project);
  const track=project.tracks.find(t=>t.id===trackId);
  let error='',preview:TimelineProject|undefined;
  try {
    if(current!==project)throw new Error('automation.changed');
    if(!time.trim()||!duration.trim())throw new Error('automation.bounds');
    preview=isFx?pasteEffectEnvelope(project,trackId,effectIndex??-1,envelope.parameter,envelope,Number(time),Number(duration)):(isPan?pastePanEnvelope:pasteGainEnvelope)(project,trackId,envelope,Number(time),Number(duration));
  } catch(reason) {error=t(reason instanceof Error?reason.message:String(reason));}
  const replaced=((isFx?track?.effects?.[effectIndex??-1]?.automation?.[envelope.parameter]:isPan?track?.panAutomation:track?.automation)??[]).filter(p=>p.time>=Number(time)-1/project.sampleRate&&p.time<=Number(time)+Number(duration)+1/project.sampleRate).length;
  return <Modal isOpen onClose={onClose} title={t(title)} initialFocusRef={timeInput}>
    <form noValidate className="space-y-3 text-sm" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onClose();}}} onSubmit={e=>{
      e.preventDefault();if(!preview||useProjectStore.getState().project!==project)return;
      if(preview!==project)useProjectStore.setState({project:preview});onClose();
    }}>
      <p className="text-gray-300 break-words">{envelope.sourceName??t('automation.title')} → {track?.name}</p>
      {isFx&&<p className="text-xs text-gray-400">{(effectIndex??-1)+1} · {t(envelope.parameter==='freq'?'automation.ringmodFrequency':envelope.parameter==='rate'?'automation.chorusRate':envelope.parameter==='depth'?'automation.chorusDepth':envelope.effectType!=='delay'?`automation.${envelope.effectType}Mix`:`automation.delay${envelope.parameter![0].toUpperCase()+envelope.parameter!.slice(1)}`)}</p>}
      <p className="text-xs text-gray-400">{t('automation.copiedRange',{start:(envelope.sourceStart??0).toFixed(3),end:((envelope.sourceStart??0)+envelope.duration).toFixed(3)})}</p>
      <div className="flex flex-wrap gap-3">
        <label className="flex-1 min-w-28">{t('automation.destination')}<NumberField inputRef={timeInput} onDraftChange={setTime} onEnter={()=>queueMicrotask(()=>timeInput.current?.form?.requestSubmit())} label={t('automation.destination')} min={0} step={1/project.sampleRate} value={Number(time)} width="block w-full min-h-11" onCommit={next=>{setTime(String(next));return true;}}/></label>
        <label className="flex-1 min-w-28">{t('automation.length')}<NumberField label={t('automation.length')} onDraftChange={setDuration} onEnter={()=>queueMicrotask(()=>timeInput.current?.form?.requestSubmit())} min={1/project.sampleRate} step={1/project.sampleRate} value={Number(duration)} width="block w-full min-h-11" onCommit={next=>{setDuration(String(next));return true;}}/></label>
      </div>
      {error?<p role="alert" className="text-amber-300 text-xs">{error}</p>:<p className="text-xs text-gray-400">{t('automation.replaceReview',{count:replaced,end:(Number(time)+Number(duration)).toFixed(3),factor:(Number(duration)/envelope.duration).toFixed(3)})}</p>}
      <p className="text-xs text-gray-400">{t(isFx?(envelope.parameter==='freq'?'automation.ringmodFreqPasteHelp':envelope.parameter==='rate'?'automation.chorusRatePasteHelp':envelope.parameter==='depth'?'automation.chorusDepthPasteHelp':envelope.effectType!=='delay'?`automation.${envelope.effectType}PasteHelp`:'automation.fxPasteHelp'):isPan?'automation.panPasteHelp':'automation.pasteHelp')}</p>
      <div className="flex justify-end gap-2"><button type="button" className="timeline-tool" onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="timeline-tool bg-indigo-700" disabled={!preview}>{t('automation.applyPaste')}</button></div>
    </form>
  </Modal>;
}
