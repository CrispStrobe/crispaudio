import {useCallback,useContext,useEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {useTranslation} from 'react-i18next';
import {ArrowLeft,Play,Square} from 'lucide-react';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {mediaJob} from '../../lib/mediaJob';
import {drawSourceWaveform} from '../../lib/drawSourceWaveform';
import {AUDITION_START,requestAudition,type AuditionRequest} from '../../lib/auditionEvent';
import {sourcePluginRecallPlan,sourcePluginRecallSelection,assertSourcePluginRecallCurrent,type PreparedSourcePluginRecall,type SourcePluginRecallPlan} from '../../lib/sourcePluginRecall';
import {renderSourcePluginRecall} from '../../audio/plugins/SourcePluginRecallRender';
import {commitSourcePluginRecall} from '../../audio/plugins/SourcePluginRecallCommit';
import {nativeSourceOwner} from '../../audio/engine/NativeSourceOwner';
import {SourceAudition,sourceAuditionHeadroom} from '../../audio/engine/SourceAudition';
import {SourceRecallSelection} from './SourceRecallSelection';
import {TimelineEngineContext} from './timelineEngineContext';
import {useAudioEngine} from '../../hooks/useAudioEngine';
import {ParamSlider} from '../shared/ParamSlider';
import {InfoButton} from '../common/InfoButton';
import {ToolButton} from '../common/ToolButton';

interface Parameter {address:string;name:string;min:number;max:number;value:number;unit:string}
interface Info {state:string;parameters:Parameter[]}
/** Explicit saved-recipe mode. The full original processing window and editable
 * saved ranges keep pre-trim FX history, without editing the arrangement. */
export function SourcePluginRecall({clipId,onBack}:{clipId:string;onBack:()=>void}){
 const {t}=useTranslation();
 const [snapshot]=useState(()=>useProjectStore.getState()),[index,setIndex]=useState<number>(),[epochInvalid,setEpochInvalid]=useState(false),epoch=useRef(false);
 const invalidateEpoch=useCallback(()=>setEpochInvalid(true),[]);
 const initial=useMemo(()=>{try{return {plan:sourcePluginRecallPlan(snapshot,clipId,index)};}catch(e){return {error:e instanceof Error?e.message:'sourceRecall.changed'};}},[snapshot,clipId,index]);
 if(!initial.plan)return <div className="space-y-2"><ToolButton icon={ArrowLeft} label={t('sourceRecall.back')} onClick={onBack}/><p role="alert">{t(initial.error??'sourceRecall.changed')}</p></div>;
 return <SourcePluginRecallBody key={initial.plan.operationIndex} plan={initial.plan} onBack={onBack} onSelect={setIndex} invalidRef={epoch} epochInvalid={epochInvalid} onInvalidate={invalidateEpoch}/>;
}
function SourcePluginRecallBody({plan,onBack,onSelect,invalidRef,epochInvalid,onInvalidate}:{plan:SourcePluginRecallPlan;onBack:()=>void;onSelect:(index:number)=>void;invalidRef:RefObject<boolean>;epochInvalid:boolean;onInvalidate:()=>void}){
 const {t}=useTranslation(),audio=useAudioEngine(),main=useContext(TimelineEngineContext),project=useProjectStore(s=>s.project),sources=useProjectStore(s=>s.sources),arrangement=useProjectStore(s=>s.isPlaying),recording=useUIStore(s=>s.timelineRecording);
 const [info,setInfo]=useState<Info>(),[params,setParams]=useState(plan.recipe.parameters),[prepared,setPrepared]=useState<PreparedSourcePluginRecall>(),[original,setOriginal]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[playing,setPlaying]=useState(false),[level,setLevel]=useState(-12),[invalidated,setInvalidated]=useState(false);
 const [selection,setSelection]=useState(()=>sourcePluginRecallSelection(plan,plan.operation));
 const alive=useRef(true),job=useRef<AbortController|null>(null),generation=useRef(0),canvas=useRef<HTMLCanvasElement>(null),playhead=useRef<HTMLDivElement>(null),audition=useRef<SourceAudition|null>(null),gain=useRef<GainNode|null>(null),base=useRef(plan.recipe.state);
 const stale=epochInvalid||invalidated||project!==plan.snapshot.project||sources!==plan.snapshot.sources,disabled=stale||recording||arrangement;
 const current=useCallback(()=>{if(invalidRef.current||useUIStore.getState().timelineRecording)throw new Error('sourceRecall.changed');const state=useProjectStore.getState();assertSourcePluginRecallCurrent(plan,state);return state;},[plan,invalidRef]);
 const stop=useCallback(()=>{generation.current++;audition.current?.stop();gain.current?.disconnect();gain.current=null;setPlaying(false);},[]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;job.current?.abort();audition.current?.stop();gain.current?.disconnect();};},[]);
 useEffect(()=>{
  const invalidate=()=>{invalidRef.current=true;job.current?.abort();stop();setInvalidated(true);onInvalidate();};
  const projectSubscription=useProjectStore.subscribe(next=>{if(next.project!==plan.snapshot.project||next.sources!==plan.snapshot.sources||next.isPlaying)invalidate();});
  const recordingSubscription=useUIStore.subscribe((next,previous)=>{if(next.timelineRecording&&!previous.timelineRecording)invalidate();});
  return()=>{projectSubscription();recordingSubscription();};
 },[plan,stop,invalidRef,onInvalidate]);
 useEffect(()=>{if(disabled){invalidRef.current=true;onInvalidate();generation.current++;job.current?.abort();audition.current?.stop();gain.current?.disconnect();gain.current=null;queueMicrotask(()=>{if(alive.current){setPlaying(false);setInvalidated(true);}});}},[disabled,invalidRef,onInvalidate]);
 useEffect(()=>{const other=(e:Event)=>{if((e as CustomEvent<AuditionRequest>).detail.owner!=='source')stop();};window.addEventListener(AUDITION_START,other);return()=>window.removeEventListener(AUDITION_START,other);},[stop]);
 useEffect(()=>{
  if(disabled)return;const controller=new AbortController();job.current=controller;
  void mediaJob<Info>('audio_unit_plugin',{operation:'plugin-info',request:{id:plan.recipe.id,state:plan.recipe.state,parameters:plan.recipe.parameters}},controller.signal).then(result=>{
   current();if(!alive.current||controller.signal.aborted)return;base.current=result.state;setParams(Object.fromEntries(result.parameters.map(p=>[p.address,p.value])));setInfo(result);
  }).catch(e=>{if(alive.current&&!controller.signal.aborted)setError(String(e));});
  return()=>controller.abort();
 },[plan,current,disabled]);
 const shown=original?plan.displayInput:prepared?.pcm??plan.displayInput;
 const frame=useMemo(()=>({channels:plan.mixed||selection.channel<0?shown:[shown[selection.channel]],view:{start:0,end:plan.outputFrames},ranges:selection.ranges.map(r=>({start:Math.max(0,r.start+plan.targetWindow.start-plan.outputStart),end:Math.min(plan.outputFrames,r.end+plan.targetWindow.start-plan.outputStart)})).filter(r=>r.end>r.start),processed:!original&&!!prepared}),[shown,plan,selection,original,prepared]);
 const [painted,setPainted]=useState<typeof frame>();
 useEffect(()=>{const controller=new AbortController(),el=canvas.current;if(el)void drawSourceWaveform(el,frame.channels,frame.view,frame.ranges,frame.processed,controller.signal).then(()=>{if(alive.current&&!controller.signal.aborted)setPainted(frame);}).catch(e=>{if(alive.current&&!controller.signal.aborted)setError(String(e));});return()=>controller.abort();},[frame]);
 useEffect(()=>{if(!playing)return;let frame=0;const draw=()=>{if(playhead.current)playhead.current.style.left=`${Math.max(0,Math.min(100,(plan.visible.start+(audition.current?.position()??0)*plan.rate)/plan.outputFrames*100))}%`;frame=requestAnimationFrame(draw);};draw();return()=>cancelAnimationFrame(frame);},[playing,plan]);
 useEffect(()=>{if(gain.current)gain.current.gain.setTargetAtTime(10**(level/20),audio.getContext().currentTime,.002);},[audio,level]);
 const closeBacking=async()=>{const engine=main?.current;engine?.stop();await engine?.closeNativeOwned();};
 const action=async(task:(signal:AbortSignal)=>Promise<void>)=>{stop();job.current?.abort();const controller=new AbortController();job.current=controller;setBusy(true);setError('');try{current();await task(controller.signal);}catch(e){if(alive.current&&!controller.signal.aborted)setError(String(e instanceof Error?t(e.message):e));}finally{if(alive.current&&job.current===controller)setBusy(false);}};
 const render=()=>void action(async signal=>{
  setPrepared(undefined);await closeBacking();signal.throwIfAborted();current();await nativeSourceOwner.stop();signal.throwIfAborted();current();
  const recipe={...plan.recipe,parameters:{...params},state:base.current},result=await renderSourcePluginRecall(plan,recipe,selection,signal);
  signal.throwIfAborted();current();if(alive.current){setPrepared(result);setOriginal(false);}
 });
 const makeBuffer=(pcm:Float32Array[])=>{const buffer=new AudioBuffer({numberOfChannels:pcm.length,length:plan.visible.end-plan.visible.start,sampleRate:plan.rate});pcm.forEach((c,ch)=>buffer.copyToChannel(c.subarray(plan.visible.start,plan.visible.end) as Float32Array<ArrayBuffer>,ch));return buffer;};
 const compare=(dry:boolean)=>{generation.current++;try{current();if(playing){const buffer=makeBuffer(dry?plan.displayInput:prepared?.pcm??plan.displayInput),db=sourceAuditionHeadroom(buffer,level);if(db!==level){setLevel(db);gain.current?.gain.setTargetAtTime(10**(db/20),audio.getContext().currentTime,.002);}audition.current?.replace(buffer);}setOriginal(dry);}catch(e){stop();setError(t(e instanceof Error?e.message:String(e)));}};
 const play=async()=>{
  if(playing){stop();return;}const token=++generation.current;
  try{
   current();if(!requestAudition('source',true))throw new Error('sourceNative.inputBusy');await closeBacking();current();if(!alive.current||token!==generation.current)return;await nativeSourceOwner.stop();current();if(!alive.current||token!==generation.current)return;
   // Audition only the visible trimmed clip, with the full-window FX history
   // already baked by the fresh helper pass.
   const buffer=makeBuffer(shown);
   const db=sourceAuditionHeadroom(buffer,level);setLevel(db);await audio.resume();current();if(!alive.current||token!==generation.current)return;
   const node=audio.getContext().createGain();node.gain.value=10**(db/20);node.connect(audio.masterGain);gain.current=node;audition.current=new SourceAudition(audio.getContext(),node,()=>{node.disconnect();if(alive.current)setPlaying(false);});audition.current.start(buffer);setPlaying(true);
  }catch(e){if(alive.current)setError(t(e instanceof Error?e.message:String(e)));stop();}
 };
 const invalidatePreview=()=>{stop();job.current?.abort();setPrepared(undefined);setError('');};
 const parameter=(address:string,value:number)=>{invalidatePreview();setParams(p=>({...p,[address]:value}));};
 return <div data-source-recall className="space-y-3"><div className="flex gap-2 items-center min-w-0"><ToolButton icon={ArrowLeft} label={t('sourceRecall.back')} disabled={busy} onClick={onBack}/><strong className="truncate flex-1">{t('sourceRecall.title')} · {plan.recipe.name}</strong><InfoButton label={t('sourceRecall.title')}>{t('sourceRecall.help')}</InfoButton></div>
  {plan.choices.length>1&&<select className="timeline-tool max-w-full" aria-label={t('sourceRecall.operation')} value={plan.operationIndex} disabled={busy||disabled} onChange={e=>onSelect(Number(e.target.value))}>{plan.choices.map(choice=><option key={choice.index} value={choice.index}>{choice.index+1} · {choice.name}</option>)}</select>}
  {plan.mixed&&<div className="flex items-center gap-2 text-xs text-gray-400"><span>{t('sourceRecall.ordered')}</span><InfoButton label={t('sourceRecall.ordered')}>{t('sourceRecall.orderedHelp')}</InfoButton></div>}
  <div className="relative overflow-hidden"><canvas ref={canvas} width={1000} height={180} data-source-recall-waveform data-source-draw-state={painted===frame?'ready':'updating'} data-source-processed={frame.processed} className="w-full h-44 rounded border border-gray-700" role="img" aria-label={t('sourceEditor.waveform')}/><div data-source-recall-window className="absolute inset-y-0 border border-sky-400/70 pointer-events-none" style={{left:`${plan.visible.start/plan.outputFrames*100}%`,width:`${(plan.visible.end-plan.visible.start)/plan.outputFrames*100}%`}}/><span className="absolute top-2 left-2 rounded bg-gray-950/85 px-2 py-1 text-xs text-gray-300 pointer-events-none">{painted!==frame?t('sourceFilter.waveform.updating'):prepared&&!original?t('sourceNative.snapshot',{rate:plan.rate/1000}):t(original?'sourceFilter.waveform.original':'sourceFilter.waveform.source')}</span><div data-source-recall-playhead ref={playhead} hidden={!playing} className="absolute inset-y-0 w-px bg-rose-400 pointer-events-none"/></div>
  <div className="flex flex-wrap gap-2 items-center"><ToolButton icon={playing?Square:Play} label={t(playing?'sourceEditor.stop':'sourceEditor.audition')} disabled={busy||disabled||!info} onClick={()=>void play()}/><button className="timeline-tool" disabled={busy||disabled||!info} onClick={render}>{t('sourcePlugins.preview')}</button>{prepared&&<><button className={`timeline-tool ${original?'!bg-indigo-600':''}`} aria-pressed={original} disabled={busy||disabled} onClick={()=>compare(true)}>{t('sourceEditor.original')}</button><button className={`timeline-tool ${!original?'!bg-indigo-600':''}`} aria-pressed={!original} disabled={busy||disabled} onClick={()=>compare(false)}>{t('sourceEditor.preview')}</button><button className="timeline-tool !bg-indigo-600" disabled={busy||disabled} onClick={()=>void action(signal=>commitSourcePluginRecall(plan,prepared,current,next=>{useProjectStore.setState(next);onBack();},signal))}>{t('sourceEditor.apply')}</button></>}</div>
  <SourceRecallSelection plan={plan} value={selection} disabled={busy||disabled||!info} onDraft={invalidatePreview} onChange={next=>{invalidatePreview();setSelection(next);}}/>
  <ParamSlider label={t('sourceNative.level')} value={level} min={-60} max={0} step={.1} unit="dB" onChange={setLevel}/>
  {info&&<details open><summary className="min-h-11 content-center cursor-pointer">{t('sourcePlugins.parameters')}</summary><fieldset disabled={busy||disabled} className="space-y-2">{info.parameters.map(p=><ParamSlider key={p.address} label={p.name} value={params[p.address]??p.value} min={p.min} max={p.max} step={(p.max-p.min)/1000||1} unit={p.unit} onChange={value=>parameter(p.address,value)}/>)}</fieldset></details>}
  {busy&&<div className="flex gap-2 items-center"><span role="status">{t('sourcePlugins.processing')}</span><button className="timeline-tool" onClick={()=>job.current?.abort()}>{t('common.cancel')}</button></div>}{disabled&&<p role="alert" className="text-amber-300">{t('sourceRecall.changed')}</p>}{error&&<p role="alert" className="text-amber-300">{error}</p>}
 </div>;
}
