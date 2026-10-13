import type {TimelineProject,AudioSource} from '../types/audio';
import type {TimelineEngine} from '../audio/engine/TimelineEngine';
import {mixProject,type MixVersion} from './mixVersions';
import {linkedRenderDocument} from './projectFile';
import {measureBuffer,type LoudnessReading} from '../audio/dsp/loudness';
import {mediaJob} from './mediaJob';
import {isTauri,isIOSApp} from './native';
export interface MixMeasurement {loudness:LoudnessReading;peak:number;rms:number;duration:number;sampleRate:number;channels:number}
export async function measureMix(buffer:AudioBuffer,signal:AbortSignal):Promise<MixMeasurement>{
 let peak=0,sum=0,n=0;for(let ch=0;ch<buffer.numberOfChannels;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<data.length;i++){peak=Math.max(peak,Math.abs(data[i]));sum+=data[i]*data[i];n++;if(i%65536===65535){signal.throwIfAborted();await new Promise(resolve=>setTimeout(resolve,0));}}}return {loudness:await measureBuffer(buffer,signal),peak,rms:Math.sqrt(sum/Math.max(1,n)),duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels};
}
/** Attenuate to the quieter measured version; silence never produces a NaN/boost. */
export function comparisonGain(reading:MixMeasurement,other:MixMeasurement,match:boolean){const a=reading.loudness.integrated,b=other.loudness.integrated;return match&&a!==null&&b!==null?10**((Math.min(a,b)-a)/20):1;}
export async function comparisonBuffer(project:TimelineProject,version:MixVersion,range:{start:number;end:number},sources:Map<string,AudioSource>,engine:TimelineEngine,signal:AbortSignal):Promise<AudioBuffer>{
 const preview=mixProject(project,version,false),document=isTauri()&&!isIOSApp()&&navigator.userAgent.includes('Mac')?linkedRenderDocument(preview,sources):null;
 if(document){
  const {appDataDir,join}=await import('@tauri-apps/api/path'),{mkdir,readFile,remove}=await import('@tauri-apps/plugin-fs'),dir=await appDataDir();await mkdir(dir,{recursive:true});const output=await join(dir,`mix-preview-${crypto.randomUUID()}.wav`);
  try{await mediaJob('export_linked_project_wav',{document:{...document,renderRange:range},output,bitDepth:32},signal);const bytes=await readFile(output);signal.throwIfAborted();const ctx=new OfflineAudioContext(2,1,project.sampleRate);return await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);}finally{await remove(output).catch(()=>{});}
 }
 // A full-history browser prefix is bounded; eligible native Mac media streams it.
 if(range.end*project.sampleRate*2*4>256*1024*1024)throw new Error('mixReview.largePreview');
 return engine.renderMixRange(preview,range.start,range.end,signal,sources);
}
