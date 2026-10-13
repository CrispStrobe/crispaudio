import type {TimelineProject} from '../../types/audio';
import {planGraphLatency} from '../../lib/graphLatency';
import {prepareGraphCompensation} from './GraphCompensation';
import {prepareNativePluginNode} from './NativePluginNode';
import type {PluginTransport} from './PluginTransport';
import type {PluginStreamRequest} from './NativePluginStream';

/** Internal insert configuration, deliberately separate from persisted project FX until export is ready. */
export type NativeTimelineRacks=ReadonlyMap<string,readonly (PluginStreamRequest & {bypass?:boolean})[]>;
export async function prepareNativeTimelineGraph(ctx:BaseAudioContext,project:TimelineProject,racks:NativeTimelineRacks,signal:AbortSignal,onFault:(reason:string)=>void,transport?:PluginTransport,processMode:'realtime'|'offline'='realtime'){
 const valid=new Set(['master',...project.tracks.map(t=>`track:${t.id}`),...project.tracks.flatMap(t=>t.segments.map(c=>`clip:${c.id}`))]);
 const requests=[...racks].map(([scope,entries])=>[scope,entries.map(r=>({...r,parameters:{...r.parameters}}))] as const);
 if(requests.some(([scope])=>!valid.has(scope)))throw new Error('Unknown native rack scope');
 if(requests.reduce((n,[,entries])=>n+entries.length,0)>8)throw new Error('At most eight native timeline inserts are supported');
 if(requests.some(([,entries])=>entries.some(r=>r.sampleRate!==ctx.sampleRate||r.channels!==2)))throw new Error('Timeline inserts require stereo at the playback sample rate');
 const chains=new Map<string,Awaited<ReturnType<typeof prepareNativePluginNode>>[]>();
 let closed=false,closing:Promise<void>|undefined;
 const close=()=>{if(closing)return closing;closed=true;closing=Promise.allSettled([...chains.values()].flat().map(node=>node.close())).then(()=>{});return closing;};
 try{
  await prepareGraphCompensation(ctx);signal.throwIfAborted();
  for(const [scope,entries] of requests){const chain:Awaited<ReturnType<typeof prepareNativePluginNode>>[]=[];chains.set(scope,chain);
   for(const request of entries){signal.throwIfAborted();const node=await prepareNativePluginNode(ctx,{...request,transport,processMode},{signal,onFault:reason=>onFault(`${scope}: ${reason}`)});chain.push(node);node.update(request.parameters??{},request.bypass??false);}
  }
  signal.throwIfAborted();
  const delay=(scope:string)=>(chains.get(scope)??[]).reduce((n,node)=>n+node.delayFrames,0);
  const latencies={tracks:new Map(project.tracks.map(t=>[t.id,delay(`track:${t.id}`)])),clips:new Map(project.tracks.flatMap(t=>t.segments.map(c=>[c.id,delay(`clip:${c.id}`)] as const))),master:delay('master')};
  const plan=planGraphLatency(project.tracks,latencies);
  return {plan,latencies,close,drain:()=>Promise.all([...chains.values()].flat().map(node=>node.drain())),bindContext:async(next:BaseAudioContext)=>{if(closed)throw new Error('Native graph closed');await prepareGraphCompensation(next);await Promise.all([...chains.values()].flat().map(node=>node.bindContext(next)));},connect:(scope:string,input:AudioNode,startFrame:number,owned:Set<AudioNode>)=>{
   if(closed)throw new Error('Native graph closed');let output=input,frame=startFrame;
   for(const bridge of chains.get(scope)??[]){const node=bridge.attach(frame);owned.add(node);output.connect(node);output=node;frame+=bridge.delayFrames;}
   return output;
  }};
 }catch(error){await close();throw error;}
}
export type NativeTimelineGraph=Awaited<ReturnType<typeof prepareNativeTimelineGraph>>;
