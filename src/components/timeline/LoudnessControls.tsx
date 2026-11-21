import {InfoButton} from '../common/InfoButton';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {useTranslation} from 'react-i18next';
import {measureBuffer,type LoudnessReading} from '../../audio/dsp/loudness';
import {LOUDNESS_PRESETS,planLoudness,type LoudnessPlan} from '../../lib/loudnessTarget';
import type {TimelineEngine} from '../../audio/engine/TimelineEngine';
import type {TimelineProject} from '../../types/audio';
import {useProjectStore} from '../../stores/projectStore';
import {NumberField} from './NumberField';
import {Modal} from '../common/Modal';
const display=(value:number|null|undefined)=>value==null?'—':value.toFixed(1);
export function LoudnessControls({engine}:{engine:RefObject<TimelineEngine|null>}){
  const {t}=useTranslation(),project=useProjectStore(s=>s.project);
  const [live,setLive]=useState<LoudnessReading>(),[target,setTarget]=useState(-16),[ceiling,setCeiling]=useState(-1);
  const [review,setReview]=useState<LoudnessPlan&{snapshot:TimelineProject}>(),[useLimiter,setUseLimiter]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const job=useRef<AbortController|null>(null);
  useEffect(()=>{const timer=setInterval(()=>setLive(engine.current?.getLoudness()),200);return()=>clearInterval(timer);},[engine]);
  useEffect(()=>()=>{job.current?.abort();},[]);
  useEffect(()=>{job.current?.abort();},[project]);
  const measure=async()=>{
    const renderer=engine.current;if(!renderer)return;
    job.current?.abort();const controller=new AbortController();job.current=controller;const signal=controller.signal;
    const snapshot=useProjectStore.getState().project;
    setBusy(true);setError('');setReview(undefined);
    try{
      const plan=await planLoudness(snapshot,async project=>measureBuffer(await renderer.renderToBuffer(project,0,undefined,signal),signal),{target,ceiling,useLimiter},signal);
      signal.throwIfAborted();if(useProjectStore.getState().project!==snapshot)throw new Error('loudness.changed');
      setReview({...plan,snapshot});
    }catch(e){if(!signal.aborted)setError(t(e instanceof Error?e.message:String(e)));}
    finally{if(job.current===controller){job.current=null;setBusy(false);}}
  };
  return <section className="rounded border border-gray-700 p-2 space-y-2 text-xs" aria-label={t('loudness.title')}>
    <p>{t('loudness.title')}</p>

    <p>I {display(live?.integrated)} LUFS · TP {display(live?.truePeak)} dBTP</p>
    <p>M {display(live?.momentary)} · S {display(live?.shortTerm)} LUFS</p>
    <button className="min-h-11" onClick={()=>engine.current?.resetLoudness()}>{t('loudness.reset')}</button>
    <div className="flex flex-wrap gap-1">{(Object.keys(LOUDNESS_PRESETS) as (keyof typeof LOUDNESS_PRESETS)[]).map(name=><button key={name} className="timeline-tool min-h-11" disabled={busy} aria-pressed={target===LOUDNESS_PRESETS[name].target&&ceiling===LOUDNESS_PRESETS[name].ceiling} onClick={()=>{setTarget(LOUDNESS_PRESETS[name].target);setCeiling(LOUDNESS_PRESETS[name].ceiling);}}>{t(`loudness.preset_${name}`)}</button>)}</div>
    <label className="block">{t('loudness.target')}<NumberField disabled={busy} width="w-full min-h-11" label={t('loudness.target')} min={-36} step={.1} value={target} onCommit={v=>{if(v> -5)return false;setTarget(v);return true;}}/></label>
    <label className="block">{t('loudness.ceiling')}<NumberField disabled={busy} width="w-full min-h-11" label={t('loudness.ceiling')} min={-12} step={.1} value={ceiling} onCommit={v=>{if(v>0)return false;setCeiling(v);return true;}}/></label>
    <label className="flex gap-2 items-center min-h-11"><input type="checkbox" disabled={busy} checked={useLimiter} onChange={e=>setUseLimiter(e.target.checked)}/>{t('loudness.useLimiter')}</label>
    <button className="min-h-11 w-full rounded bg-gray-800" disabled={busy} onClick={()=>void measure()}>{t('loudness.measure')}</button>
    {busy&&<button className="min-h-11" onClick={()=>job.current?.abort()}>{t('common.cancel')}</button>}
    {error&&<p role="alert" className="text-amber-300">{error}</p>}
    <InfoButton label={t('loudness.title')}><p>{t('loudness.liveEstimate')}</p><p>{t('loudness.help')}</p><p>{t('loudness.limiterHelp')}</p></InfoButton>
    {review&&<Modal isOpen onClose={()=>setReview(undefined)} title={t('loudness.review')}>
      <div className="space-y-3 text-sm">
        <p>{t('loudness.before')}: {display(review.before.integrated)} LUFS / {display(review.before.truePeak)} dBTP</p>
        <p>{t('loudness.after')}: {display(review.after.integrated)} LUFS / {display(review.after.truePeak)} dBTP</p>
        <p>{t('loudness.gain')}: {review.gain.toFixed(2)} dB</p>
        {review.limiterCeiling!==undefined&&<p>{t('loudness.limiterUsed',{ceiling:review.limiterCeiling.toFixed(2)})}</p>}
        {review.after.integrated!==null&&review.after.integrated<review.target-.2&&<p>{t('loudness.limited')}</p>}
        {project!==review.snapshot&&<p role="alert">{t('loudness.changed')}</p>}
        <div className="flex justify-end gap-2"><button className="min-h-11" onClick={()=>setReview(undefined)}>{t('common.cancel')}</button><button className="min-h-11 rounded bg-indigo-600 px-3" disabled={project!==review.snapshot} onClick={()=>{if(useProjectStore.getState().project===review.snapshot){useProjectStore.setState({project:review.candidate});setReview(undefined);}}}>{t(review.limiterCeiling===undefined?'loudness.apply':'loudness.applyLimiter')}</button></div>
      </div>
    </Modal>}
  </section>;
}
