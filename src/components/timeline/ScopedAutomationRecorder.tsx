import {useContext,useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Circle,Square} from 'lucide-react';
import {TimelineEngineContext} from './timelineEngineContext';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {recordedEnvelope,type RecordedSpan} from '../../lib/recordedEnvelope';
import {scopedEffect} from '../../lib/scopedEffectAutomation';
import {effectParameterAt,delayParameterMaximum,type DelayParameter} from '../../lib/effectAutomation';
import {timelineDuration} from '../../lib/timelineView';
import {ToolButton} from '../common/ToolButton';
import {InfoButton} from '../common/InfoButton';
import {Modal} from '../common/Modal';
import type {GainPoint,TimelineProject} from '../../types/audio';
interface Pass {sources:ReturnType<typeof useProjectStore.getState>['sources'];before:GainPoint[];spans:RecordedSpan[];active?:RecordedSpan;value:number;held:boolean;started:boolean;generation?:number;last?:number;count:number}
/** Real rack scope, project-clock capture, local review; publication belongs to the inspector. */
export function ScopedAutomationRecorder({snapshot,scope,index,parameter,points,fallback,onDraft,onBusy}:{snapshot:TimelineProject;scope:string;index:number;parameter:DelayParameter;points:GainPoint[];fallback:number;onDraft:(points:GainPoint[])=>void;onBusy:(busy:boolean)=>void}){
 const {t}=useTranslation(),engine=useContext(TimelineEngineContext),playing=useProjectStore(s=>s.isPlaying),recording=useUIStore(s=>s.timelineRecording),[mode,setMode]=useState<'touch'|'latch'|'write'>('touch'),[armed,setArmed]=useState(false),[review,setReview]=useState<Pass|null>(null),[error,setError]=useState(''),[value,setValue]=useState(()=>effectParameterAt(points,useProjectStore.getState().playheadPosition,fallback,parameter));
 const pass=useRef<Pass|null>(null),latest=useRef({mode,onBusy,onDraft,points,fallback}),target=scopedEffect(snapshot,scope,index),maximum=delayParameterMaximum(parameter),scale=parameter==='time'?1000:parameter==='rate'||parameter==='freq'?1:100;
 useEffect(()=>{latest.current={mode,onBusy,onDraft,points,fallback};},[mode,onBusy,onDraft,points,fallback]);
 const restore=()=>engine?.current?.previewEffectAutomation(useProjectStore.getState().project,scope,index,parameter);
 const valid=(p:Pass)=>useProjectStore.getState().project===snapshot&&useProjectStore.getState().sources===p.sources&&!useUIStore.getState().timelineRecording;
 const discard=(message='')=>{pass.current=null;restore();setArmed(false);setReview(null);setError(message);latest.current.onBusy(false);};
 const at=(clock:number)=>Math.round(Math.max(target.start,Math.min(target.end,clock))*snapshot.sampleRate)/snapshot.sampleRate;
 const sample=(p:Pass,time:number)=>{if(!p.active)return;const now=at(time),last=p.active.points.at(-1)!;if(now>last.time){p.active.points.push({time:now,value:p.value});p.count++;}else if(now===last.time)last.value=p.value;};
 const begin=(p:Pass,time:number)=>{if(p.active||time<target.start||time>=target.end)return;const now=at(time),last=p.spans.at(-1);if(last&&now<=last.points.at(-1)!.time+1/snapshot.sampleRate){p.active=last;sample(p,now);}else{p.active={points:[{time:now,value:p.value}]};p.spans.push(p.active);p.count++;}engine?.current?.previewEffectAutomation(snapshot,scope,index,parameter,p.value);};
 const end=(p:Pass,time:number)=>{sample(p,time);if(p.active&&p.active.points.length<2)p.spans.pop();p.active=undefined;};
 const finish=()=>{const p=pass.current;if(!p)return;if(!valid(p)){discard(t('automation.changed'));return;}if(p.active)end(p,p.last??p.active.points[0].time);pass.current=null;restore();setArmed(false);if(p.spans.length)setReview(p);else latest.current.onBusy(false);};
 useEffect(()=>{
  let frame=0;
  const tick=()=>{const p=pass.current,state=useProjectStore.getState(),clock=engine?.current?.automationClock();
   if(p){if(!valid(p)){discard(t('automation.changed'));}else if(state.isPlaying&&clock){
    if(p.generation!==undefined&&p.generation!==clock.generation||p.last!==undefined&&clock.time<p.last-1/snapshot.sampleRate){discard(t('automation.recordInterrupted'));}
    else{p.started=true;p.generation=clock.generation;p.last=clock.time;if(latest.current.mode==='write'&&!p.active&&clock.time>=target.start){p.value=effectParameterAt(p.before,Math.max(target.start,clock.start),latest.current.fallback,parameter);begin(p,Math.max(target.start,clock.start));}else if(p.held&&!p.active)begin(p,clock.time);if(p.active)sample(p,clock.time);if(p.count>100000||p.spans.length>1000)discard(t('automation.recordLimit'));else if(clock.time>=target.end){finish();state.setIsPlaying(false);}}
   }else if(p.started&&!state.isPlaying)finish();}frame=requestAnimationFrame(tick);
  };frame=requestAnimationFrame(tick);
  const unsubUI=useUIStore.subscribe(next=>{if(next.timelineRecording&&pass.current)discard(t('automation.recordInterrupted'));});
  const unsubscribe=useProjectStore.subscribe((next,previous)=>{const p=pass.current;if(p&&!valid(p))discard(t('automation.changed'));else if(p&&previous.isPlaying&&!next.isPlaying)finish();});
  const cancel=()=>{if(pass.current)discard(t('automation.recordInterrupted'));},key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&pass.current){e.preventDefault();e.stopImmediatePropagation();discard();}};
  const visibility=()=>{if(document.hidden)cancel();};window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',visibility);document.addEventListener('keydown',key,true);
  return()=>{cancelAnimationFrame(frame);unsubscribe();unsubUI();pass.current=null;restore();latest.current.onBusy(false);window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('keydown',key,true);};
  // Local capture refs own the pass; changing a rack/parameter unmounts this keyed recorder.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[snapshot,scope,index,parameter]);
 const touch=()=>{const p=pass.current,clock=engine?.current?.automationClock();if(!p||!valid(p))return;p.held=true;if(clock)begin(p,clock.time);};
 const release=()=>{const p=pass.current,clock=engine?.current?.automationClock();if(!p)return;p.held=false;if(latest.current.mode==='touch'&&p.active){end(p,clock?.time??p.last??0);restore();}};
 return <div className="space-y-2" data-scoped-recorder><div className="flex flex-wrap items-center gap-1"><select aria-label={t('automation.recordMode')} className="min-h-11 bg-gray-800 rounded px-2" value={mode} disabled={armed||!!review||playing} onChange={e=>setMode(e.target.value as typeof mode)}>{(['touch','latch','write'] as const).map(m=><option key={m} value={m}>{t(`automation.mode_${m}`)}</option>)}</select><ToolButton icon={armed?Square:Circle} label={t(armed?'automation.discardPass':'automation.armPass')} aria-pressed={armed} disabled={!armed&&(playing||recording||target.locked||!target.effect.enabled||!!review||useProjectStore.getState().project!==snapshot)} onClick={()=>{if(armed){discard();return;}const state=useProjectStore.getState();const initial=effectParameterAt(points,state.playheadPosition,fallback,parameter);setValue(initial);pass.current={sources:state.sources,before:structuredClone(points),spans:[],value:initial,held:false,started:false,count:0};setError('');setArmed(true);latest.current.onBusy(true);}}/><InfoButton label={t(`automation.recordHelp_${mode}`)}><p>{t(`automation.recordHelp_${mode}`)}</p><p>{t('fxInspector.passHelp')}</p></InfoButton></div>
  <label className="flex items-center gap-2"><input type="range" aria-label={t('automation.recordValue')} min={0} max={maximum*scale} step={parameter==='freq'?1:.1} value={value*scale} disabled={!armed||!playing||recording} className="min-h-11 flex-1 min-w-0" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);touch();}} onPointerUp={release} onPointerCancel={()=>discard(t('automation.recordInterrupted'))} onLostPointerCapture={()=>{if(pass.current?.held)discard(t('automation.recordInterrupted'));}} onKeyDown={e=>{if(e.key.startsWith('Arrow')||['Home','End','PageUp','PageDown'].includes(e.key))touch();}} onKeyUp={release} onBlur={release} onChange={e=>{const p=pass.current,clock=engine?.current?.automationClock();if(!p||!valid(p)||!clock)return;const next=Number(e.target.value)/scale;setValue(next);p.value=next;if(!p.active)begin(p,clock.time);sample(p,clock.time);if(p.active)engine?.current?.previewEffectAutomation(snapshot,scope,index,parameter,next);}}/><output className="text-xs tabular-nums">{(value*scale).toFixed(parameter==='freq'?0:1)} {parameter==='time'?'ms':parameter==='rate'||parameter==='freq'?'Hz':'%'}</output></label>
  {error&&<p role="alert" className="text-amber-300 text-xs">{error}</p>}
  {review&&<Modal isOpen title={t('automation.reviewPass')} onClose={()=>{setReview(null);latest.current.onBusy(false);}}><div className="space-y-3 text-sm" data-scoped-pass-review><div className="max-h-48 overflow-y-auto text-xs space-y-1">{review.spans.map((span,i)=><div key={i} className="flex justify-between gap-2" data-recorded-start={span.points[0].time} data-recorded-end={span.points.at(-1)!.time}><span>{span.points[0].time.toFixed(3)}–{span.points.at(-1)!.time.toFixed(3)} s</span><span>{span.points.length} {t('automation.recordPoints')}</span></div>)}</div><div className="flex justify-end gap-2"><button className="timeline-tool" onClick={()=>{setReview(null);latest.current.onBusy(false);}}>{t('common.cancel')}</button><button className="timeline-tool" onClick={()=>{try{if(!valid(review))throw new Error('automation.changed');const next=recordedEnvelope(review.before,review.spans,{rate:snapshot.sampleRate,duration:timelineDuration(snapshot),minimum:0,maximum,fallback:Math.max(0,Math.min(maximum,fallback))});latest.current.onDraft(next);setReview(null);latest.current.onBusy(false);}catch(e){setError(t(e instanceof Error?e.message:String(e)));setReview(null);latest.current.onBusy(false);}}}>{t('fxInspector.usePass')}</button></div></div></Modal>}
 </div>;
}
