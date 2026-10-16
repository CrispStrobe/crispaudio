import {InfoButton} from '../common/InfoButton';
import {CurvePastePreview} from './CurvePastePreview';
import {delayParameterMaximum,effectParameterDefault} from '../../lib/effectAutomation';
import {timelineDuration} from '../../lib/timelineView';
import {NumberField} from './NumberField';
import {effectClipboardKey,pasteEffectEnvelope,type EffectEnvelope} from '../../lib/effectEnvelope';
import {useState,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {Modal} from '../common/Modal';
import {useProjectStore} from '../../stores/projectStore';
import {pasteGainEnvelope,pastePanEnvelope,type GainEnvelope} from '../../lib/gainEnvelope';
import type {TimelineProject} from '../../types/audio';

/** Review a bounded replacement without touching project state until Apply. */
export function GainEnvelopePaste({project,trackId,envelope,effectIndex,onClose}:{project:TimelineProject;trackId:string;envelope:GainEnvelope|EffectEnvelope;effectIndex?:number;onClose:()=>void}) {
  const {t}=useTranslation(),isPan=envelope.parameter==='pan',isFx='effectType' in envelope;
  const title=isFx?`automation.${effectClipboardKey(envelope.effectType,envelope.parameter)}Paste`:isPan?'automation.panPaste':'automation.paste';
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
  const points=(source:TimelineProject|undefined)=>{const target=source?.tracks.find(t=>t.id===trackId);return (isFx?target?.effects?.[effectIndex??-1]?.automation?.[envelope.parameter]:isPan?target?.panAutomation:target?.automation)??[];};
  const before=points(project),after=preview?points(preview):undefined;
  const fallback=isFx?track?.effects?.[effectIndex??-1]?.params[envelope.parameter]??effectParameterDefault(envelope.effectType,envelope.parameter):isPan?track?.pan??0:1;
  const maximum=isFx?delayParameterMaximum(envelope.parameter):isPan?1:[before,after??[]].reduce((max,lane)=>lane.reduce((value,p)=>Math.max(value,p.value),max),4);
  const replaced=before.filter(p=>p.time>=Number(time)-1/project.sampleRate&&p.time<=Number(time)+Number(duration)+1/project.sampleRate).length;
  return <Modal isOpen onClose={onClose} title={t(title)} initialFocusRef={timeInput} widthClass="max-w-lg self-start my-4">
    <form noValidate className="space-y-3 text-sm" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onClose();}}} onSubmit={e=>{
      e.preventDefault();if(!preview||useProjectStore.getState().project!==project)return;
      if(preview!==project)useProjectStore.setState({project:preview});onClose();
    }}>
      <div className="flex items-center gap-2 min-w-0"><p className="flex-1 min-w-0 truncate text-gray-300" title={`${envelope.sourceName??t('automation.pasteCurve')} → ${track?.name??''}`}>{envelope.sourceName??t('automation.pasteCurve')} → {track?.name}</p>
       <InfoButton label={t('automation.pasteInfo')}>
        <p className="break-words">{envelope.sourceName??t('automation.pasteCurve')} → {track?.name}</p>
        <p>{t('automation.copiedRange',{start:(envelope.sourceStart??0).toFixed(3),end:((envelope.sourceStart??0)+envelope.duration).toFixed(3)})}</p>
        {isFx&&<p>{(effectIndex??-1)+1} · {t(envelope.parameter==='freq'?'automation.ringmodFrequency':envelope.parameter==='rate'?'automation.chorusRate':envelope.parameter==='depth'?'automation.chorusDepth':envelope.effectType!=='delay'?`automation.${envelope.effectType}Mix`:`automation.delay${envelope.parameter[0].toUpperCase()+envelope.parameter.slice(1)}`)}</p>}
        {preview&&<p>{t('automation.replaceReview',{count:replaced,end:(Number(time)+Number(duration)).toFixed(3),factor:(Number(duration)/envelope.duration).toFixed(3)})}</p>}
        <p>{t(isFx?(envelope.parameter==='freq'?'automation.ringmodFreqPasteHelp':envelope.parameter==='rate'?'automation.chorusRatePasteHelp':envelope.parameter==='depth'?'automation.chorusDepthPasteHelp':envelope.effectType!=='delay'?`automation.${envelope.effectType}PasteHelp`:'automation.fxPasteHelp'):isPan?'automation.panPasteHelp':'automation.pasteHelp')}</p>
        <p>{t('automation.pastePreviewHelp')}</p>
       </InfoButton>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex-1 min-w-28">{t('automation.destination')}<NumberField inputRef={timeInput} onDraftChange={setTime} onEnter={()=>queueMicrotask(()=>timeInput.current?.form?.requestSubmit())} label={t('automation.destination')} min={0} step={1/project.sampleRate} scrubStep={.01} value={Number(time)} width="block w-full min-h-11" onCommit={next=>{setTime(String(next));return true;}}/></label>
        <label className="flex-1 min-w-28">{t('automation.length')}<NumberField label={t('automation.length')} onDraftChange={setDuration} onEnter={()=>queueMicrotask(()=>timeInput.current?.form?.requestSubmit())} min={1/project.sampleRate} step={1/project.sampleRate} scrubStep={.01} value={Number(duration)} width="block w-full min-h-11" onCommit={next=>{setDuration(String(next));return true;}}/></label>
      </div>
      <CurvePastePreview before={before} after={after} fallback={Math.max(isPan?-1:0,Math.min(maximum,fallback))} minimum={isPan?-1:0} maximum={maximum} start={time.trim()?Number(time):NaN} length={duration.trim()?Number(duration):NaN} canvas={timelineDuration(project)}/>
      {error&&<p role="alert" className="text-amber-300 text-xs">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="timeline-tool" onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="timeline-tool bg-indigo-700" disabled={!preview}>{t('automation.applyPaste')}</button></div>
    </form>
  </Modal>;
}
