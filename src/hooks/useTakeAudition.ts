import {TimelineEngineContext} from '../components/timeline/timelineEngineContext';
import {useEffect,useRef,useState,useCallback,useContext} from 'react';
import {useAudioEngine} from './useAudioEngine';
import {TimelineEngine} from '../audio/engine/TimelineEngine';
import {useProjectStore} from '../stores/projectStore';
import type {TimelineProject} from '../types/audio';
/** Auditions own their graph, never their shared audio context or project history. */
export function useTakeAudition(project:TimelineProject,disabled:boolean){
 const mainEngine=useContext(TimelineEngineContext),audio=useAudioEngine(),preview=useRef<TimelineEngine|null>(null),generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),[playing,setPlaying]=useState('');
 const stop=useCallback(()=>{generation.current++;clearTimeout(timer.current);preview.current?.stop();preview.current=null;setPlaying('');},[]);
 useEffect(()=>{stop();return stop;},[project,disabled,stop]);
 useEffect(()=>useProjectStore.subscribe(state=>{if(state.isPlaying)stop();}),[stop]);
 const play=async(id:string,snapshot:TimelineProject,start:number,end:number)=>{
  if(disabled)return;if(playing===id){stop();return;}stop();const token=generation.current;
  mainEngine?.current?.stop();useProjectStore.getState().setIsPlaying(false);await audio.resume();if(token!==generation.current)return;
  const engine=new TimelineEngine(audio.getContext(),audio.masterGain);preview.current=engine;
  try{engine.setSources(useProjectStore.getState().sources);await engine.prepare(snapshot);if(token!==generation.current){engine.stop();return;}engine.play(snapshot,start,end);setPlaying(id);timer.current=setTimeout(stop,Math.max(0,end-start)*1000+100);}catch(error){stop();throw error;}
 };
 return {playing,play,stop};
}
