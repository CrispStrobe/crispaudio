import type {AudioSource,TimelineProject} from '../types/audio';
import {timelineDuration} from './timelineView';
import {videoClips} from './videoEditing';
import {transcriptSrt} from './transcript';
import {captionVtt} from './graphics';
export interface DeliverySettings {
 format:'wav'|'flac'|'aac'|'mp4'|'mov';scope:'project'|'range'|'selection'|'stems';
 layout:'stereo'|'mono';bitDepth:16|24|32;bitrateKbps:number;
 width:number;height:number;frameRate:number;quality:'highest'|'prores';captions:'none'|'srt'|'vtt'|'burn';
}
export const DELIVERY_DEFAULTS:DeliverySettings={format:'wav',scope:'project',layout:'stereo',bitDepth:24,bitrateKbps:192,width:1920,height:1080,frameRate:25,quality:'highest',captions:'none'};
export const DELIVERY_PRESETS:Record<string,Partial<DeliverySettings>>={archive:{format:'wav',layout:'stereo',bitDepth:24},landscape:{format:'mp4',width:1920,height:1080,frameRate:25,quality:'highest',layout:'stereo'},portrait:{format:'mp4',width:1080,height:1920,frameRate:25,quality:'highest',layout:'stereo'},review:{format:'mp4',width:1280,height:720,frameRate:25,quality:'highest',layout:'stereo'}};
export interface DeliveryPlan {name:string;project:TimelineProject;sources:Map<string,AudioSource>;settings:DeliverySettings;range:{start:number;end:number};sidecar?:{extension:string;text:string};}
export function planDelivery(project:TimelineProject,sources:Map<string,AudioSource>,settings:DeliverySettings,ids:string[]=[],stems:string[]=[]):DeliveryPlan[]{
 const s={...settings},video=s.format==='mp4'||s.format==='mov';
 if(!['wav','flac','aac','mp4','mov'].includes(s.format)||!['project','range','selection','stems'].includes(s.scope)||!['stereo','mono'].includes(s.layout)||!['highest','prores'].includes(s.quality)||!['none','srt','vtt','burn'].includes(s.captions)||![16,24,32].includes(s.bitDepth)||!Number.isFinite(s.bitrateKbps)||s.bitrateKbps<64||s.bitrateKbps>320)throw new Error('delivery.invalid');
 if(s.layout==='mono'&&s.format!=='wav'||video&&s.quality==='prores'&&s.format!=='mov')throw new Error('delivery.unsupported');
 if(video&&(!project.video||![s.width,s.height].every(v=>Number.isInteger(v)&&v>=64&&v<=4096&&v%2===0)||!Number.isFinite(s.frameRate)||s.frameRate<1||s.frameRate>60))throw new Error('delivery.invalid');
 if(s.captions==='burn'&&!video||s.scope==='stems'&&video)throw new Error('delivery.unsupported');
 const snapshot=structuredClone(project);let start=0,end=Math.max(project.duration,timelineDuration(project));
 if(s.scope==='range'){if(!project.editRange)throw new Error('delivery.rangeMissing');({start,end}=project.editRange);}
 if(s.scope==='selection'){
  const selected=new Set(ids),clips=[...project.tracks.flatMap(t=>t.segments),...(project.video?videoClips(project.video):[])].filter(c=>selected.has(c.id));if(!clips.length)throw new Error('delivery.selectionMissing');
  start=Math.min(...clips.map(c=>c.startTime));end=Math.max(...clips.map(c=>c.startTime+c.duration));
  snapshot.tracks=snapshot.tracks.map(t=>({...t,solo:false,segments:t.segments.filter(c=>selected.has(c.id))}));
  if(snapshot.video)snapshot.video={...snapshot.video,clips:videoClips(snapshot.video).filter(c=>selected.has(c.id)),graphics:[],captions:undefined};
 }
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>Math.max(project.duration,timelineDuration(project))+1e-6)throw new Error('delivery.invalid');
 for(const track of snapshot.tracks)for(const clip of track.segments)if(!sources.has(clip.sourceId))throw new Error('delivery.mediaMissing');
 if(video){snapshot.frameRate=s.frameRate;snapshot.video={...snapshot.video!,width:s.width,height:s.height,inPoint:start,outPoint:end,captions:snapshot.video?.captions?{...snapshot.video.captions,burnIn:s.captions==='burn'}:undefined};}
 const cues=(snapshot.video?.captions?.cues??[]).filter(c=>c.end>start&&c.start<end).map(c=>({...c,start:Math.max(start,c.start)-start,end:Math.min(end,c.end)-start}));
 const sidecar=s.captions==='srt'?{extension:'srt',text:transcriptSrt(cues)}:s.captions==='vtt'?{extension:'vtt',text:captionVtt(cues)}:undefined;
 snapshot.duration=Math.max(snapshot.duration,timelineDuration(snapshot));
 const make=(name:string,p:TimelineProject):DeliveryPlan=>({name,project:p,sources:new Map(sources),settings:s,range:{start,end},sidecar});
 if(s.scope==='stems'){if(!stems.length||new Set(stems).size!==stems.length||stems.some(id=>!snapshot.tracks.some(t=>t.id===id)))throw new Error('delivery.stemsMissing');return stems.map(id=>make(snapshot.tracks.find(t=>t.id===id)!.name,{...snapshot,tracks:snapshot.tracks.map(t=>({...t,solo:t.id===id}))}));}
 return [make(project.name||'mix',snapshot)];
}
export type DeliveryStatus='queued'|'running'|'done'|'failed'|'cancelled';
export interface DeliveryJob {id:string;plan:DeliveryPlan;output:string;status:DeliveryStatus;phase:string;error?:string;}
/** Sequential ownership; cancellation waits for native completion before the next job. */
export class DeliveryQueue {
 jobs:DeliveryJob[]=[];private active?:AbortController;private draining=false;private stopped=false;
 private runner:(job:DeliveryJob,signal:AbortSignal,phase:(value:string)=>void)=>Promise<void>;private changed:()=>void;
 constructor(runner:(job:DeliveryJob,signal:AbortSignal,phase:(value:string)=>void)=>Promise<void>,changed:()=>void){this.runner=runner;this.changed=changed;}
 add(plan:DeliveryPlan,output:string){if(this.stopped)throw new Error('Queue closed');const job:DeliveryJob={id:crypto.randomUUID(),plan,output,status:'queued',phase:'queued'};this.jobs.push(job);this.changed();void this.drain();return job;}
 cancel(id:string){const job=this.jobs.find(j=>j.id===id);if(job?.status==='queued'){job.status='cancelled';this.changed();}else if(job?.status==='running')this.active?.abort();}
 retry(id:string,output:string){const job=this.jobs.find(j=>j.id===id);if(!job||!['failed','cancelled'].includes(job.status))throw new Error('Cannot retry this job');return this.add(job.plan,output);}
 dispose(){this.stopped=true;for(const j of this.jobs)this.cancel(j.id);}
 private async drain(){if(this.draining)return;this.draining=true;try{while(!this.stopped){const job=this.jobs.find(j=>j.status==='queued');if(!job)break;const controller=new AbortController();this.active=controller;job.status='running';job.phase='rendering';this.changed();try{await this.runner(job,controller.signal,value=>{job.phase=value;this.changed();});controller.signal.throwIfAborted();job.status='done';job.phase='done';}catch(e){job.status=controller.signal.aborted?'cancelled':'failed';job.error=e instanceof Error?e.message:String(e);}finally{this.active=undefined;this.changed();}}}finally{this.draining=false;}}
}
