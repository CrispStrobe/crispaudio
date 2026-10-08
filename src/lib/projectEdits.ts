import type { TimelineProject, AudioSegment, VideoClip, TimelineSelection } from '../types/audio';
import { videoClips, clipSource, validateVideoClips, frameTime } from './videoEditing';
import { timelineDuration } from './timelineView';

type Clip = AudioSegment | VideoClip;
export const projectClips = (p: TimelineProject): Clip[] => [...p.tracks.flatMap(t=>t.segments), ...videoClips(p.video)];
export function linkedIds(p: TimelineProject, ids: string[]): string[] {
  const all=projectClips(p), groups=new Set(all.filter(c=>ids.includes(c.id)&&c.linkGroup).map(c=>c.linkGroup));
  return all.filter(c=>ids.includes(c.id)||(c.linkGroup&&groups.has(c.linkGroup))).map(c=>c.id);
}
export function projectSelection(project:TimelineProject,ids:string[]):TimelineSelection|null {
  const selectedIds=new Set(linkedIds(project,ids)),selected=projectClips(project).filter(clip=>selectedIds.has(clip.id));
  return selected.length?{startTime:Math.min(...selected.map(clip=>clip.startTime)),endTime:Math.max(...selected.map(clip=>clip.startTime+clip.duration)),segmentIds:selected.map(clip=>clip.id)}:null;
}
function finish(p: TimelineProject): TimelineProject { return {...p,duration:timelineDuration(p)}; }
export function mapClips(p: TimelineProject, fn:(clip:Clip)=>Clip, blendVideo=false): TimelineProject {
  const tracks=p.tracks.map(t=>({...t,segments:t.segments.map(c=>fn(c) as AudioSegment)}));
  const original=videoClips(p.video); let clips=original.map(c=>fn(c) as VideoClip);
  if(blendVideo&&clips.some((clip,index)=>clip.startTime!==original[index].startTime||clip.duration!==original[index].duration))clips=automaticVideoBlends(clips);
  const video=p.video&&clips.some((c,i)=>c!==original[i])?{...p.video,clips,inPoint:undefined,outPoint:undefined}:p.video;
  const next=finish({...p,tracks,video});
  if(video&&validateVideoClips(clips,video.duration,video.sources))throw new Error('Invalid video edit: check overlaps and source bounds');
  return next;
}
export function moveClips(p:TimelineProject,ids:string[],delta:number,blendVideo=false):TimelineProject {
  const selected=linkedIds(p,ids), all=projectClips(p).filter(c=>selected.includes(c.id));
  const shift=Math.max(delta,-Math.min(...all.map(c=>c.startTime)));
  return mapClips(p,c=>selected.includes(c.id)?{...c,startTime:c.startTime+shift}:c,blendVideo);
}
export function linkClips(p:TimelineProject,ids:string[],unlink=false):TimelineProject {
  const group=unlink?undefined:crypto.randomUUID(), selected=unlink?linkedIds(p,ids):ids;
  return mapClips(p,c=>selected.includes(c.id)?{...c,linkGroup:group}:c);
}
export function slipClips(p:TimelineProject,ids:string[],delta:number,sources:Map<string,{duration:number}>):TimelineProject {
  const selected=linkedIds(p,ids), clips=projectClips(p).filter(c=>selected.includes(c.id));
  const min=Math.max(...clips.map(c=>-c.sourceOffset)),max=Math.min(...clips.map(c=>{
    const duration='trackId' in c?sources.get(c.sourceId)?.duration:clipSource(p.video,c)?.duration;
    if(duration===undefined)throw new Error('Missing source');return duration-c.sourceOffset-c.duration;
  }));
  const shift=Math.max(min,Math.min(max,delta));
  return mapClips(p,c=>selected.includes(c.id)?{...c,sourceOffset:c.sourceOffset+shift}:c);
}
export function trimClips(p:TimelineProject,ids:string[],side:'left'|'right',delta:number,sources:Map<string,{duration:number}>,blendVideo=false):TimelineProject {
  const selected=linkedIds(p,ids), clips=projectClips(p).filter(c=>selected.includes(c.id));
  let lower=-Infinity,upper=Infinity;
  for(const c of clips){
    const duration='trackId' in c?sources.get(c.sourceId)?.duration:clipSource(p.video,c)?.duration;
    if(duration===undefined)throw new Error('Missing source');
    if(side==='left'){lower=Math.max(lower,-c.sourceOffset,-c.startTime);upper=Math.min(upper,c.duration-.01);}
    else {lower=Math.max(lower,.01-c.duration);upper=Math.min(upper,duration-c.sourceOffset-c.duration);}
  }
  const shift=Math.max(lower,Math.min(upper,delta));
  return mapClips(p,c=>{
    if(!selected.includes(c.id))return c;
    const duration=c.duration+(side==='left'?-shift:shift), changes=side==='left'?{startTime:c.startTime+shift,sourceOffset:c.sourceOffset+shift}:{};
    return 'trackId' in c?{...c,...changes,duration,fadeInDuration:Math.min(c.fadeInDuration,duration),fadeOutDuration:Math.min(c.fadeOutDuration,duration)}:{...c,...changes,duration,fadeIn:Math.min(c.fadeIn,duration/2),fadeOut:Math.min(c.fadeOut,duration/2)};
  },blendVideo);
}
/** Delete an interval across all tracks, closing the gap and keeping linked offsets. */
export function rippleRange(p:TimelineProject,start:number,end:number):TimelineProject {
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw new Error('Invalid ripple range');
  // Transition handles need deliberate editing, not an implicit reconstruction.
  if(videoClips(p.video).some(c=>c.transition!=='cut'))throw new Error('Remove video transitions before ripple editing');
  const rightGroups=new Map<string,string>();
  const cut=(c:Clip):Clip[]=>{
    const stop=c.startTime+c.duration, gap=end-start;
    if(stop<=start)return [c];if(c.startTime>=end)return [{...c,startTime:c.startTime-gap}];
    const parts:Clip[]=[];
    if(c.startTime<start)parts.push({...c,duration:start-c.startTime,...('trackId' in c?{fadeOutDuration:0}:{fadeOut:0})});
    if(stop>end){let group: string|undefined;if(c.linkGroup){group=rightGroups.get(c.linkGroup);if(!group){group=crypto.randomUUID();rightGroups.set(c.linkGroup,group);}}parts.push({...c,linkGroup:group,id:crypto.randomUUID(),startTime:start,sourceOffset:c.sourceOffset+end-c.startTime,duration:stop-end,...('trackId' in c?{fadeInDuration:0}:{fadeIn:0})});}
    return parts;
  };
  const retime=(time:number)=>time<start?time:time>=end?time-(end-start):start;
  return finish({...p,tracks:p.tracks.map(t=>({...t,segments:t.segments.flatMap(c=>cut(c) as AudioSegment[]),automation:t.automation?.map(point=>({...point,time:retime(point.time)}))})),video:p.video?{...p.video,clips:videoClips(p.video).flatMap(c=>cut(c) as VideoClip[]),inPoint:undefined,outPoint:undefined}:undefined,
    markers:p.markers?.filter(m=>m.time<start||m.time>=end).map(m=>({...m,time:retime(m.time)})),transcript:p.transcript?.flatMap(c=>c.end<=start?[c]:c.start>=end?[{...c,start:retime(c.start),end:retime(c.end)}]:[])});
}
export function splitClips(p:TimelineProject,ids:string[],time:number):TimelineProject {
  const selected=linkedIds(p,ids),groups=new Map<string,string>();
  if(videoClips(p.video).some(c=>selected.includes(c.id)))time=frameTime(time,p.frameRate??25);
  const split=(c:Clip):Clip[]=>{
    if(!selected.includes(c.id)||time<=c.startTime||time>=c.startTime+c.duration)return [c];
    const left=time-c.startTime;
    let group: string | undefined;
    if(c.linkGroup){group=groups.get(c.linkGroup);if(!group){group=crypto.randomUUID();groups.set(c.linkGroup,group);}}
    return [{...c,duration:left,...('trackId' in c?{fadeOutDuration:0,fadeInDuration:Math.min(c.fadeInDuration,left)}:{fadeOut:0,fadeIn:Math.min(c.fadeIn,left)})},
      {...c,id:crypto.randomUUID(),linkGroup:group,startTime:time,duration:c.duration-left,sourceOffset:c.sourceOffset+left,...('trackId' in c?{fadeInDuration:0,fadeOutDuration:Math.min(c.fadeOutDuration,c.duration-left)}:{fadeIn:0,fadeOut:Math.min(c.fadeOut,c.duration-left),transition:'cut' as const,transitionDuration:0})}];
  };
  return finish({...p,tracks:p.tracks.map(t=>({...t,segments:t.segments.flatMap(c=>split(c) as AudioSegment[])})),video:p.video?{...p.video,clips:videoClips(p.video).flatMap(c=>split(c) as VideoClip[]),inPoint:undefined,outPoint:undefined}:undefined});
}
export function removeClips(p:TimelineProject,ids:string[]):TimelineProject {
  const selected=linkedIds(p,ids),pictures=videoClips(p.video),changed=pictures.some(c=>selected.includes(c.id));
  return finish({...p,tracks:p.tracks.map(t=>({...t,segments:t.segments.filter(c=>!selected.includes(c.id))})),video:p.video&&changed?{...p.video,clips:pictures.filter(c=>!selected.includes(c.id)),inPoint:undefined,outPoint:undefined}:p.video});
}

/** Two partially overlapping pictures form a transition; deeper stacks are rejected. */
export function automaticVideoBlends(clips:VideoClip[]):VideoClip[]{
  const sorted=[...clips].sort((a,b)=>a.startTime-b.startTime);
  const result=sorted.map((clip,index)=>{
    const previous=sorted[index-1],overlap=previous?previous.startTime+previous.duration-clip.startTime:0;
    return overlap>1e-6?{...clip,transition:clip.transition==='cut'?'fade' as const:clip.transition,transitionDuration:overlap}:{...clip,transition:'cut' as const,transitionDuration:0};
  });
  return clips.map(clip=>result.find(candidate=>candidate.id===clip.id)!);
}
/** Apply real clip envelopes to a reviewed partial overlap, across one or more lanes. */
export function blendAudioOverlaps(p:TimelineProject,ids:string[]):TimelineProject{
  const selected=new Set(linkedIds(p,ids)),clips=p.tracks.flatMap(track=>track.segments).filter(clip=>selected.has(clip.id)).sort((a,b)=>a.startTime-b.startTime);
  const changes=new Map<string,Partial<AudioSegment>>();
  for(let i=1;i<clips.length;i++){
    const left=clips[i-1],right=clips[i],overlap=left.startTime+left.duration-right.startTime;
    if(overlap<=0||overlap>=Math.min(left.duration,right.duration))continue;
    changes.set(left.id,{...changes.get(left.id),fadeOutDuration:overlap,fadeOutCurve:'scurve'});
    changes.set(right.id,{...changes.get(right.id),fadeInDuration:overlap,fadeInCurve:'scurve'});
  }
  if(!changes.size)throw new Error('Select two partially overlapping audio clips');
  return mapClips(p,clip=>changes.has(clip.id)?{...clip,...changes.get(clip.id)}:clip);
}
