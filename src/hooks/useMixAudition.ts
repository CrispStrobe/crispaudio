import {useEffect,useRef,useState,useCallback,useContext} from 'react';
import {useAudioEngine} from './useAudioEngine';
import {useProjectStore} from '../stores/projectStore';
import {TimelineEngineContext} from '../components/timeline/timelineEngineContext';
import type {MixSlot} from '../lib/mixVersions';
/** Both buffers share one start clock; A/B changes gain, never arrangement or history. */
export function useMixAudition(){
 const audio=useAudioEngine(),main=useContext(TimelineEngineContext),nodes=useRef<{sources:AudioBufferSourceNode[];gains:GainNode[]}|null>(null),[playing,setPlaying]=useState(false),generation=useRef(0);
 const stop=useCallback(()=>{generation.current++;const active=nodes.current;nodes.current=null;if(active)for(const source of active.sources){try{source.stop();}catch{/* Already ended. */}source.disconnect();}active?.gains.forEach(g=>g.disconnect());setPlaying(false);},[]);
 useEffect(()=>stop,[stop]);
 const select=(slot:MixSlot,levels:[number,number])=>{const active=nodes.current;if(!active)return;active.gains.forEach((gain,i)=>gain.gain.setTargetAtTime((slot==='A'?i===0:i===1)?levels[i]:0,audio.getContext().currentTime,.005));};
 const play=async(buffers:[AudioBuffer,AudioBuffer],slot:MixSlot,levels:[number,number],loop:boolean)=>{stop();const token=generation.current;main?.current?.stop();useProjectStore.getState().setIsPlaying(false);await audio.resume();if(token!==generation.current)return;const ctx=audio.getContext(),when=ctx.currentTime+.02,sources:AudioBufferSourceNode[]=[],gains:GainNode[]=[];for(let i=0;i<2;i++){const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffers[i];source.loop=loop;gain.gain.value=(slot==='A'?i===0:i===1)?levels[i]:0;source.connect(gain);gain.connect(audio.masterGain);source.start(when);sources.push(source);gains.push(gain);}nodes.current={sources,gains};sources[0].onended=()=>{if(nodes.current?.sources===sources)stop();};setPlaying(true);};
 return {playing,play,select,stop};
}
