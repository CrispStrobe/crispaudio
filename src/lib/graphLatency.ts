import {routingOrder} from './audioRouting';
import type {TimelineTrack} from '../types/audio';
export interface RackLatencies {clips?:ReadonlyMap<string,number>;tracks?:ReadonlyMap<string,number>;master?:number}
export interface TrackLatency {input:number;rackOutput:number;output:number;clips:Map<string,number>;ducking?:{program:number;detector:number}}
export interface GraphLatency {tracks:Map<string,TrackLatency>;routes:Map<string,number>;masterInput:number;output:number}
export const outputRoute=(id:string)=>JSON.stringify([id,'output']);
export const sendRoute=(track:string,send:string)=>JSON.stringify([track,'send',send]);
function frames(value:number){if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid graph latency');return value;}
function add(a:number,b:number){return frames(a+b);}
/** Source-first arrival times; audio merges and sidechains share one sample clock. */
export function planGraphLatency(tracks:TimelineTrack[],latencies:RackLatencies={}):GraphLatency {
 const order=routingOrder(tracks),ids=new Set(tracks.map(t=>t.id)),clips=new Set(tracks.flatMap(t=>t.segments.map(c=>c.id)));
 if(clips.size!==tracks.reduce((n,t)=>n+t.segments.length,0))throw new Error('Duplicate latency clip');
 for(const [id,value] of latencies.tracks??[]){if(!ids.has(id))throw new Error('Unknown latency track');frames(value);}
 for(const [id,value] of latencies.clips??[]){if(!clips.has(id))throw new Error('Unknown latency clip');frames(value);}
 const incoming=new Map<string,number>(),result=new Map<string,TrackLatency>();let masterInput=0;
 for(const track of order){const input=track.kind==='bus'?(incoming.get(track.id)??0):Math.max(0,...track.segments.map(c=>latencies.clips?.get(c.id)??0)),rackOutput=add(input,frames(latencies.tracks?.get(track.id)??0));let output=rackOutput,ducking:TrackLatency['ducking'];
  if(track.ducking){const detector=result.get(track.ducking.source)?.output;if(detector===undefined)throw new Error('Unresolved latency detector');output=Math.max(rackOutput,detector);ducking={program:output-rackOutput,detector:output-detector};}
  const delays=new Map(track.segments.map(c=>[c.id,input-(latencies.clips?.get(c.id)??0)]));result.set(track.id,{input,rackOutput,output,clips:delays,ducking});
  for(const target of [track.output??'master',...(track.sends??[]).map(s=>s.target)]){if(target==='master')masterInput=Math.max(masterInput,output);else incoming.set(target,Math.max(incoming.get(target)??0,output));}
 }
 const routes=new Map<string,number>();for(const track of tracks){const arrival=result.get(track.id)!.output,delay=(target:string)=>(target==='master'?masterInput:result.get(target)!.input)-arrival;routes.set(outputRoute(track.id),frames(delay(track.output??'master')));for(const send of track.sends??[])routes.set(sendRoute(track.id,send.id),frames(delay(send.target)));}
 return {tracks:result,routes,masterInput,output:add(masterInput,frames(latencies.master??0))};
}
/** Choose the graph origin after asynchronous preparation; audible clock holds through pre-roll. */
export function graphClock(currentTime:number,sampleRate:number,latencyFrames:number,start:number,end:number,leadFrames=256){
 if(!Number.isFinite(currentTime)||currentTime<0||!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000||!Number.isFinite(start)||start<0||!Number.isFinite(end)||end<start)throw new Error('Invalid graph clock');frames(latencyFrames);frames(leadFrames);
 const input=frames(Math.ceil(currentTime*sampleRate)+leadFrames),audible=add(input,latencyFrames);return {input,audible,endFrame:add(audible,Math.ceil((end-start)*sampleRate)),time:(contextTime:number)=>Math.max(start,Math.min(end,start+contextTime-audible/sampleRate)),anchor:{frame:audible,timeline:start}};
}
