import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {NativeSourceAudition,type NativeSourceInput} from '../audio/engine/NativeSourceAudition';
import {useUIStore} from '../stores/uiStore';
import {useProjectStore} from '../stores/projectStore';
interface Options {
 input:NativeSourceInput|null;identity:object;enabled:boolean;loop:boolean;bypass:boolean;levelDb:number;
 beforeStart:()=>Promise<void>;onFault:(error:unknown)=>void;
}
/** One source transport; source edits invalidate identity, controls retain DSP.
 * The monitor limiter never enters the prepared PCM or saved source recipe. */
export function useNativeSourcePreview(options:Options){
 const [phase,setPhase]=useState<'idle'|'preparing'|'playing'>('idle');
 const alive=useRef(true),generation=useRef(0),starting=useRef(false),latest=useRef(options);
 useLayoutEffect(()=>{latest.current=options;});
 const [audio]=useState(()=>new NativeSourceAudition({fault:()=>{}}));
 useLayoutEffect(()=>{audio.setEvents({
  change:()=>{if(alive.current){if(audio.active)setPhase(audio.status?.phase==='playing'?'playing':'preparing');else if(!starting.current)setPhase('idle');}},
  ended:()=>{starting.current=false;if(alive.current)setPhase('idle');},
  fault:error=>{starting.current=false;if(alive.current){setPhase('idle');latest.current.onFault(error);}},
 });},[audio]);
 const invalidate=useCallback(()=>{generation.current++;starting.current=false;},[]);
 const stop=useCallback(()=>{invalidate();if(alive.current)setPhase('idle');return audio.stop();},[audio,invalidate]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;invalidate();void audio.stop();};},[audio,invalidate]);
 useEffect(()=>()=>{void stop();},[options.identity,options.enabled,options.loop,stop]);
 useEffect(()=>{
  if(!audio.active)return;
  const current=latest.current;if(!current.input)return;
  const token=generation.current;void audio.update({parameters:current.input.effect.parameters,bypass:current.bypass,levelDb:current.levelDb}).catch(error=>{
   if(generation.current!==token||error instanceof DOMException&&error.name==='AbortError')return;
   if(alive.current)latest.current.onFault(error);
  });
 },[audio,options.input?.effect.parameters,options.bypass,options.levelDb]);
 useEffect(()=>{
  if(phase==='idle')return;let polling=false;
  const timer=setInterval(()=>{if(polling)return;polling=true;void audio.poll().finally(()=>{polling=false;});},40);
  return()=>clearInterval(timer);
 },[audio,phase]);
 const start=useCallback(async()=>{
  const previous=stop(),token=++generation.current,identity=latest.current.identity;
  const current=()=>alive.current&&generation.current===token&&latest.current.identity===identity&&latest.current.enabled&&!useUIStore.getState().timelineRecording&&!useProjectStore.getState().isPlaying;
  if(!latest.current.enabled||!latest.current.input)return;
  starting.current=true;setPhase('preparing');
  try{
   await previous;await latest.current.beforeStart();if(!current())return;
   const spec=latest.current,input=spec.input;if(!input)return;
   await audio.play({...input,effect:{...input.effect,bypass:spec.bypass}},{loop:spec.loop,levelDb:spec.levelDb,protectOutput:true,isCurrent:current});
   if(!current())return;
   starting.current=false;
   const controls=latest.current;if(controls.input)await audio.update({parameters:controls.input.effect.parameters,bypass:controls.bypass,levelDb:controls.levelDb});
  }catch(error){
   if(generation.current!==token)return;await stop();
   if(alive.current&&!(error instanceof DOMException&&error.name==='AbortError'))latest.current.onFault(error);
  }finally{if(generation.current===token){starting.current=false;if(!audio.active&&alive.current)setPhase('idle');}}
 },[audio,stop]);
 return {phase,playing:phase!=='idle',start,stop,position:useCallback(()=>audio.position(),[audio])};
}
