import type {TimelineProject,VideoSource,VideoClip} from '../types/audio';
import {videoClips,validateVideoClips,frameTime} from './videoEditing';
import {pictureTrackId,pictureTracks,pictureLocked,retainedPictureAnimation} from './pictureComposition';
import {editTimeRange} from './rangeEdits';
import {timelineDuration} from './timelineView';
export type PicturePlacement='insert'|'overwrite'|'append';
/** Source-bin picture placement is silent; camera audio remains independently mixed. */
export function placePictureSource(project:TimelineProject,source:VideoSource,input:number,output:number,time:number,lane:string,mode:PicturePlacement):TimelineProject{
  if(!project.video)throw new Error('Missing video');
  const fps=project.frameRate??25,start=mode==='append'?timelineDuration(project):frameTime(time,fps),sourceIn=frameTime(input,fps),sourceOut=Math.min(source.duration,frameTime(output,fps)),duration=sourceOut-sourceIn;
  if(![input,output,time].every(Number.isFinite)||input<0||output>source.duration||sourceIn<0||sourceOut>source.duration||duration<1/fps||start<0)throw new Error('Invalid source range');
  const track=pictureTracks(project.video).find(t=>t.id===lane);if(!track||track.locked||project.video.locked)throw new Error('Picture track is locked');
  let next=project;
  if(mode==='insert'&&start<timelineDuration(project))next=editTimeRange(project,start,start+duration,'insert',{transitionPolicy:'preserve'});
  const removed=new Set<string>();
  let clips=videoClips(next.video);
  if(mode==='overwrite'){
    const end=start+duration;
    clips=clips.flatMap(c=>{
      if(pictureTrackId(c)!==lane||c.startTime>=end||c.startTime+c.duration<=start)return [c];
      if(pictureLocked(next.video,c))throw new Error('Picture track is locked');
      if(c.linkGroup)removed.add(c.linkGroup);
      const pieces:VideoClip[]=[];
      if(c.startTime<start)pieces.push({...c,linkGroup:undefined,duration:start-c.startTime,fadeOut:0});
      if(c.startTime+c.duration>end)pieces.push(retainedPictureAnimation(c,{...c,id:crypto.randomUUID(),linkGroup:undefined,startTime:end,sourceOffset:c.sourceOffset+end-c.startTime,duration:c.startTime+c.duration-end,fadeIn:0,transition:'cut',transitionDuration:0}));
      return pieces;
    });
  }
  clips=[...clips,{id:crypto.randomUUID(),videoTrackId:lane,...(source.id==='legacy-video'?{}:{sourceId:source.id}),startTime:start,sourceOffset:sourceIn,duration,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0}];
  const video={...next.video!,tracks:pictureTracks(next.video),clips,inPoint:undefined,outPoint:undefined};
  const invalid=validateVideoClips(clips,video.duration,video.sources);if(invalid)throw new Error(invalid);
  next={...next,video,tracks:next.tracks.map(t=>({...t,segments:t.segments.map(c=>c.linkGroup&&removed.has(c.linkGroup)?{...c,linkGroup:undefined}:c)}))};
  return {...next,duration:timelineDuration(next)};
}
