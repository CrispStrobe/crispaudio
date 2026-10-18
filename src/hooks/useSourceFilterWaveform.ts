import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {renderSourceFilter,sourceFilterRenderPlan,type SourceFilterSettings} from '../audio/engine/SourceFilter';
import {LatestPreview} from '../lib/latestPreview';
import type {SampleRange} from '../lib/sourceEditing';

export const SOURCE_FILTER_WAVEFORM_BYTES=64*1024*1024;
interface Request {channels:Float32Array[];ranges:SampleRange[];channel:number;rate:number;settings:SourceFilterSettings;identity:unknown}
interface Snapshot {request:Request;pcm?:Float32Array[];error?:unknown}
/** Display-only PCM. Never feed this back into the live audio graph or publish it into project state. */
export function useSourceFilterWaveform(channels:Float32Array[],ranges:SampleRange[],channel:number,rate:number,settings:SourceFilterSettings|null,enabled:boolean,identity:unknown){
 const [snapshot,setSnapshot]=useState<Snapshot>(),queue=useRef<LatestPreview<Request,Float32Array[]>|null>(null);
 const request=useMemo<Request|null>(()=>enabled&&settings?{channels,ranges,channel,rate,settings,identity}:null,[enabled,settings,channels,ranges,channel,rate,identity]);
 let limited=false;
 if(request)try{sourceFilterRenderPlan(channels,ranges,channel,rate,request.settings,SOURCE_FILTER_WAVEFORM_BYTES);}catch{limited=true;}
 useEffect(()=>{
  const scheduler=new LatestPreview<Request,Float32Array[]>((r,signal)=>renderSourceFilter(r.channels,r.ranges,r.channel,r.rate,r.settings,signal,SOURCE_FILTER_WAVEFORM_BYTES),(r,pcm)=>setSnapshot({request:r,pcm}),(r,error)=>setSnapshot({request:r,error}));
  queue.current=scheduler;
  return()=>{scheduler.close();if(queue.current===scheduler)queue.current=null;};
 },[]);
 useEffect(()=>{
  const scheduler=queue.current;scheduler?.cancel();
  // Release previous PCM even when the tool is switched off or a new request is over budget.
  let current=true;queueMicrotask(()=>{if(current)setSnapshot(undefined);});
  if(request&&!limited)scheduler?.schedule(request);
  return()=>{current=false;scheduler?.cancel();};
 },[request,limited]);
 const pause=useCallback(async()=>{await queue.current?.cancelAndWait();},[]);
 const current=snapshot?.request===request?snapshot:undefined;
 return {pcm:current?.pcm,status:!request?'source':limited?'limited':current&&'error' in current?'error':current?.pcm?'ready':'updating',pause} as const;
}
