import type {TimelineProject,AudioSegment,VideoClip} from '../types/audio';
import {projectClips,linkedIds,mapClips,trimClips} from './projectEdits';
import {clipSource,videoClips,frameTime,validateVideoClips} from './videoEditing';
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
  const candidates=lane.filter(c=>c.id!==clip.id&&(same(c.startTime,cut)||(!('trackId' in c)&&c.startTime>clip.startTime&&c.startTime<cut&&c.startTime+c.duration>cut&&c.transition!=='cut'&&same(c.transitionDuration,cut-c.startTime))));
  if(candidates.length!==1)fail('adjacent');rights.push(candidates[0]);
 }
 const leftIds=new Set(left.map(c=>c.id)),rightIds=new Set(rights.map(c=>c.id));
 if([...rightIds].some(id=>leftIds.has(id))||linkedIds(p,[...rightIds]).some(id=>!rightIds.has(id)))fail('linkedCut');
 unlocked(p,new Set([...leftIds,...rightIds]));
 const picture=left.some(c=>!('trackId' in c)),fps=p.frameRate??25;
 if(picture){
  if(!Number.isFinite(fps)||fps<=0||!same(cut,frameTime(cut,fps)))fail('frameEdge');
  if(validateVideoClips(videoClips(p.video),p.video!.duration,p.video!.sources))fail('blendTopology');
  if(rights.some(c=>!('trackId' in c)&&(!same(c.startTime,frameTime(c.startTime,fps))||(c.transition!=='cut'&&cut-c.startTime<1e-6))))fail('blendTopology');
  delta=frameTime(cut+delta,fps)-cut;
 }
 for(let i=0;i<left.length;i++){
  const l=left[i],r=rights[i],overlap='trackId' in r?0:Math.max(0,cut-r.startTime),width=picture?1/fps:.01;
  if(l.duration+delta<overlap+width-1e-6||r.duration-delta<overlap+width-1e-6)fail('handles');
  for(const c of [l,r]){const n=sourceLength(p,c,sources);if(n===undefined||!Number.isFinite(n)||!Number.isFinite(c.startTime)||c.startTime<0||!Number.isFinite(c.sourceOffset)||c.sourceOffset<0||!Number.isFinite(c.duration)||c.duration<=0||c.sourceOffset+c.duration>n+1e-6)fail('handles');}
 }
 if(left.some(c=>{const n=sourceLength(p,c,sources);return n===undefined||c.duration+delta<.01||c.sourceOffset+c.duration+delta>n+1e-6;})||rights.some(c=>c.duration-delta<.01||c.sourceOffset+delta<0))fail('handles');
 return mapClips(p,c=>leftIds.has(c.id)?fitFade({...c,duration:c.duration+delta}):rightIds.has(c.id)?fitFade({...c,startTime:c.startTime+delta,sourceOffset:c.sourceOffset+delta,duration:(c.startTime+c.duration)-(c.startTime+delta)}):c);
}

interface SlideContext {middle:Clip[];left:Clip[];right:Clip[];start:number;end:number;min:number;max:number;picture:boolean}
function slideContext(p:TimelineProject,ids:string[],sources:Sources):SlideContext {
 const middle=chosen(p,ids),start=middle[0].startTime,end=start+middle[0].duration,left:Clip[]=[],right:Clip[]=[];
 if(middle.some(c=>!same(c.startTime,start)||!same(c.startTime+c.duration,end)))fail('slideSpan');
 for(const clip of middle){
  const lane='trackId' in clip?p.tracks.find(t=>t.id===clip.trackId)?.segments??[]:videoClips(p.video);
  if(middle.filter(c=>'trackId' in clip?'trackId' in c&&c.trackId===clip.trackId:!('trackId' in c)).length!==1)fail('slideAdjacent');
  const before=lane.filter(c=>c.id!==clip.id&&same(c.startTime+c.duration,start)),after=lane.filter(c=>c.id!==clip.id&&same(c.startTime,end));
  if(before.length!==1||after.length!==1)fail('slideAdjacent');
  if(lane.some(c=>![clip.id,before[0].id,after[0].id].includes(c.id)&&c.startTime<after[0].startTime+after[0].duration-1e-6&&c.startTime+c.duration>before[0].startTime+1e-6))fail('slideAdjacent');
  left.push(before[0]);right.push(after[0]);
 }
 const affected=new Set([...middle,...left,...right].map(c=>c.id));
 if(affected.size!==middle.length*3||linkedIds(p,[...affected]).some(id=>!affected.has(id)))fail('linkedCut');
 unlocked(p,affected);
 const picture=middle.some(c=>!('trackId' in c)),fps=p.frameRate??25;
 if(picture&&(!Number.isFinite(fps)||fps<=0||!same(start,frameTime(start,fps))||!same(end,frameTime(end,fps))))fail('frameEdge');
 if([...middle,...right].some(c=>!('trackId' in c)&&c.transition!=='cut'))fail('blend');
 const width=picture?1/fps:.01;
 for(const c of [...middle,...left,...right]){const n=sourceLength(p,c,sources);if(n===undefined||!Number.isFinite(n)||!Number.isFinite(c.startTime)||c.startTime<0||!Number.isFinite(c.sourceOffset)||c.sourceOffset<0||!Number.isFinite(c.duration)||c.duration<width-1e-6||c.sourceOffset+c.duration>n+1e-6)fail('handles');}
 const min=Math.max(...left.map(c=>width-c.duration),...right.map(c=>-c.sourceOffset));
 const max=Math.min(...left.map(c=>sourceLength(p,c,sources)!-c.sourceOffset-c.duration),...right.map(c=>c.duration-width));
 return {middle,left,right,start,end,min,max,picture};
}
/** Source-handle limits for a reviewed slide; all linked lanes participate. */
export function slideLimits(p:TimelineProject,ids:string[],sources:Sources){const {min,max,start,end}=slideContext(p,ids,sources);return {min,max,start,end};}
/** Move middle content unchanged and trim both neighbours; outer endpoints stay fixed. */
export function slideClips(p:TimelineProject,ids:string[],delta:number,sources:Sources):TimelineProject {
 const context=slideContext(p,ids,sources);
 if(!Number.isFinite(delta))fail('amount');
 if(context.picture)delta=frameTime(context.start+delta,p.frameRate??25)-context.start;
 if(delta===0)fail('amount');
 if(delta<context.min-1e-6||delta>context.max+1e-6)fail('handles');
 const middle=new Set(context.middle.map(c=>c.id)),left=new Set(context.left.map(c=>c.id)),right=new Set(context.right.map(c=>c.id));
 return mapClips(p,c=>middle.has(c.id)?{...c,startTime:c.startTime+delta}:left.has(c.id)?fitFade({...c,duration:c.duration+delta}):right.has(c.id)?fitFade({...c,startTime:c.startTime+delta,sourceOffset:c.sourceOffset+delta,duration:(c.startTime+c.duration)-(c.startTime+delta)}):c);
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
