import type { TimelineProject, VideoClip } from '../types/audio';
import { validateVideoClips, videoClips } from './videoEditing';

/** Changing an existing blend's style preserves its interval and linked sound. */
export function videoTransitionPatch(video:NonNullable<TimelineProject['video']>,id:string,type:VideoClip['transition'],duration?:number):Partial<VideoClip> {
  const clips=videoClips(video),sorted=[...clips].sort((a,b)=>a.startTime-b.startTime),index=sorted.findIndex(clip=>clip.id===id),clip=sorted[index],previous=sorted[index-1];
  if(!clip)throw new Error('Missing video clip');
  const overlap=previous?previous.startTime+previous.duration-clip.startTime:0;
  let patch:Partial<VideoClip>;
  if(type==='cut'){
    if(clip.linkGroup&&overlap>1e-6)throw new Error('Unlink before removing the overlap');
    patch={transition:'cut',transitionDuration:0,...(overlap>1e-6?{startTime:previous!.startTime+previous!.duration}:{})};
  }else{
    if(!previous)throw new Error('A transition needs a preceding clip');
    const length=duration??(overlap>1e-6?overlap:Math.min(.5,clip.duration/2,previous.duration/2));
    if(!Number.isFinite(length)||length<=0)throw new Error('Invalid transition duration');
    if(clip.linkGroup&&(overlap<=1e-6||Math.abs(length-overlap)>1e-6))throw new Error('Unlink before changing overlap timing');
    patch={transition:type,transitionDuration:length,...(Math.abs(length-overlap)>1e-6?{startTime:previous.startTime+previous.duration-length}:{})};
  }
  const invalid=validateVideoClips(clips.map(candidate=>candidate.id===id?{...candidate,...patch}:candidate),video.duration,video.sources);
  if(invalid)throw new Error(invalid);
  return patch;
}
