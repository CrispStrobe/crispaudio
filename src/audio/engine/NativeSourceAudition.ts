import {nativeSourceOwner,type NativeSourceLease} from './NativeSourceOwner';
import {validNativeEffects} from '../../lib/nativeEffects';
import type {AudioSource,NativeEffect,TimelineProject} from '../../types/audio';
import {NativePlaybackController} from '../plugins/NativePlaybackController';

export interface NativeSourceInput {
 channels:Float32Array[];
 sampleRate:number;
 effect:NativeEffect;
 /** Half-open sample interval within the clip PCM; history before it is retained. */
 range?:{start:number;end:number};
}
export interface NativeSourceControls {parameters:Record<string,number>;bypass:boolean;levelDb:number}
interface Options {protectOutput?:boolean;loop?:boolean;levelDb?:number;muted?:boolean;signal?:AbortSignal;isCurrent?:()=>boolean}
const interrupted=()=>new DOMException('Native source audition superseded','AbortError');
function monitorGain(db:number){if(!Number.isFinite(db)||db < -60||db>0)throw new Error('Invalid native source monitor level');return 10**(db/20);}
function sourceEffect(effect:NativeEffect){
 if(!validNativeEffects([effect])||!effect.enabled||effect.parameterAutomation!==undefined)throw new Error('Invalid native source effect');
 return structuredClone(effect);
}

/** Internal clip-history plan, deliberately independent of the editable arrangement.
 * Admission precedes allocation. Snapshot upload owns another copy; the estimate
 * includes five planar float copies at the larger source/output frame count.
 * This is an allocation estimate, not an OS resident-memory ceiling. */
export function nativeSourcePlan(input:NativeSourceInput,levelDb=0,protectOutput=false){
 const {channels,sampleRate}=input,frames=channels[0]?.length??0;
 const effect=sourceEffect(input.effect),gain=monitorGain(levelDb);
 if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000||![1,2].includes(channels.length)||!frames||channels.some(c=>!(c instanceof Float32Array)||c.length!==frames))throw new Error('Invalid native source PCM');
 const range=input.range??{start:0,end:frames};
 if(!Number.isInteger(range.start)||!Number.isInteger(range.end)||range.start<0||range.start>=range.end||range.end>frames)throw new Error('Invalid native source range');
 const outputFrames=Math.round(range.end*48000/sampleRate)-Math.round(range.start*48000/sampleRate);
 if(outputFrames<2048||frames/sampleRate>120)throw new Error('Native source audition requires 2048 output frames to 120 seconds');
 const estimatedBytes=Math.max(frames,Math.ceil(frames*48000/sampleRate)+2)*2*4*5;
 if(estimatedBytes>256*1024*1024)throw new Error('Native source audition memory limit reached');
 for(const channel of channels)for(const value of channel)if(!Number.isFinite(value))throw new Error('Invalid native source PCM');
 // The arrangement panner applies -3 dB to a mono source at center. Source
 // audition is level-neutral: duplicate mono before that stereo balance stage.
 const buffer=new AudioBuffer({numberOfChannels:2,length:frames,sampleRate});
 for(let index=0;index<2;index++)buffer.copyToChannel(channels[Math.min(index,channels.length-1)] as Float32Array<ArrayBuffer>,index);
 const source:AudioSource={id:'source-audition',name:'Source',buffer,sampleRate,channels:2,duration:buffer.duration,peaks:{min:new Float32Array(),max:new Float32Array()}};
 const project:TimelineProject={id:'source-audition',name:'Source audition',sampleRate,duration:frames/sampleRate,masterVolume:gain,masterEffects:[],outputLimiter:protectOutput?{enabled:true,ceiling:-1,release:.1}:{enabled:false},nativeEffects:[effect],tracks:[{id:'source-track',name:'Source',volume:1,pan:0,muted:false,solo:false,effects:[],segments:[{id:'source-clip',trackId:'source-track',sourceId:source.id,startTime:0,sourceOffset:0,duration:frames/sampleRate,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear',name:'Source',color:'#6366f1'}]}]};
 return {project,sources:new Map([[source.id,source]]),estimatedBytes,start:range.start/sampleRate,end:range.end/sampleRate};
}

/** SourceEditor opt-in transport. Reuses the native-owned clock,
 * latency-aligned warm bypass and exclusive output owner used by Mac Live.
 * No timers: the UI owner must poll and stop on recording/arrangement
 * start, selection/source changes and unmount. Source/owner validity is also
 * checked at every async boundary; an AbortSignal cancels a pending start.
 * Starting without a device override uses the selected macOS default output.
 * Output changes stop the audition; restarting resolves the new selected device.
 * Playback admits 44.1/48 kHz sources on the fixed 48 kHz native clock; the offline plan remains
 * rate-generic for qualification. No plugin-state capture or Apply parity is
 * implied by this transport adapter. */
export class NativeSourceAudition {
 private lease?:NativeSourceLease;
 private project?:TimelineProject;
 private rangeStart=0;
 private generation=0;
 private current?:()=>boolean;
 private detach?:()=>void;
 private controller:NativePlaybackController;
 private events:{change?:()=>void;ended?:()=>void;fault:(error:unknown)=>void};
 constructor(events:{change?:()=>void;ended?:()=>void;fault:(error:unknown)=>void}){
  this.events=events;
  this.controller=new NativePlaybackController(()=>{
   const ended=this.controller.status?.phase==='ended';
   if(ended){void this.stop();this.events.ended?.();}
   this.events.change?.();
  },error=>{void this.stop();this.events.fault(error);});
 }
 /** Replace UI subscriptions after mount without replacing the DSP owner. */
 setEvents(events:{change?:()=>void;ended?:()=>void;fault:(error:unknown)=>void}){this.events=events;}
 get active(){return this.controller.active;}
 get status(){return this.controller.status;}
 position(){return Math.max(0,(this.controller.clock()??this.rangeStart)-this.rangeStart);}
 private check(){if(this.current&&!this.current())throw interrupted();}
 async play(input:NativeSourceInput,options:Options={}){
  const previous=this.stop(),generation=++this.generation;
  // Even rejected replacement requests must join the old output before the
  // caller can fall back to rendered playback. Validate before allocating PCM.
  let plan:ReturnType<typeof nativeSourcePlan>;
  try{
   options.signal?.throwIfAborted();if(options.isCurrent&&!options.isCurrent())throw interrupted();
   if(![44100,48000].includes(input.sampleRate))throw new Error('Native source preview requires 44.1 or 48 kHz audio');
   plan=nativeSourcePlan(input,options.levelDb,options.protectOutput);
  }catch(error){await previous;throw error;}
  const lease=nativeSourceOwner.reserve(()=>this.stop());this.lease=lease;
  const check=()=>{options.signal?.throwIfAborted();if(generation!==this.generation||!lease.isCurrent()||options.isCurrent&&!options.isCurrent())throw interrupted();};
  const abort=()=>{if(generation===this.generation)void this.stop();};
  options.signal?.addEventListener('abort',abort,{once:true});
  window.addEventListener('crispaudio-output-changed',abort);
  this.detach=()=>{options.signal?.removeEventListener('abort',abort);window.removeEventListener('crispaudio-output-changed',abort);};
  this.current=options.isCurrent;this.project=plan.project;
  try{
   await Promise.all([previous,lease.ready]);check();
   // Keep the full clip in the graph: the worker prerolls from its beginning.
   // Expose only the selected interval and a selection-relative UI clock.
   this.rangeStart=Math.round(plan.start*48000)/48000;
   await this.controller.play(plan.project,plan.sources,plan.start,plan.start,plan.end,options.loop??false,options.muted??false,()=>generation===this.generation&&lease.isCurrent()&&!options.signal?.aborted&&(!options.isCurrent||options.isCurrent()));check();
   // Controls may have changed during upload/preparation. Publish the latest set
   // without opening a replacement helper or changing saved state/topology.
   if(this.project)await this.controller.update(this.project);check();
  }catch(error){if(generation===this.generation)await this.stop();throw error;}
 }
 async update(controls:NativeSourceControls){
  if(!this.project)throw interrupted();
  const generation=this.generation;
  try{
   this.check();const effect=sourceEffect({...this.project.nativeEffects![0],parameters:{...controls.parameters},bypass:controls.bypass});
   const next={...this.project,masterVolume:monitorGain(controls.levelDb),nativeEffects:[effect]};
   this.project=next;await this.controller.update(next);if(generation!==this.generation)throw interrupted();this.check();
  }catch(error){if(generation===this.generation)await this.stop();throw error;}
 }
 async poll(){
  const generation=this.generation;
  try{this.check();await this.controller.poll();if(generation===this.generation)this.check();}
  catch(error){if(generation!==this.generation)return;await this.stop();this.events.fault(error);}
 }
 stop(){this.generation++;this.detach?.();this.detach=undefined;this.current=undefined;this.project=undefined;this.rangeStart=0;const lease=this.lease;this.lease=undefined;const closing=this.controller.stop();lease?.release(closing);return closing;}
}
