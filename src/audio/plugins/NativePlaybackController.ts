import {nativeEffectScopes} from '../../lib/nativeEffects';
import {nativeParameterTarget,type NativeParameterTarget} from '../../lib/nativeParameterAutomation';
import type {AudioSource,EffectConfig,NativeEffect,TimelineProject} from '../../types/audio';
import type {AutomationTarget} from '../../lib/automationRecording';
import {builtinEffectScopes,supportsNativeEffectParameter,nativeEffectParameters,delayParameterMaximum,type DelayParameter} from '../../lib/effectAutomation';
import {renderedPreviewKey,renderedSourcesMatch} from './RenderedPreviewCache';
import {NativeTimelineSnapshot} from './NativeTimelineSnapshot';
import type {NativeTimelinePlayback,NativePlaybackStatus} from './NativeTimelinePlayback';
// Keys are process-local graph identities, never saved as project/plugin state.
const stateIDs=new Map<string,string>();let nextState=0;
function stateKey(state:string){let id=stateIDs.get(state);if(!id){if(stateIDs.size>=64)stateIDs.clear();id=String(++nextState);stateIDs.set(state,id);}return id;}
function rack(effects:NativeEffect[]|undefined){return effects?.map(effect=>({...effect,parameters:{},parameterAutomation:undefined,bypass:false,state:stateKey(effect.state)}));}
function effectStructure(effects:TimelineProject['tracks'][number]['effects']){
 return effects?.map(effect=>{
  if(!nativeEffectParameters.some(parameter=>supportsNativeEffectParameter(effect.type,parameter)))return effect;
  const automation={...effect.automation},params={...effect.params};
  for(const parameter of nativeEffectParameters)if(supportsNativeEffectParameter(effect.type,parameter)){
   delete automation[parameter];
   // Keep malformed static values structural so preparation still rejects them.
   if(params[parameter]===undefined||typeof params[parameter]==='number'&&Number.isFinite(params[parameter]))delete params[parameter];
  }
  return {...effect,params,automation:Object.keys(automation).length?automation:undefined};
 });
}
/** Live controls do not invalidate topology or replace running DSP. */
export function nativeLiveStructureKey(project:TimelineProject){
 return renderedPreviewKey({...project,masterVolume:undefined,masterEffects:effectStructure(project.masterEffects)!,nativeEffects:rack(project.nativeEffects),tracks:project.tracks.map(track=>({...track,volume:1,pan:0,muted:false,solo:false,automation:undefined,panAutomation:undefined,effects:effectStructure(track.effects),sends:track.sends?.map(send=>({...send,gain:1})),nativeEffects:rack(track.nativeEffects),segments:track.segments.map(clip=>({...clip,effects:effectStructure(clip.effects)!,nativeEffects:rack(clip.nativeEffects)}))}))});
}
const interrupted=()=>new DOMException('Native playback superseded','AbortError');
export class NativePlaybackController {
 private snapshot?:NativeTimelineSnapshot;private playback?:NativeTimelinePlayback;
 private preparationTask?:Promise<void>;private preparing?:AbortController;private generation=0;private closing:Promise<void>=Promise.resolve();
 private key?:string;private sources?:Map<string,AudioSource>;private first=0;private last=0;private cycle=false;
 private automationOverrides=new Map<string,{gain?:number;pan?:number}>();
 private nativeDefaults=new Map<string,Record<string,number>>();
 private nativeOverrides=new Map<string,Map<string,Map<string,{min:number;max:number;value:number}>>>();
 private effectOverrides=new Map<string,Map<number,Partial<Record<DelayParameter,number>>>>();
 private statusValue?:NativePlaybackStatus;private pending?:TimelineProject;private updating?:Promise<void>;
 private readonly onChange:()=>void;private readonly onFault:(error:unknown)=>void;
 constructor(onChange:()=>void,onFault:(error:unknown)=>void){this.onChange=onChange;this.onFault=onFault;}
 get status(){return this.statusValue;}
 get active(){return !!this.playback||!!this.preparing;}
 clock(){
  const status=this.statusValue;if(!status)return;
  let frame=status.frame+(status.phase==='playing'&&status.clockTimeMs?Math.max(0,Date.now()-status.clockTimeMs)*48:0);
  if(this.cycle&&frame>=this.last)frame=this.first+(frame-this.first)%(this.last-this.first);else frame=Math.min(this.last,frame);
  return frame/48000;
 }
 play(project:TimelineProject,sources:Map<string,AudioSource>,position:number,start:number,end:number,cycle:boolean,muted=false){
  const key=nativeLiveStructureKey(project),frame=Math.round(position*48000);
  if(this.playback&&this.statusValue?.phase==='paused'&&this.key===key&&this.sources&&renderedSourcesMatch(this.sources,sources)&&this.first===Math.round(start*48000)&&this.last===Math.round(end*48000)&&this.cycle===cycle&&Math.abs(this.statusValue.frame-frame)<=1){
   return this.playback.pause(false).then(()=>this.poll());
  }
  const previous=this.stop();const generation=++this.generation,controller=new AbortController();this.preparing=controller;
  const check=()=>{controller.signal.throwIfAborted();if(generation!==this.generation)throw interrupted();};
  this.first=Math.round(start*48000);this.last=Math.round(end*48000);this.cycle=cycle;
  this.statusValue={phase:'preparing',frame,clockTimeMs:0,renderedFrames:0,callbacks:0,fault:0,peaks:[0,0],appliedRevision:0};this.onChange();
  const task=(async()=>{let snapshot:NativeTimelineSnapshot|undefined;
  try{
   await previous;check();snapshot=await NativeTimelineSnapshot.create(project,sources,{signal:controller.signal});check();
   const playback=await snapshot.startPlayback({startFrame:frame,endFrame:this.last,cycle,loopStartFrame:this.first,muted});check();
   this.snapshot=snapshot;this.playback=playback;this.key=key;this.sources=new Map(sources);this.preparing=undefined;await this.poll();
  }catch(error){await snapshot?.close().catch(()=>{});if(this.preparing===controller)this.preparing=undefined;if(generation===this.generation){this.statusValue=undefined;this.onChange();}throw generation===this.generation?error:interrupted();}
  })();this.preparationTask=task;return task.finally(()=>{if(this.preparationTask===task)this.preparationTask=undefined;});
 }
 async poll(){
  const playback=this.playback;if(!playback)return;
  let status:NativePlaybackStatus;try{status=await playback.status();}catch(error){if(this.playback!==playback)return;throw error;}if(this.playback!==playback)return;
  this.statusValue=status;this.onChange();if(status.phase==='fault'){const error=new Error(status.error??`Native playback fault (${status.fault})`);void this.stop();this.onFault(error);}
 }
 async pause(){
  const playback=this.playback;if(!playback){await this.stop();return;}
  await playback.pause();
  for(let i=0;i<200&&this.playback===playback;i++){await this.poll();if(this.statusValue?.phase==='paused'||this.statusValue?.phase==='ended')return;await new Promise(resolve=>setTimeout(resolve,5));}
  if(this.playback===playback)throw new Error('Native playback did not pause');
 }
 /** Audition native mix lanes without modifying the saved project or DSP topology. */
 previewAutomation(project:TimelineProject,target:AutomationTarget,value?:number):boolean{
  if(target.parameter!=='gain'&&target.parameter!=='pan')return this.previewEffectAutomation(project,`track:${target.trackId}`,target.effectIndex??-1,target.parameter,value);
  if(!this.playback||!['playing','paused'].includes(this.statusValue?.phase??'')||!['gain','pan'].includes(target.parameter)||!project.tracks.some(track=>track.id===target.trackId))return false;
  const parameter=target.parameter as 'gain'|'pan';
  if(value!==undefined&&(!Number.isFinite(value)||(parameter==='pan'?value < -1||value > 1:value < 0||value > 10**.6)))return false;
  const previous={...this.automationOverrides.get(target.trackId)};
  if(value===undefined)delete previous[parameter];else previous[parameter]=value;
  if(previous.gain===undefined&&previous.pan===undefined)this.automationOverrides.delete(target.trackId);else this.automationOverrides.set(target.trackId,previous);
  const playback=this.playback;
  void this.update(project).catch(error=>{if(this.playback!==playback)return;void this.stop();this.onFault(error);});
  return true;
 }
 previewEffectAutomation(project:TimelineProject,scope:string,index:number,parameter:DelayParameter,value?:number):boolean{
  const effect=builtinEffectScopes(project).find(([id])=>id===scope)?.[1]?.[index];
  if(!this.playback||!['playing','paused'].includes(this.statusValue?.phase??'')||!effect?.enabled||!supportsNativeEffectParameter(effect.type,parameter)||value!==undefined&&(!Number.isFinite(value)||value<0||value>delayParameterMaximum(parameter)))return false;
  const overrides=new Map(this.effectOverrides.get(scope));
  const held={...overrides.get(index)};if(value===undefined)delete held[parameter];else held[parameter]=value;
  if(Object.keys(held).length)overrides.set(index,held);else overrides.delete(index);
  if(overrides.size)this.effectOverrides.set(scope,overrides);else this.effectOverrides.delete(scope);
  const playback=this.playback;
  void this.update(project).catch(error=>{if(this.playback!==playback)return;void this.stop();this.onFault(error);});
  return true;
 }
 previewNativeParameterAutomation(project:TimelineProject,scope:string,target:NativeParameterTarget,value?:number):boolean{
  if(!this.playback||!['playing','paused'].includes(this.statusValue?.phase??''))return false;
  try{const resolved=nativeParameterTarget(project,scope,target);if(value!==undefined){
   const baseline=resolved.effect.parameters[target.address]??target.defaultValue;
   if(!resolved.effect.enabled||resolved.effect.bypass||resolved.locked||!Number.isFinite(value)||value<0||value>1||baseline===undefined||!Number.isFinite(baseline))return false;
   if(resolved.effect.parameters[target.address]===undefined){const key=JSON.stringify([scope,target.instanceId]);this.nativeDefaults.set(key,{...this.nativeDefaults.get(key),[target.address]:baseline});}
  }}catch{return false;}
  const instances=new Map(this.nativeOverrides.get(scope)),held=new Map(instances.get(target.instanceId));
  if(value===undefined)held.delete(target.address);else held.set(target.address,{min:target.min,max:target.max,value});
  if(held.size)instances.set(target.instanceId,held);else instances.delete(target.instanceId);
  if(instances.size)this.nativeOverrides.set(scope,instances);else this.nativeOverrides.delete(scope);
  const playback=this.playback;void this.update(project).catch(error=>{if(this.playback!==playback)return;void this.stop();this.onFault(error);});return true;
 }
 private audition(project:TimelineProject):TimelineProject{
  if(!this.automationOverrides.size&&!this.effectOverrides.size&&!this.nativeOverrides.size&&!this.nativeDefaults.size)return project;
  if(this.nativeOverrides.size||this.nativeDefaults.size){project=structuredClone(project);for(const [scope,rack] of nativeEffectScopes(project))for(const effect of rack??[]){const defaults=this.nativeDefaults.get(JSON.stringify([scope,effect.instanceId]));if(defaults)effect.parameters={...defaults,...effect.parameters};const held=this.nativeOverrides.get(scope)?.get(effect.instanceId);if(held)effect.parameterAutomation={...effect.parameterAutomation,...Object.fromEntries([...held].map(([address,lane])=>[address,{min:lane.min,max:lane.max,points:[{time:0,value:lane.value}]}]))};}}
  const effects=(scope:string,rack:EffectConfig[]|undefined)=>{const overrides=this.effectOverrides.get(scope);return overrides?rack?.map((effect,index)=>overrides.has(index)?{...effect,automation:{...effect.automation,...Object.fromEntries(Object.entries(overrides.get(index)!).map(([key,value])=>[key,[{time:0,value}]]))}}:effect):rack;};
  return {...project,masterEffects:effects('master',project.masterEffects)!,tracks:project.tracks.map(track=>{
   const override=this.automationOverrides.get(track.id);
   return {...track,...(override?.gain!==undefined?{automation:[{time:0,value:override.gain}]}:{}),...(override?.pan!==undefined?{panAutomation:[{time:0,value:override.pan}]}:{}),effects:effects(`track:${track.id}`,track.effects),segments:track.segments.map(clip=>({...clip,effects:effects(`clip:${clip.id}`,clip.effects)!}))};
  })};
 }
 update(project:TimelineProject):Promise<void>{
  this.pending=project;if(this.updating)return this.updating;
  this.updating=(async()=>{while(this.pending){const next=this.pending;this.pending=undefined;const playback=this.playback;if(playback)try{await playback.update(this.audition(next));}catch(error){if(this.playback===playback)throw error;}}})().catch(error=>{this.pending=undefined;throw error;}).finally(()=>{this.updating=undefined;if(this.pending)return this.update(this.pending);});return this.updating;
 }
 resetLoudness(){return this.playback?.resetLoudness();}
 volume(value:number){return this.playback?.volume(value);}
 stop():Promise<void>{
  this.generation++;this.preparing?.abort(interrupted());this.preparing=undefined;this.pending=undefined;this.automationOverrides.clear();this.effectOverrides.clear();this.nativeOverrides.clear();this.nativeDefaults.clear();
  const pending=this.preparationTask;this.preparationTask=undefined;const snapshot=this.snapshot;this.snapshot=undefined;this.playback=undefined;this.statusValue=undefined;this.key=undefined;this.sources=undefined;
  this.closing=Promise.allSettled([this.closing,snapshot?.close(),pending]).then(()=>{});this.onChange();return this.closing;
 }
}
