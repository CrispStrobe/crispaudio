import {saveText} from '../../lib/transcript';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useProjectStore} from '../../stores/projectStore';
import {keepSpokenWords,planKeptText,type KeepOptions,type KeepPlan} from '../../lib/keepSpeech';
import type {TimelineProject} from '../../types/audio';

export function KeepSpeechEditor({disabled=false}:{disabled?:boolean}){
  const {t}=useTranslation(),project=useProjectStore(s=>s.project);
  const [text,setText]=useState(''),[error,setError]=useState('');
  const [review,setReview]=useState<{project:TimelineProject;plan:KeepPlan;options:KeepOptions}|null>(null);
  const compare=(options:KeepOptions={})=>{try{const plan=planKeptText(project,text,options);setReview({project,plan,options});setError('');}catch(e){setReview(null);setError(t(e instanceof Error?e.message:String(e)));}};
  const stale=review&&review.project!==project;
  return <details className="border-t border-gray-700 pt-2" open>
    <summary className="cursor-pointer py-2">{t('keepSpeech.title')}</summary>
    <div className="space-y-2">
      <p className="text-xs text-gray-400">{t('keepSpeech.help')}</p>
      <textarea rows={6} className="w-full min-w-0 bg-gray-800 rounded p-2" aria-label={t('keepSpeech.text')} placeholder={t('keepSpeech.placeholder')} value={text} disabled={disabled} onChange={e=>{setText(e.target.value);setReview(null);setError('');}}/>
      <div className="flex flex-wrap gap-1">
        <button className="timeline-tool" disabled={disabled||!project.transcript?.length} onClick={()=>{setText(project.transcript?.map(c=>c.words?.map(w=>w.text.trim()).join(' ')??c.text).join('\n\n')??'');setReview(null);setError('');}}>{t('keepSpeech.load')}</button>
        <button className="timeline-tool" disabled={disabled||!text.trim()} onClick={()=>compare()}>{t('keepSpeech.compare')}</button>
      </div>
      {error&&<p role="alert" className="text-amber-300 break-words">{error}</p>}
      {review&&<>
        <p role="status" className="text-xs">{t('keepSpeech.summary',{kept:review.plan.keptWords,deleted:review.plan.deletedWords,passages:review.plan.ranges.length,duration:review.plan.duration.toFixed(2)})}</p>
        {stale&&<p role="alert" className="text-amber-300">{t('keepSpeech.changed')}</p>}
        {review.plan.ambiguous&&review.plan.ambiguity&&<div className="space-y-2 rounded bg-amber-950 p-2">
          <p className="text-xs">{t('keepSpeech.ambiguous',{word:review.plan.ambiguity.text})}</p>
          <select className="w-full min-w-0 bg-gray-800 rounded p-2 text-xs" aria-label={t('keepSpeech.occurrence')} value="" disabled={disabled||!!stale} onChange={e=>{if(e.target.value)compare({occurrences:{...review.options.occurrences,[review.plan.ambiguity!.token]:Number(e.target.value)}});}}>
            <option value="" disabled>{t('keepSpeech.choose')}</option>
            {review.plan.ambiguity.candidates.map(c=><option key={c.index} value={c.index}>{c.start.toFixed(2)} s · {c.text}</option>)}
          </select>
          {review.plan.ambiguity.more&&<p className="text-xs">{t('keepSpeech.many')}</p>}
          <div className="flex flex-wrap gap-1">{(['earliest','latest'] as const).map(choice=><button className="timeline-tool" disabled={disabled||!!stale} key={choice} onClick={()=>compare({...review.options,choice})}>{t(`keepSpeech.${choice}`)}</button>)}</div>
        </div>}
        <ol className="space-y-2 max-h-64 overflow-y-auto" aria-label={t('keepSpeech.passages')}>
          {review.plan.ranges.map((range,i)=><li key={i} className="rounded bg-gray-950 p-2 text-xs break-words"><button className="timeline-tool" onClick={()=>{useProjectStore.getState().setIsPlaying(false);useProjectStore.getState().setPlayheadPosition(range.start);}}>{range.start.toFixed(3)}–{range.end.toFixed(3)} s</button><p>{range.text}</p></li>)}
        </ol>
        <button className="timeline-tool" disabled={disabled||!!stale||review.plan.ambiguous} onClick={()=>{try{if(useProjectStore.getState().project!==review.project)throw new Error('keepSpeech.changed');const next=keepSpokenWords(review.project,review.plan.wordIds);useProjectStore.setState({project:next,isPlaying:false,selection:null,playheadPosition:0});setReview(null);setError('');}catch(e){setError(t(e instanceof Error?e.message:String(e)));}}}>{t('keepSpeech.apply')}</button>
        <button className="timeline-tool" disabled={disabled||!!stale||review.plan.ambiguous} onClick={()=>void saveText(JSON.stringify([{op:'keep-words',wordIds:review.plan.wordIds}],null,2),`${project.name}.keep-text`,'json').catch(e=>setError(String(e)))}>{t('keepSpeech.recipe')}</button>
      </>}
    </div>
  </details>;
}
