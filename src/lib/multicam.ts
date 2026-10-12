import type {TimelineProject,VideoClip,MulticamGroup} from '../types/audio';
import {videoClips,clipSource,validateVideoClips,frameTime} from './videoEditing';
import {pictureLocked,pictureTrackId,retainedPictureAnimation} from './pictureComposition';
import {timelineDuration} from './timelineView';
/** Use already reviewed timeline sync, keeping microphone clips independently mixed. */
export function createMulticam(project:TimelineProject,ids:string[],name:string):TimelineProject{
 const video=project.video,clips=videoClips(video).filter(c=>ids.includes(c.id));if(!video||clips.length<2||clips.length>9||!name.trim())throw new Error('multicam.select');
 if(clips.some(c=>pictureLocked(video,c)||c.retime||c.multicam))throw new Error('multicam.locked');
 const fps=project.frameRate??25,start=Math.ceil(Math.max(...clips.map(c=>c.startTime))*fps-1e-7)/fps,end=Math.floor(Math.min(...clips.map(c=>c.startTime+c.duration))*fps+1e-7)/fps;
 if(end-start<1/fps)throw new Error('multicam.coverage');
 const id=crypto.randomUUID(),angles=clips.map((c,i)=>({id:crypto.randomUUID(),name:`${i+1}: ${clipSource(video,c)?.name??name}`,clip:{...c,linkGroup:undefined},sourceOffset:c.sourceOffset+start-c.startTime})),group:MulticamGroup={id,name:name.trim(),start,end,angles,syncHistoryIndex:(project.syncHistory?.length??0)-1};
 const rest=videoClips(video).flatMap(c=>{if(!ids.includes(c.id))return [c];const parts:VideoClip[]=[];if(c.startTime<start)parts.push(retainedPictureAnimation(c,{...c,duration:start-c.startTime,linkGroup:undefined,fadeOut:0}));if(c.startTime+c.duration>end)parts.push(retainedPictureAnimation(c,{...c,id:crypto.randomUUID(),startTime:end,sourceOffset:c.sourceOffset+end-c.startTime,duration:c.startTime+c.duration-end,linkGroup:undefined,transition:'cut',transitionDuration:0,fadeIn:0}));return parts;});
 const angle=angles[0],cut:VideoClip={...retainedPictureAnimation(angle.clip,{...angle.clip,sourceOffset:angle.sourceOffset,duration:end-start}),id:crypto.randomUUID(),startTime:start,sourceOffset:angle.sourceOffset,duration:end-start,videoTrackId:pictureTrackId(clips[0]),linkGroup:undefined,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0,multicam:{groupId:id,angleId:angle.id,clockOffset:0}};
 // Source sound stays in place; camera shot decisions never choose microphone mix.
 const tracks=project.tracks.map(t=>({...t,segments:t.segments.map(c=>clips.some(v=>v.linkGroup&&v.linkGroup===c.linkGroup)?{...c,linkGroup:undefined}:c)}));
 const next={...project,tracks,video:{...video,multicamGroups:[...(video.multicamGroups??[]),group],clips:[...rest,cut]}};if(validateVideoClips(next.video.clips,video.duration,video.sources))throw new Error('multicam.overlap');return {...next,duration:timelineDuration(next)};
}
export function switchMulticam(project:TimelineProject,groupId:string,angleId:string,time:number):TimelineProject{
 const video=project.video,group=video?.multicamGroups?.find(g=>g.id===groupId),angle=group?.angles.find(a=>a.id===angleId);if(!video||!group||!angle)throw new Error('multicam.select');
 time=frameTime(time,project.frameRate??25);const active=videoClips(video).find(c=>c.multicam?.groupId===groupId&&c.startTime<=time&&c.startTime+c.duration>time+1e-7);if(!active)throw new Error('multicam.coverage');if(pictureLocked(video,active))throw new Error('multicam.locked');
 if(active.multicam!.angleId===angleId)return project;
 const local=time-active.startTime,clock=active.multicam!.clockOffset+local,source=clipSource(video,angle.clip),duration=active.duration-local;if(!source||angle.sourceOffset+clock<0||angle.sourceOffset+clock+duration>source.duration+1e-6)throw new Error('multicam.coverage');
 const right:VideoClip={...active,id:local>1e-7?crypto.randomUUID():active.id,sourceId:angle.clip.sourceId,sourceOffset:angle.sourceOffset+clock,startTime:time,duration,transform:angle.clip.transform,colorCorrection:angle.clip.colorCorrection,composition:angle.clip.composition?{...angle.clip.composition,keyframeOffset:(angle.clip.composition.keyframeOffset??0)+angle.sourceOffset+clock-angle.clip.sourceOffset}:undefined,fadeIn:0,transition:'cut',transitionDuration:0,multicam:{groupId,angleId,clockOffset:clock}};
 const clips=videoClips(video).flatMap(c=>c.id!==active.id?[c]:local>1e-7?[{...c,duration:local,fadeOut:0},right]:[right]);if(validateVideoClips(clips,video.duration,video.sources))throw new Error('multicam.overlap');return {...project,video:{...video,clips}};
}
export function detachMulticam(project:TimelineProject,groupId:string):TimelineProject{
 if(project.video&&videoClips(project.video).some(c=>c.multicam?.groupId===groupId&&pictureLocked(project.video,c)))throw new Error('multicam.locked');
 return {...project,video:project.video?{...project.video,clips:videoClips(project.video).map(c=>c.multicam?.groupId===groupId?{...c,multicam:undefined}:c),multicamGroups:project.video.multicamGroups?.filter(g=>g.id!==groupId)}:undefined};
}
export function validMulticam(project:TimelineProject):boolean{
 const video=project.video;if(!video)return true;const groups=video.multicamGroups??[],ids=new Set(groups.map(g=>g.id));if(ids.size!==groups.length)return false;
 return groups.every(g=>typeof g.id==='string'&&typeof g.name==='string'&&[g.start,g.end].every(Number.isFinite)&&g.start>=0&&g.end>g.start&&g.angles.length>=2&&g.angles.length<=9&&new Set(g.angles.map(a=>a.id)).size===g.angles.length&&g.angles.every(a=>typeof a.id==='string'&&typeof a.name==='string'&&Number.isFinite(a.sourceOffset)&&a.sourceOffset>=0&&!!clipSource(video,a.clip)))&&videoClips(video).every(c=>!c.multicam||(Number.isFinite(c.multicam.clockOffset)&&!!groups.find(g=>g.id===c.multicam!.groupId)?.angles.find(a=>a.id===c.multicam!.angleId)));
}
