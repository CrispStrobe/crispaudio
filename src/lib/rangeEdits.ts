import type { TimelineProject, AudioSegment, VideoClip, GainPoint } from '../types/audio';
import { videoClips, validateVideoClips, frameTime } from './videoEditing';
import { timelineDuration } from './timelineView';
import { gainAt } from './mixAutomation';

type Clip=AudioSegment|VideoClip;
export type RangeOperation='lift'|'extract'|'insert';
export interface RangeEditOptions {trackIds?:string[];includeVideo?:boolean;retimeGlobal?:boolean;transitionPolicy?:'preserve'|'cut';/** Internal reviewed ripple-trim shapes; never imported from recipe JSON. */trimmedClips?:Map<string,Clip>}
export class RangeEditError extends Error {}
const fail=(key:string):never=>{throw new RangeEditError(`rangeEdits.${key}`);};

export interface RangeTransitionCut {clipId:string;transition:VideoClip['transition'];start:number;end:number;cutTime:number;resultingCutTime:number|null}
/** Review only actual overlaps. The hard cut is at the outgoing clip's end. */
export function planRangeTransitionCuts(project:TimelineProject,start:number,end:number,operation:RangeOperation):RangeTransitionCut[] {
  if(!project.video)return [];
  const fps=project.frameRate??25;
  if(!Number.isFinite(fps)||fps<=0)fail('invalid');
  const clips=videoClips(project.video);
  if(validateVideoClips(clips,project.video.duration,project.video.sources))fail('pictureTopology');
  start=frameTime(start,fps);end=Math.abs(end-timelineDuration(project))<1e-7?end:frameTime(end,fps);
  const boundaries=operation==='insert'?[start]:[start,end],sorted=[...clips].sort((a,b)=>a.startTime-b.startTime),cuts:RangeTransitionCut[]=[];
  for(let i=1;i<sorted.length;i++){
    const c=sorted[i],b=sorted[i-1].startTime+sorted[i-1].duration;
    if(b-c.startTime<=1e-6||!boundaries.some(t=>t>c.startTime&&t<b))continue;
    if(Math.abs(frameTime(c.startTime,fps)-c.startTime)>1e-7||Math.abs(frameTime(b,fps)-b)>1e-7||c.startTime+c.duration-b<1/fps-1e-7)fail('pictureTopology');
    const incomingEnd=c.startTime+c.duration;
    const resultingCutTime=operation==='insert'?b+(end-start):b>=end?(operation==='extract'?b-(end-start):b):incomingEnd<=end?null:operation==='extract'?start:end;
    cuts.push({clipId:c.id,transition:c.transition,start:c.startTime,end:b,cutTime:b,resultingCutTime});
  }
  return cuts;
}

/** A reviewed scope changes one arrangement atomically; source media is never changed. */
export function editTimeRange(project:TimelineProject,start:number,end:number,operation:RangeOperation,options:RangeEditOptions={}):TimelineProject {
  if(options.transitionPolicy!==undefined&&!['preserve','cut'].includes(options.transitionPolicy))fail('invalid');
  const includeVideo=options.includeVideo??(!!project.video&&project.video.rippleEnabled!==false);
  const ids=new Set(options.trackIds??project.tracks.filter(t=>t.rippleEnabled!==false).map(t=>t.id));
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||(!['lift','extract','insert'].includes(operation))||start>timelineDuration(project)||(operation!=='insert'&&end>timelineDuration(project)))fail('invalid');
  if(includeVideo&&!project.video)fail('scope');
  if([...ids].some(id=>!project.tracks.some(t=>t.id===id))||(!ids.size&&!includeVideo))fail('scope');
  if(includeVideo){if(!Number.isFinite(project.frameRate??25)||(project.frameRate??25)<=0)fail('invalid');start=frameTime(start,project.frameRate??25);end=Math.abs(end-timelineDuration(project))<1e-7?end:frameTime(end,project.frameRate??25);if(end<=start)fail('invalid');}
  const retimeGlobal=options.retimeGlobal??(includeVideo||(!project.video&&ids.size===project.tracks.length));
  const all:Clip[]=[...project.tracks.flatMap(t=>t.segments),...videoClips(project.video)];
  const included=(clip:Clip)=>'trackId' in clip?ids.has(clip.trackId):includeVideo;
  const affected=(clip:Clip)=>{const trim=options.trimmedClips?.get(clip.id);return !!(trim&&trim!==clip)||(operation==='insert'||operation==='extract'?clip.startTime+clip.duration>start:clip.startTime<end&&clip.startTime+clip.duration>start);};
  const groups=new Set(all.filter(c=>included(c)&&affected(c)&&c.linkGroup).map(c=>c.linkGroup));
  if(all.some(c=>c.linkGroup&&groups.has(c.linkGroup)&&!included(c)))fail('linkedScope');
  if(project.groupEditingEnabled!==false){const editGroups=new Set(all.filter(c=>included(c)&&affected(c)&&c.editGroup).map(c=>c.editGroup!.id));if(all.some(c=>c.editGroup&&editGroups.has(c.editGroup.id)&&!included(c)))fail('groupScope');}
  if(project.tracks.some(t=>ids.has(t.id)&&t.locked&&t.segments.some(affected))||(includeVideo&&project.video?.locked&&videoClips(project.video).some(affected)))fail('locked');
  const cuts=new Map<string,VideoClip>();
  if(includeVideo){
    const review=planRangeTransitionCuts(project,start,end,operation).filter(c=>!options.trimmedClips?.has(c.clipId));
    if(review.length&&options.transitionPolicy!=='cut')fail('transitionBoundary');
    for(const item of review){
      const c=videoClips(project.video).find(c=>c.id===item.clipId)!,overlap=item.end-item.start,duration=c.duration-overlap;
      cuts.set(c.id,{...c,startTime:item.end,sourceOffset:c.sourceOffset+overlap,duration,fadeIn:Math.min(c.fadeIn,duration/2),fadeOut:Math.min(c.fadeOut,duration/2),transition:'cut',transitionDuration:0});
    }
  }
  if(retimeGlobal&&project.transcript?.some(c=>[start,...(operation==='insert'?[]:[end])].some(t=>t>c.start&&t<c.end)))fail('cueBoundary');
  const length=end-start,groupsForRight=new Map<string,string>();
  const newGroup=(group?:string)=>{if(!group)return undefined;if(!groupsForRight.has(group))groupsForRight.set(group,crypto.randomUUID());return groupsForRight.get(group);};
  const trimPiece=(clip:Clip,left:boolean,changes:Partial<Clip>):Clip=>{
    const next={...clip,...changes};
    return 'trackId' in next?{...next,...(left?{fadeOutDuration:0}:{fadeInDuration:0})}:{...next,...(left?{fadeOut:0}:{fadeIn:0,transition:'cut' as const,transitionDuration:0})};
  };
  const edit=(clip:Clip):Clip[]=>{
    if(!included(clip)||!affected(clip))return [clip];
    const trimmed=options.trimmedClips?.get(clip.id);if(trimmed)return [trimmed];
    clip=cuts.get(clip.id)??clip;
    const a=clip.startTime,b=a+clip.duration;
    if(b<=start)return [clip];
    if(operation==='insert'){
      if(a>=start)return [{...clip,startTime:a+length}];
      return [trimPiece(clip,true,{duration:start-a}),trimPiece(clip,false,{id:crypto.randomUUID(),linkGroup:newGroup(clip.linkGroup),startTime:end,sourceOffset:clip.sourceOffset+start-a,duration:b-start})];
    }
    if(a>=end)return operation==='extract'?[{...clip,startTime:a-length}]:[clip];
    const parts:Clip[]=[];
    if(a<start)parts.push(trimPiece(clip,true,{duration:start-a}));
    if(b>end)parts.push(trimPiece(clip,false,{id:crypto.randomUUID(),linkGroup:newGroup(clip.linkGroup),startTime:operation==='extract'?start:end,sourceOffset:clip.sourceOffset+end-a,duration:b-end}));
    return parts;
  };
  const retime=(t:number)=>operation==='insert'?(t>=start?t+length:t):operation==='extract'?(t>=end?t-length:t>start?start:t):t;
  const automation=(points?:GainPoint[]):GainPoint[]|undefined=>{
    if(!points?.length||operation==='lift')return points;
    const result=points.filter(p=>operation==='insert'||p.time<start||p.time>=end).map(p=>({...p,time:retime(p.time)}));
    const epsilon=1/project.sampleRate;
    if(start>0)result.push({time:Math.max(0,start-epsilon),value:gainAt(points,start)});
    result.push({time:operation==='insert'?end:start,value:gainAt(points,operation==='insert'?start:end)});
    return [...new Map(result.sort((a,b)=>a.time-b.time).map(p=>[p.time,p])).values()];
  };
  const pictures=includeVideo?videoClips(project.video).flatMap(c=>edit(c) as VideoClip[]):undefined;
  // Validate the arrangement after the explicitly reviewed conversions.
  if(pictures&&project.video&&validateVideoClips(pictures,project.video.duration,project.video.sources))fail('pictureTopology');
  const next:TimelineProject={...project,editRange:operation==='lift'?{start,end}:undefined,
    tracks:project.tracks.map(t=>ids.has(t.id)?{...t,segments:t.segments.flatMap(c=>edit(c) as AudioSegment[]),automation:automation(t.automation)}:t),
    video:project.video&&includeVideo?{...project.video,clips:pictures,inPoint:undefined,outPoint:undefined}:project.video};
  if(operation==='lift')next.minimumDuration=timelineDuration(project);
  if(retimeGlobal){
    if(operation!=='lift'&&project.minimumDuration!==undefined)next.minimumDuration=retime(project.minimumDuration);
    next.markers=project.markers?.filter(m=>operation==='insert'||operation==='lift'||m.time<start||m.time>=end).map(m=>({...m,time:retime(m.time)}));
    next.transcript=project.transcript?.filter(c=>operation==='insert'||c.end<=start||c.start>=end).map(c=>({...c,start:retime(c.start),end:retime(c.end),words:c.words?.map(w=>({...w,start:retime(w.start),end:retime(w.end)}))}));
  }
  if(retimeGlobal&&project.transcriptLayout&&JSON.stringify(project.transcriptLayout)===JSON.stringify(project.tracks.flatMap(t=>t.segments.map(c=>[t.id,c.id,c.sourceId,c.startTime,c.sourceOffset,c.duration]))))next.transcriptLayout=next.tracks.flatMap(t=>t.segments.map(c=>[t.id,c.id,c.sourceId,c.startTime,c.sourceOffset,c.duration]));
  return {...next,duration:timelineDuration(next)};
}
