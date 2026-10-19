import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {renderSourcePluginWaveform,sourcePluginWaveformPlan,waitSourcePluginWaveforms} from '../audio/engine/SourcePluginWaveform';
import type {NativeSourceInput} from '../audio/engine/NativeSourceAudition';
import {LatestPreview} from '../lib/latestPreview';

interface Request {input:NativeSourceInput;identity:unknown}
interface Snapshot {request:Request;pcm?:Float32Array[];error?:unknown}
/** Separate from native transport and prepared audio. Stale PCM disappears in
 * the render that invalidates it; replacement waits for cancelled I/O to settle. */
export function useSourcePluginWaveform(input:NativeSourceInput|null,enabled:boolean,identity:unknown){
 const [snapshot,setSnapshot]=useState<Snapshot>(),queue=useRef<LatestPreview<Request,Float32Array[]>|null>(null);
 const request=useMemo<Request|null>(()=>enabled&&input?{input,identity}:null,[enabled,input,identity]);
 let limited=false;if(request)try{sourcePluginWaveformPlan(request.input);}catch{limited=true;}
 useEffect(()=>{
  const scheduler=new LatestPreview<Request,Float32Array[]>((r,signal)=>renderSourcePluginWaveform(r.input,signal),(r,pcm)=>setSnapshot({request:r,pcm}),(r,error)=>setSnapshot({request:r,error}));queue.current=scheduler;
  return()=>{scheduler.close();if(queue.current===scheduler)queue.current=null;};
 },[]);
 useEffect(()=>{
  const scheduler=queue.current;scheduler?.cancel();let current=true;
  queueMicrotask(()=>{if(current)setSnapshot(undefined);});
  if(request&&!limited)scheduler?.schedule(request,350);
  return()=>{current=false;scheduler?.cancel();};
 },[request,limited]);
 const pause=useCallback(async()=>{await queue.current?.cancelAndWait();await waitSourcePluginWaveforms();},[]);
 const current=snapshot?.request===request?snapshot:undefined;
 return {pcm:current?.pcm,status:!request?'source':limited?'limited':current&&'error' in current?'error':current?.pcm?'ready':'updating',pause} as const;
}
