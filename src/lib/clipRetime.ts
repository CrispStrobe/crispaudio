import type {AudioSegment,VideoClip,TimelineProject,Retime,AudioSource} from '../types/audio';
import {projectClips,linkedIds,mapClips} from './projectEdits';
import {clipSource,validateVideoClips} from './videoEditing';
import {pictureLocked} from './pictureComposition';
import {timelineDuration} from './timelineView';
export type RetimeOptions=Pick<Retime,'rate'|'reverse'|'preservePitch'|'semitones'>;
export interface RetimePlan {clip:AudioSegment|VideoClip;original:Retime['original'];settings:RetimeOptions;duration:number}
export function originalWindow(clip:AudioSegment|VideoClip):Retime['original']{
 const r=clip.retime;if(!r)return {sourceId:clip.sourceId,offset:clip.sourceOffset,duration:clip.duration};
 const rate=r.original.duration/(r.renderDuration??r.original.duration/r.rate);
 return {...r.original,offset:r.original.offset+(r.reverse?r.original.duration-(clip.sourceOffset+clip.duration)*rate:clip.sourceOffset*rate),duration:clip.duration*rate};
}
export function planRetime(project:TimelineProject,ids:string[],settings:RetimeOptions,sources:Map<string,AudioSource>):RetimePlan[]{
 if(![settings.rate,settings.semitones].every(Number.isFinite)||settings.rate<.25||settings.rate>4||Math.abs(settings.semitones)>24)throw new Error('retime.invalid');
 const selected=new Set(linkedIds(project,ids,true)),clips=projectClips(project).filter(c=>selected.has(c.id));if(!clips.length)throw new Error('retime.select');
 return clips.map(clip=>{
  const original=originalWindow(clip),video=!('trackId' in clip);if(video&&clip.multicam)throw new Error('retime.detachMulticam');
  if(video){if(pictureLocked(project.video,clip))throw new Error('retime.locked');original.path=original.path??clipSource(project.video,{...clip,sourceId:original.sourceId})?.path;}else if(project.tracks.find(t=>t.id===clip.trackId)?.locked)throw new Error('retime.locked');
  const bound=video?clipSource(project.video,{...clip,sourceId:original.sourceId})?.duration:sources.get(original.sourceId!)?.duration;
  if(bound===undefined||original.offset< -1e-6||original.duration<=0||original.offset+original.duration>bound+1e-6)throw new Error('retime.bounds');
  return {clip,original:{...original,offset:Math.max(0,original.offset)},settings:{...settings},duration:original.duration/settings.rate};
 });
}
/** Only commit after every linked derivative is ready. Audio stays ordinary PCM. */
export function applyRetime(project:TimelineProject,plans:RetimePlan[],derived:Map<string,{id:string;path?:string;duration:number}>,restore=false):TimelineProject{
 const byId=new Map(plans.map(p=>[p.clip.id,p]));const additions=plans.filter(p=>!('trackId' in p.clip)&&!restore).map(p=>{const source=derived.get(p.clip.id)!;return {id:source.id,path:source.path!,name:p.clip.id,duration:source.duration};});
 const prepared={...project,video:project.video?{...project.video,sources:[...(project.video.sources??[]),...additions]}:undefined};
 const next=mapClips(prepared,c=>{
  const plan=byId.get(c.id);if(!plan)return c;const source=derived.get(c.id),duration=restore?plan.original.duration:Math.min(plan.duration,source!.duration),scale=duration/c.duration;
  const common={sourceId:restore?plan.original.sourceId:source!.id,sourceOffset:restore?plan.original.offset:0,duration,retime:restore?undefined:{...plan.settings,original:plan.original,renderDuration:duration}};
  if('trackId' in c){const rack=c.effects.map(e=>({...e,automation:e.automation?Object.fromEntries(Object.entries(e.automation).map(([key,points])=>[key,points?.map(p=>({...p,time:c.startTime+(p.time-c.startTime)*scale}))])):undefined}));return {...c,...common,sourceId:common.sourceId!,trackId:c.trackId,fadeInDuration:c.fadeInDuration*scale,fadeOutDuration:c.fadeOutDuration*scale,effects:rack};}
  return {...c,...common,fadeIn:c.fadeIn*scale,fadeOut:c.fadeOut*scale,transitionDuration:c.transitionDuration*scale,composition:c.composition?{...c.composition,keyframeOffset:(c.composition.keyframeOffset??0)*scale,keyframes:c.composition.keyframes?.map(k=>({...k,time:k.time*scale}))}:undefined};
 });
 if(next.video&&validateVideoClips(next.video.clips??[],next.video.duration,next.video.sources))throw new Error('retime.overlap');
 return {...next,duration:timelineDuration(next)};
}
export function validRetime(project:TimelineProject,sourceIds:Set<string>):boolean{
 return projectClips(project).every(c=>{const r=c.retime;if(!r)return true;return [r.rate,r.semitones,r.original?.offset,r.original?.duration].every(Number.isFinite)&&r.rate>=.25&&r.rate<=4&&Math.abs(r.semitones)<=24&&typeof r.reverse==='boolean'&&typeof r.preservePitch==='boolean'&&r.original.offset>=0&&r.original.duration>0&&(r.renderDuration===undefined||Number.isFinite(r.renderDuration)&&r.renderDuration>0)&&('trackId' in c?!!r.original.sourceId&&sourceIds.has(r.original.sourceId):!r.original.sourceId||!!project.video?.sources?.some(s=>s.id===r.original.sourceId));});
}
