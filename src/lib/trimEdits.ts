import type {TimelineProject,AudioSegment,VideoClip} from '../types/audio';
import {projectClips,linkedIds,mapClips,trimClips} from './projectEdits';
import {clipSource,videoClips,frameTime} from './videoEditing';
import {editTimeRange} from './rangeEdits';
type Clip=AudioSegment|VideoClip;
type Sources=Map<string,{duration:number}>;
export class TrimEditError extends Error {}
const fail=(key:string):never=>{throw new TrimEditError(`trimEdits.${key}`);};
const same=(a:number,b:number)=>Math.abs(a-b)<1e-6;
const sourceLength=(p:TimelineProject,c:Clip,s:Sources)=>'trackId' in c?s.get(c.sourceId)?.duration:clipSource(p.video,c)?.duration;
function chosen(p:TimelineProject,ids:string[]){const selected=projectClips(p).filter(c=>linkedIds(p,ids).includes(c.id));if(!selected.length)fail('selection');return selected;}
function unlocked(p:TimelineProject,ids:Set<string>){if(p.tracks.some(t=>t.locked&&t.segments.some(c=>ids.has(c.id)))||(p.video?.locked&&videoClips(p.video).some(c=>ids.has(c.id))))fail('locked');}
const fitFade=(c:Clip):Clip=>'trackId' in c?{...c,fadeInDuration:Math.min(c.fadeInDuration,c.duration),fadeOutDuration:Math.min(c.fadeOutDuration,c.duration)}:{...c,fadeIn:Math.min(c.fadeIn,c.duration/2),fadeOut:Math.min(c.fadeOut,c.duration/2)};

/** Roll each selected left clip's shared cut with its adjacent right clip. */
export function rollCut(p:TimelineProject,ids:string[],delta:number,sources:Sources):TimelineProject{
 const left=chosen(p,ids),cut=left[0].startTime+left[0].duration,rights:Clip[]=[];
 if(!Number.isFinite(delta))fail('amount');
 if(left.some(c=>!same(c.startTime+c.duration,cut)))fail('sharedCut');
 for(const clip of left){
  const lane='trackId' in clip?p.tracks.find(t=>t.id===clip.trackId)?.segments??[]:videoClips(p.video);
  const candidates=lane.filter(c=>c.id!==clip.id&&same(c.startTime,cut));
  if(candidates.length!==1)fail('adjacent');rights.push(candidates[0]);
 }
 const leftIds=new Set(left.map(c=>c.id)),rightIds=new Set(rights.map(c=>c.id));
 if([...rightIds].some(id=>leftIds.has(id))||linkedIds(p,[...rightIds]).some(id=>!rightIds.has(id)))fail('linkedCut');
 unlocked(p,new Set([...leftIds,...rightIds]));
 if(rights.some(c=>!('trackId' in c)&&c.transition!=='cut'))fail('blend');
 if(left.some(c=>!('trackId' in c)))delta=frameTime(cut+delta,p.frameRate??25)-cut;
 if(left.some(c=>{const n=sourceLength(p,c,sources);return n===undefined||c.duration+delta<.01||c.sourceOffset+c.duration+delta>n+1e-6;})||rights.some(c=>c.duration-delta<.01||c.sourceOffset+delta<0))fail('handles');
 return mapClips(p,c=>leftIds.has(c.id)?fitFade({...c,duration:c.duration+delta}):rightIds.has(c.id)?fitFade({...c,startTime:c.startTime+delta,sourceOffset:c.sourceOffset+delta,duration:(c.startTime+c.duration)-(c.startTime+delta)}):c);
}

/** Shared-edge trim to a playhead; source bounds are explicit, never silent clamps. */
export function trimToPlayhead(p:TimelineProject,ids:string[],side:'left'|'right',time:number,sources:Sources):TimelineProject{
 const selected=chosen(p,ids),edge=side==='left'?selected[0].startTime:selected[0].startTime+selected[0].duration;
 if(selected.some(c=>!same(side==='left'?c.startTime:c.startTime+c.duration,edge)))fail('sharedCut');
 if(selected.some(c=>!('trackId' in c)))time=frameTime(time,p.frameRate??25);
 if(!Number.isFinite(time)||time<0)fail('amount');
 unlocked(p,new Set(selected.map(c=>c.id)));
 const delta=time-edge;
 if(selected.some(c=>{const n=sourceLength(p,c,sources);return n===undefined||(side==='left'?(c.sourceOffset+delta<0||c.duration-delta<.01):(c.duration+delta<.01||c.sourceOffset+c.duration+delta>n+1e-6));}))fail('handles');
 return trimClips(p,ids,side,delta,sources);
}

/** Ripple trims use saved lane scope and the reviewed range-edit contract. */
export function rippleTrim(p:TimelineProject,ids:string[],side:'left'|'right',delta:number,sources:Sources):TimelineProject{
 const selected=chosen(p,ids),edge=side==='left'?selected[0].startTime:selected[0].startTime+selected[0].duration;
 if(selected.some(c=>!same(side==='left'?c.startTime:c.startTime+c.duration,edge)))fail('sharedCut');
 if(!Number.isFinite(delta)||delta===0)fail('amount');
 if(p.video&&p.video.rippleEnabled!==false){if(!same(edge,frameTime(edge,p.frameRate??25)))fail('frameEdge');delta=frameTime(edge+delta,p.frameRate??25)-edge;}
 if(delta===0)fail('amount');
 if(selected.some(c=>'trackId' in c?p.tracks.find(t=>t.id===c.trackId)?.rippleEnabled===false:p.video?.rippleEnabled===false))fail('scope');
 // Check handles before ripple changes; extending into the old neighbour is
 // valid because insertion moves that neighbour away before applying the trim.
 unlocked(p,new Set(selected.map(c=>c.id)));
 if(selected.some(c=>{const n=sourceLength(p,c,sources);return n===undefined||(side==='left'?(c.sourceOffset+delta<0||c.duration-delta<.01):(c.duration+delta<.01||c.sourceOffset+c.duration+delta>n+1e-6));}))fail('handles');
 const shorten=side==='left'?delta>0:delta<0;
 if(shorten)return editTimeRange(p,Math.min(edge,edge+delta),Math.max(edge,edge+delta),'extract');
 const length=Math.abs(delta),insert=editTimeRange(p,edge,edge+length,'insert'),selectedIds=new Set(selected.map(c=>c.id));
 return mapClips(insert,c=>selectedIds.has(c.id)?fitFade(side==='left'?{...c,startTime:c.startTime-length,sourceOffset:c.sourceOffset-length,duration:c.duration+length}:{...c,duration:c.duration+length}):c);
}

export function adjacentEdit(p:TimelineProject,time:number,direction:-1|1):number{
 const points=[...new Set([0,p.duration,...projectClips(p).flatMap(c=>[c.startTime,c.startTime+c.duration])])].sort((a,b)=>a-b);
 return direction<0?points.filter(t=>t<time-1e-6).at(-1)??0:points.find(t=>t>time+1e-6)??p.duration;
}
