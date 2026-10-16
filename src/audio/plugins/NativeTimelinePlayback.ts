import type {LoudnessReading} from '../dsp/loudness';
import type {TimelineProject} from '../../types/audio';
import {nativeEffectScopes} from '../../lib/nativeEffects';
import {supportsNativeTrackEffectParameter,nativeTrackEffectParameters,effectParameterDefault} from '../../lib/effectAutomation';
import {invoke} from '@tauri-apps/api/core';
export interface NativePlaybackStatus {
 phase:'preparing'|'playing'|'paused'|'ended'|'fault'|'stopped';frame:number;clockTimeMs:number;
 maxProcessMs?:number;renderedFrames:number;callbacks:number;fault:number;peaks:[number,number];error?:string;
 loudness?:LoudnessReading;appliedRevision:number;meters?:Record<string,{peak:number;rms:number}>;
 summary?:{helpersClosed:boolean;muted:boolean;ringSlots:number;queueBuffers:number;samples:{frame:number;left:number;right:number}[]};
}
export interface NativePlaybackOptions {startFrame:number;endFrame:number;cycle?:boolean;loopStartFrame?:number;device?:string;muted?:boolean}
/** Sparse transport controls only; PCM and deadlines stay native after upload. */
export class NativeTimelinePlayback {
 private readonly session:string;private readonly onClosed:()=>void;
 private closing?:Promise<unknown>;private closed=false;
 private constructor(session:string,onClosed:()=>void){this.session=session;this.onClosed=onClosed;}
 static async open(snapshot:string,options:NativePlaybackOptions,onClosed:()=>void){
  const session=await invoke<string>('native_playback_start',{snapshot,...options,cycle:options.cycle??false});
  return new NativeTimelinePlayback(session,onClosed);
 }
 status(){if(this.closed)return Promise.reject(new DOMException('Native playback closed','AbortError'));return invoke<NativePlaybackStatus>('native_playback_status',{session:this.session});}
 update(project:TimelineProject){
  if(this.closed)return Promise.reject(new DOMException('Native playback closed','AbortError'));
  const controls={masterVolume:project.masterVolume??1,tracks:project.tracks.map(track=>({id:track.id,volume:track.volume,pan:track.pan,muted:track.muted,solo:track.solo,automation:track.automation??null,panAutomation:track.panAutomation??null,effectAutomation:(track.effects??[]).flatMap((effect,index)=>effect.enabled?nativeTrackEffectParameters.filter(parameter=>supportsNativeTrackEffectParameter(effect.type,parameter)).map(parameter=>({index,parameter,value:effect.params[parameter]===undefined?effectParameterDefault(effect.type,parameter):effect.params[parameter],points:effect.automation?.[parameter]??null})):[]),sends:(track.sends??[]).map(send=>send.gain)})),native:nativeEffectScopes(project).flatMap(([scope,effects])=>(effects??[]).filter(effect=>effect.enabled).map(effect=>({scope,instanceId:effect.instanceId,parameters:effect.parameters,bypass:effect.bypass})))};
  return invoke<number>('native_playback_update',{session:this.session,controls});
 }
 resetLoudness(){if(!this.closed)return invoke<void>('native_playback_reset_loudness',{session:this.session});return Promise.resolve();}
 pause(paused=true){if(this.closed)return Promise.reject(new DOMException('Native playback closed','AbortError'));return invoke<void>('native_playback_pause',{session:this.session,paused});}
 volume(volume:number){if(!Number.isFinite(volume)||volume<0||volume>1)return Promise.reject(new Error('Invalid monitor volume'));if(this.closed)return Promise.reject(new DOMException('Native playback closed','AbortError'));return invoke<void>('native_playback_volume',{session:this.session,volume});}
 close(){if(this.closing)return this.closing;this.closed=true;this.closing=invoke('native_playback_close',{session:this.session}).finally(this.onClosed);return this.closing;}
}
