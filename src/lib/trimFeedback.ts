import type {TimelineProject} from '../types/audio';
import {linkedIds,projectClips,trimClips} from './projectEdits';
import {clipSource,frameTime} from './videoEditing';

type Sources=Map<string,{duration:number}>;
export interface SourceHandle {id:string;name:string;duration:number;start:number;end:number;before:number;after:number}
export interface TrimFeedback {ids:string[];side:'left'|'right';requested:number;applied:number;limited:boolean;error?:string}

/** Source-clock handles across every linked/named-group partner. */
export function sourceHandles(project:TimelineProject,ids:string[],sources:Sources):SourceHandle[] {
 const selected=new Set(linkedIds(project,ids));
 return projectClips(project).filter(c=>selected.has(c.id)).map(c=>{
  const duration='trackId' in c?sources.get(c.sourceId)?.duration:clipSource(project.video,c)?.duration;
  if(duration===undefined)throw new Error('trimFeedback.missingSource');
  if(![duration,c.sourceOffset,c.duration,c.startTime].every(Number.isFinite)||duration<=0||c.sourceOffset<0||c.duration<=0||c.startTime<0||c.sourceOffset+c.duration>duration+1e-6)throw new Error('trimFeedback.invalidSource');
  return {id:c.id,name:'trackId' in c?project.tracks.find(t=>t.id===c.trackId)?.name??c.name:clipSource(project.video,c)?.name??'Video',duration,start:c.sourceOffset,end:c.sourceOffset+c.duration,before:c.sourceOffset,after:Math.max(0,duration-c.sourceOffset-c.duration)};
 });
}

/** Every drag is computed from its press snapshot, keeping source and timeline clocks together. */
export function pointerTrim(project:TimelineProject,id:string,side:'left'|'right',requested:number,sources:Sources):{project:TimelineProject;feedback:TrimFeedback} {
 const ids=linkedIds(project,[id]),selected=projectClips(project).filter(c=>ids.includes(c.id)),clip=selected.find(c=>c.id===id);
 if(!clip||!Number.isFinite(requested))throw new Error('trimEdits.amount');
 const handles=sourceHandles(project,ids,sources);
 if(project.tracks.some(t=>t.locked&&t.segments.some(c=>ids.includes(c.id)))||(project.video?.locked&&selected.some(c=>!('trackId' in c))))throw new Error('trimEdits.locked');
 const picture=selected.some(c=>!('trackId' in c)),fps=project.frameRate??25;
 if(picture&&(!Number.isFinite(fps)||fps<=0))throw new Error('trimEdits.frameEdge');
 const width=picture?1/fps:.01,edge=side==='left'?clip.startTime:clip.startTime+clip.duration;
 let min=-Infinity,max=Infinity;
 for(let i=0;i<selected.length;i++){
  const c=selected[i],h=handles[i];
  min=Math.max(min,side==='left'?Math.max(-h.before,-c.startTime):width-c.duration);
  max=Math.min(max,side==='left'?c.duration-width:h.after);
 }
 let delta=picture?frameTime(edge+requested,fps)-edge:requested;
 const quantized=delta;
 if(picture){min=Math.ceil((edge+min)*fps-1e-7)/fps-edge;max=Math.floor((edge+max)*fps+1e-7)/fps-edge;}
 if(min>max+1e-7)throw new Error('trimFeedback.invalidSource');
 delta=Math.max(min,Math.min(max,delta));
 const next=Math.abs(delta)<1e-10?project:trimClips(project,[id],side,delta,sources,true),result=projectClips(next).find(c=>c.id===id)!;
 const applied=side==='left'?result.startTime-clip.startTime:result.duration-clip.duration;
 return {project:next,feedback:{ids,side,requested,applied,limited:Math.abs(applied-quantized)>1e-6}};
}
