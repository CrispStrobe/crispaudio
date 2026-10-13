import {InfoButton} from '../common/InfoButton';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {useTranslation} from 'react-i18next';
import {measureBuffer,finishingGain,type LoudnessReading} from '../../audio/dsp/loudness';
import type {TimelineEngine} from '../../audio/engine/TimelineEngine';
import type {TimelineProject} from '../../types/audio';
import {useProjectStore} from '../../stores/projectStore';
import {NumberField} from './NumberField';
import {Modal} from '../common/Modal';
const display=(value:number|null|undefined)=>value==null?'—':value.toFixed(1);
export function LoudnessControls({engine}:{engine:RefObject<TimelineEngine|null>}){
  const {t}=useTranslation(),project=useProjectStore(s=>s.project);
  const [live,setLive]=useState<LoudnessReading>(),[target,setTarget]=useState(-16),[ceiling,setCeiling]=useState(-1);
  const [review,setReview]=useState<{snapshot:TimelineProject;candidate:TimelineProject;before:LoudnessReading;after:LoudnessReading;gain:number;target:number}>();
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
      const before=await measureBuffer(await renderer.renderToBuffer(snapshot,0,undefined,signal),signal);
      let gain=finishingGain(before,target,ceiling),candidate=snapshot,after=before;
      for(let attempt=0;attempt<4;attempt++){
        candidate={...snapshot,masterVolume:(snapshot.masterVolume??1)*10**(gain/20)};
        after=await measureBuffer(await renderer.renderToBuffer(candidate,0,undefined,signal),signal);
        // Verify the real post-limiter mix, then attenuate any intersample overshoot.
        if(after.truePeak!==null&&after.truePeak>ceiling+.005){gain-=after.truePeak-ceiling+.02;continue;}
        break;
      }
      signal.throwIfAborted();if(useProjectStore.getState().project!==snapshot)throw new Error('loudness.changed');
      if(after.truePeak===null||after.truePeak>ceiling+.01)throw new Error('loudness.peakFailed');
      setReview({snapshot,candidate,before,after,gain,target});
    }catch(e){if(!signal.aborted)setError(t(e instanceof Error?e.message:String(e)));}
    finally{if(job.current===controller){job.current=null;setBusy(false);}}
  };
  return <section className="rounded border border-gray-700 p-2 space-y-2 text-xs" aria-label={t('loudness.title')}>
    <p>{t('loudness.title')}</p>

    <p>I {display(live?.integrated)} LUFS · TP {display(live?.truePeak)} dBTP</p>
    <p>M {display(live?.momentary)} · S {display(live?.shortTerm)} LUFS</p>
    <button className="min-h-11" onClick={()=>engine.current?.resetLoudness()}>{t('loudness.reset')}</button>
    <label className="block">{t('loudness.target')}<NumberField disabled={busy} width="w-full min-h-11" label={t('loudness.target')} min={-36} step={.1} value={target} onCommit={v=>{if(v> -5)return false;setTarget(v);return true;}}/></label>
    <label className="block">{t('loudness.ceiling')}<NumberField disabled={busy} width="w-full min-h-11" label={t('loudness.ceiling')} min={-12} step={.1} value={ceiling} onCommit={v=>{if(v>0)return false;setCeiling(v);return true;}}/></label>
    <button className="min-h-11 w-full rounded bg-gray-800" disabled={busy} onClick={()=>void measure()}>{t('loudness.measure')}</button>
    {busy&&<button className="min-h-11" onClick={()=>job.current?.abort()}>{t('common.cancel')}</button>}
    {error&&<p role="alert" className="text-amber-300">{error}</p>}
    <InfoButton label={t('loudness.title')}><p>{t('loudness.liveEstimate')}</p><p>{t('loudness.help')}</p></InfoButton>
    {review&&<Modal isOpen onClose={()=>setReview(undefined)} title={t('loudness.review')}>
      <div className="space-y-3 text-sm">
        <p>{t('loudness.before')}: {display(review.before.integrated)} LUFS / {display(review.before.truePeak)} dBTP</p>
        <p>{t('loudness.after')}: {display(review.after.integrated)} LUFS / {display(review.after.truePeak)} dBTP</p>
        <p>{t('loudness.gain')}: {review.gain.toFixed(2)} dB</p>
        {review.after.integrated!==null&&review.after.integrated<review.target-.2&&<p>{t('loudness.limited')}</p>}
        {project!==review.snapshot&&<p role="alert">{t('loudness.changed')}</p>}
        <div className="flex justify-end gap-2"><button className="min-h-11" onClick={()=>setReview(undefined)}>{t('common.cancel')}</button><button className="min-h-11 rounded bg-indigo-600 px-3" disabled={project!==review.snapshot} onClick={()=>{if(useProjectStore.getState().project===review.snapshot){useProjectStore.setState({project:review.candidate});setReview(undefined);}}}>{t('loudness.apply')}</button></div>
      </div>
    </Modal>}
  </section>;
}
