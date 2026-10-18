import {invoke} from '@tauri-apps/api/core';
import type {NativeRecordingManifest} from '../../lib/nativeRecordingTakes';
export interface NativeMonitorLevels {backing:number;output:number}
export function checkNativeMonitorLevels(levels:NativeMonitorLevels){if(![levels.backing,levels.output].every(value=>Number.isFinite(value)&&value>=0&&value<=1))throw new Error('Invalid native monitor levels');}
export function checkNativeCue(controls:NativeCueControls){if(!Number.isFinite(controls.gain)||controls.gain<0||controls.gain>4||!Number.isFinite(controls.pan)||controls.pan< -1||controls.pan>1||typeof controls.mono!=='boolean')throw new Error('Invalid native cue controls');}
export interface NativeCueControls {gain:number;pan:number;mono:boolean}
export interface NativeRecordingOptions {
 monitorMix?:NativeMonitorLevels;
 device:string;projectStartFrame:number;recordStartFrame:number;recordEndFrame?:number;cycle:boolean;
 leadFrames:number;countInFrames:number;maxFrames:number;
 click?:{tempo:number;numerator:number;denominator:number;originSeconds:number;level:number;metronome:boolean};
 inputs:{trackId:string;device:string;channels:number[];cue?:NativeCueControls;monitorFx:boolean;correction:{frames:number;basis:'unqualified'|'manual'|'measured'}}[];
}
export interface NativeRecordingResult {phase:'complete'|'fault';directory?:string;manifest?:NativeRecordingManifest;error?:string}
export interface NativeRecordingStatus {
 phase:'preparing'|'lead'|'recording'|'complete'|'fault';directory?:string;frame?:number;elapsedFrames?:number;callbacks?:number;error?:string;
 inputs?:{trackId:string;frames:number;peaks:[number,number];channels:number;cueFault?:string}[];
}
export interface NativeInputInventory {permission:'Authorized'|'Undetermined'|'Restricted'|'Denied';devices:{uid:string;label:string;channels:number;nominalRate:number;isDefault:boolean}[]}
const closed=()=>new DOMException('Native recording closed','AbortError');
/** Commands own hardware, clocks, files and polling. This client only carries
 * sparse controls and meter reports; no sample placement uses browser time. */
export class NativeTimelineRecording {
 private closing?:Promise<NativeRecordingResult>;
 private readonly session:string;private readonly onClosed:()=>void;
 private constructor(session:string,onClosed:()=>void){this.session=session;this.onClosed=onClosed;}
 static inputs(){return invoke<NativeInputInventory>('native_recording_inputs');}
 static async open(snapshot:string,options:NativeRecordingOptions,onClosed:()=>void){
  const session=await invoke<string>('native_recording_start',{snapshot,options});
  return new NativeTimelineRecording(session,onClosed);
 }
 status(){if(this.closing)return Promise.reject(closed());return invoke<NativeRecordingStatus>('native_recording_status',{session:this.session});}
 cue(track:string,controls:NativeCueControls){
  if(this.closing)return Promise.reject(closed());
  try{checkNativeCue(controls);}catch(error){return Promise.reject(error);}
  return invoke<void>('native_recording_cue',{session:this.session,track,controls});
 }
 mix(levels:NativeMonitorLevels){
  if(this.closing)return Promise.reject(closed());
  try{checkNativeMonitorLevels(levels);}catch(error){return Promise.reject(error);}
  return invoke<void>('native_recording_mix',{session:this.session,levels});
 }
 close(cancel=false){
  if(this.closing)return this.closing;
  this.closing=invoke<NativeRecordingResult>('native_recording_close',{session:this.session,cancel}).finally(this.onClosed);
  return this.closing;
 }
}
