import {useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Circle,Square,CircleHelp} from 'lucide-react';
import {ToolButton} from '../common/ToolButton';
import {Modal} from '../common/Modal';
import {TimelineEngineContext} from './timelineEngineContext';
import {useProjectStore} from '../../stores/projectStore';
import {applyAutomationPass,automationValue,type AutomationMode,type AutomationSpan,type AutomationTarget} from '../../lib/automationRecording';
import {timelineDuration} from '../../lib/timelineView';
import type {TimelineProject} from '../../types/audio';
interface Pass {project:TimelineProject;sources:ReturnType<typeof useProjectStore.getState>['sources'];spans:AutomationSpan[];generation?:number;lastTime?:number;active?:AutomationSpan;held:boolean;value:number;started:boolean;count:number}
/** A session-only recorder: audition is separate from project/undo/autosave. */
export function AutomationRecorder({target,onBusy}:{target:AutomationTarget;onBusy:(busy:boolean)=>void}) {
 const {t}=useTranslation(),engine=useContext(TimelineEngineContext);
 const project=useProjectStore(s=>s.project),playing=useProjectStore(s=>s.isPlaying),sources=useProjectStore(s=>s.sources);
 const track=project.tracks.find(track=>track.id===target.trackId)!;
 const [mode,setMode]=useState<AutomationMode>('read'),[armed,setArmed]=useState(false),[review,setReview]=useState<Pass|null>(null),[error,setError]=useState('');
 const pass=useRef<Pass|null>(null),slider=useRef<HTMLInputElement>(null),readout=useRef<HTMLOutputElement>(null),modeRef=useRef(mode);
 const minimum=target.parameter==='pan'?-1:0,maximum=target.parameter==='freq'?2000:target.parameter==='rate'?8:target.parameter==='time'?2:target.parameter==='feedback'?.95:target.parameter==='mix'||target.parameter==='depth'||target.parameter==='pan'?1:10**(.6);
 const toControl=(v:number)=>target.parameter==='gain'?(v<=.001?-60:Math.max(-60,20*Math.log10(v))):target.parameter==='pan'||target.parameter==='rate'||target.parameter==='freq'?v:target.parameter==='time'?v*1000:v*100;
 const fromControl=(v:number)=>target.parameter==='gain'?(v<=-60?0:10**(v/20)):target.parameter==='pan'||target.parameter==='rate'||target.parameter==='freq'?v:target.parameter==='time'?v/1000:v/100;
 const display=(value:number)=>target.parameter==='gain'?`${toControl(value).toFixed(1)} dB`:target.parameter==='pan'?value.toFixed(2):target.parameter==='freq'||target.parameter==='rate'?`${value.toFixed(2)} Hz`:target.parameter==='time'?`${(value*1000).toFixed(1)} ms`:`${(value*100).toFixed(1)}%`;
 const draw=(value:number)=>{if(slider.current)slider.current.value=String(toControl(value));if(readout.current)readout.current.textContent=display(value);};
 const restore=()=>{engine?.current?.previewAutomation(useProjectStore.getState().project,target);};
 const discard=(message='')=>{pass.current=null;restore();setArmed(false);setReview(null);setMode('read');modeRef.current='read';setError(message);};
 const valid=(p:Pass)=>{const state=useProjectStore.getState();return state.project===p.project&&state.sources===p.sources;};
 const sample=(p:Pass,time:number)=>{
  if(!p.active)return;
  const points=p.active.points,last=points.at(-1)!,quantized=Math.min(timelineDuration(p.project),Math.round(time*p.project.sampleRate)/p.project.sampleRate);
  if(quantized>last.time){points.push({time:quantized,value:p.value});p.count++;}
  else if(quantized===last.time)last.value=p.value;
 };
 const beginSpan=(p:Pass,time:number)=>{
  if(p.active)return;const clock=Math.round(time*p.project.sampleRate)/p.project.sampleRate,last=p.spans.at(-1);
  // Separate gestures at the same captured clock form one interval, not an invalid overlap.
  if(last&&clock<=last.points.at(-1)!.time+1/p.project.sampleRate){p.active=last;sample(p,clock);}
  else{p.active={points:[{time:clock,value:p.value}]};p.spans.push(p.active);p.count++;}
  engine?.current?.previewAutomation(p.project,target,p.value);
 };
 const endSpan=(p:Pass,time:number)=>{sample(p,time);if(p.active&&p.active.points.length<2)p.spans.pop();p.active=undefined;};
 const finish=()=>{
  const p=pass.current;if(!p)return;
  if(!valid(p)){discard(t('automation.changed'));return;}
  if(p.active)endSpan(p,p.lastTime??p.active.points[0].time);
  pass.current=null;restore();setArmed(false);setMode('read');modeRef.current='read';
  if(p.spans.length)setReview(p);
 };
 const beginTouch=()=>{
  const p=pass.current,clock=engine?.current?.automationClock();if(!p||!clock||!useProjectStore.getState().isPlaying||!valid(p))return;
  const start=modeRef.current==='write'?clock.start:clock.time;
  if(!p.active)p.value=Math.max(minimum,Math.min(maximum,automationValue(p.project,target,start)));
  p.held=true;beginSpan(p,start);engine?.current?.previewAutomation(p.project,target,p.value);
 };
 const endTouch=(cancel=false)=>{
  const p=pass.current;if(!p)return;
  p.held=false;if(cancel){discard();return;}
  if(modeRef.current==='touch'){
   endSpan(p,engine?.current?.automationClock()?.time??p.lastTime??0);restore();
  }
 };
 useLayoutEffect(()=>{onBusy(armed||!!review);return()=>onBusy(false);},[armed,review,onBusy]);
 useEffect(()=>{
  let frame=0;
  const tick=()=>{
   const p=pass.current,state=useProjectStore.getState(),clock=engine?.current?.automationClock();
   if(p){
    if(!valid(p)){discard(t('automation.changed'));}
    else if(clock&&state.isPlaying){
     if(p.generation!==undefined&&(p.generation!==clock.generation||clock.time<(p.lastTime??clock.time))){discard(t('automation.recordDiscontinuity'));}
     else{
      p.started=true;p.generation=clock.generation;p.lastTime=clock.time;
      if(modeRef.current==='write'&&!p.active){p.value=Math.max(minimum,Math.min(maximum,automationValue(p.project,target,clock.start)));beginSpan(p,clock.start);}
      if(p.active){sample(p,clock.time);if(p.count>100000||p.spans.length>1000)discard(t('automation.recordLimit'));}
      draw(p.active?p.value:automationValue(p.project,target,clock.time));
     }
    }else if(p.started&&!state.isPlaying)finish();
   }else if(!review)draw(automationValue(state.project,target,clock?.time??state.playheadPosition));
   frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  const unsubscribe=useProjectStore.subscribe((next,previous)=>{const p=pass.current;if(!p){if(next.project!==previous.project||next.sources!==previous.sources){setMode('read');modeRef.current='read';}return;}if(!valid(p)){discard(t('automation.changed'));return;}if(previous.isPlaying&&!next.isPlaying){p.lastTime=engine?.current?.automationClock()?.time??p.lastTime;finish();}});
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&pass.current){event.preventDefault();event.stopPropagation();discard();}};
  const blur=()=>{if(pass.current)discard(t('automation.recordInterrupted'));};
  const visibility=()=>{if(document.hidden)blur();};
  window.addEventListener('keydown',key,true);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
  return()=>{cancelAnimationFrame(frame);unsubscribe();pass.current=null;restore();window.removeEventListener('keydown',key,true);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);};
  // Target is keyed by lane/track; the running pass reads mutable control refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[review]);
 const blocked=!!track.locked||(target.effectIndex!==undefined&&!track.effects?.[target.effectIndex]?.enabled);
 let preview:TimelineProject|undefined;
 let errorPreview='';
 // Compute review errors before rendering; Apply revalidates the snapshot.
 if(review){try{if(project!==review.project||sources!==review.sources)throw new Error('automation.changed');preview=applyAutomationPass(project,target,review.spans);}catch(reason){errorPreview=reason instanceof Error?t(reason.message):String(reason);}}
 return <div data-automation-recorder className="flex flex-wrap items-center gap-1 p-1 text-xs border-t border-gray-800" onKeyDown={e=>e.stopPropagation()}>
  <select aria-label={t('automation.recordMode')} className="min-h-11 bg-gray-800 rounded" value={mode} disabled={armed||!!review||playing} onChange={e=>{modeRef.current=e.target.value as AutomationMode;setMode(modeRef.current);setError('');}}>{(['read','touch','latch','write'] as const).map(m=><option key={m} value={m}>{t(`automation.mode_${m}`)}</option>)}</select>
  <ToolButton icon={armed?Square:Circle} aria-pressed={armed} className={armed?'text-red-300 bg-red-950':''} label={t(armed?'automation.discardPass':'automation.armPass')} disabled={!armed&&(mode==='read'||playing||blocked||!!review)} onClick={()=>{
   if(armed){discard();return;}
   const state=useProjectStore.getState(),value=Math.max(minimum,Math.min(maximum,automationValue(state.project,target,state.playheadPosition)));
   pass.current={project:state.project,sources:state.sources,spans:[],held:false,value,started:false,count:0};setError('');setArmed(true);
  }}/>
  <input ref={slider} type="range" aria-label={t('automation.recordValue')} className="min-h-11 w-36 max-w-full" min={target.parameter==='gain'?-60:target.parameter==='pan'?-1:0} max={target.parameter==='gain'?12:target.parameter==='pan'?1:maximum*(target.parameter==='rate'||target.parameter==='freq'?1:target.parameter==='time'?1000:100)} step={target.parameter==='pan'?.01:.1} disabled={!armed||!playing||blocked} defaultValue={toControl(automationValue(project,target,useProjectStore.getState().playheadPosition))}
   onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);beginTouch();}} onPointerUp={()=>endTouch()} onPointerCancel={()=>endTouch(true)} onLostPointerCapture={()=>{if(pass.current?.held)endTouch(true);}}
   onKeyDown={e=>{if(e.key.startsWith('Arrow')||['Home','End','PageUp','PageDown'].includes(e.key))beginTouch();}} onKeyUp={()=>endTouch()} onBlur={()=>endTouch()}
   onChange={e=>{const p=pass.current,clock=engine?.current?.automationClock();if(!p||!clock||!valid(p))return;if(!p.active)beginTouch();p.value=fromControl(Number(e.target.value));sample(p,clock.time);engine?.current?.previewAutomation(p.project,target,p.value);draw(p.value);}}/>
  <output ref={readout} className="min-w-14" aria-label={t('automation.recordReadout')}/>
  <span className={armed?'text-red-300':'text-gray-400'}>{t(armed?'automation.passArmed':'automation.passSafe')}</span>
  <ToolButton icon={CircleHelp} label={t(`automation.recordHelp_${mode}`)}/>
  {error&&<p role="alert" className="text-amber-300 w-full">{error}</p>}
  {review&&<Modal isOpen onClose={()=>setReview(null)} title={t('automation.reviewPass')}>
   <div data-automation-review className="space-y-3 text-sm" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();setReview(null);}}}>
    <p>{track.name} · {t(target.parameter==='gain'?'automation.gainLane':target.parameter==='pan'?'automation.panLane':target.parameter==='freq'?'automation.ringmodFrequency':target.parameter==='rate'?'automation.chorusRate':target.parameter==='depth'?'automation.chorusDepth':target.parameter==='mix'?(['ringmod','bitcrush','distortion','chorus','reverb'].includes(track.effects?.[target.effectIndex??-1]?.type??'')?`automation.${track.effects?.[target.effectIndex??-1]?.type}Mix`:'automation.delayMix'):target.parameter==='time'?'automation.delayTime':'automation.delayFeedback')}</p>
    <p className="text-xs text-gray-400">{t('automation.passReviewHelp')}</p>
    <ul className="max-h-48 overflow-y-auto text-xs">{review.spans.map((span,i)=><li key={i} data-recorded-start={span.points[0].time} data-recorded-end={span.points.at(-1)!.time}>{span.points[0].time.toFixed(3)}–{span.points.at(-1)!.time.toFixed(3)} s · {span.points.length} {t('automation.recordPoints')}</li>)}</ul>
    {errorPreview&&<p role="alert" className="text-amber-300">{errorPreview}</p>}
    <div className="flex justify-end gap-2"><button className="timeline-tool" onClick={()=>setReview(null)}>{t('common.cancel')}</button><button className="timeline-tool bg-indigo-700" disabled={!preview||playing} onClick={()=>{if(!valid(review)||!preview)return;if(preview!==review.project)useProjectStore.setState({project:preview});setReview(null);}}>{t('automation.applyPass')}</button></div>
   </div>
  </Modal>}
 </div>;
}
