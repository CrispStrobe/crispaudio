import { linkedIds, moveClips } from './projectEdits';
import { useProjectStore } from '../stores/projectStore';
import { timelineDuration } from './timelineView';
import { videoClips } from './videoEditing';
import type { VideoClip } from '../types/audio';
export function updateVideoClips(clips: VideoClip[]) {
  useProjectStore.setState(state => {
    if (!state.project.video) return state;
    const project={...state.project, video:{...state.project.video,clips,inPoint:undefined,outPoint:undefined}};
    const selected=clips.filter(clip=>state.selection?.segmentIds.includes(clip.id));
    return {project:{...project,duration:timelineDuration(project)},...(selected.length?{selection:{startTime:Math.min(...selected.map(clip=>clip.startTime)),endTime:Math.max(...selected.map(clip=>clip.startTime+clip.duration)),segmentIds:selected.map(clip=>clip.id)}}:{})};
  });
}
export function splitSelectedVideo(position: number, all = false) {
  const state=useProjectStore.getState(), ids=linkedIds(state.project,state.selection?.segmentIds ?? []);
  const clips=videoClips(state.project.video);
  if (!clips.some(clip => (all || ids.includes(clip.id)) && position>clip.startTime && position<clip.startTime+clip.duration)) return;
  updateVideoClips(clips.flatMap(clip => {
    if ((!all && !ids.includes(clip.id)) || position<=clip.startTime || position>=clip.startTime+clip.duration) return [clip];
    const left=position-clip.startTime;
    return [{...clip,duration:left,fadeIn:Math.min(clip.fadeIn,left),fadeOut:0},
      {...clip,id:crypto.randomUUID(),startTime:position,sourceOffset:clip.sourceOffset+left,duration:clip.duration-left,fadeIn:0,fadeOut:Math.min(clip.fadeOut,clip.duration-left),transition:'cut' as const,transitionDuration:0}];
  }));
}
export function deleteSelection() {
  const state=useProjectStore.getState(),ids=linkedIds(state.project,state.selection?.segmentIds??[]);
  if(!ids.length)return;
  useProjectStore.setState(current=>{
    const project={...current.project,tracks:current.project.tracks.map(track=>({...track,segments:track.segments.filter(clip=>!ids.includes(clip.id))})),video:current.project.video&&videoClips(current.project.video).some(clip=>ids.includes(clip.id))?{...current.project.video,clips:videoClips(current.project.video).filter(clip=>!ids.includes(clip.id)),inPoint:undefined,outPoint:undefined}:current.project.video};
    return {project:{...project,duration:timelineDuration(project)},selection:null};
  });
}
/** One atomic undo step; group movements preserve all relative offsets. */
export function nudgeSelection(delta: number) {
  const state=useProjectStore.getState(), ids=linkedIds(state.project,state.selection?.segmentIds ?? []);
  const audio=state.project.tracks.flatMap(track=>track.segments).filter(clip=>ids.includes(clip.id));
  const videos=videoClips(state.project.video).filter(clip=>ids.includes(clip.id));
  const selected=[...audio,...videos];
  if (!selected.length) {state.setPlayheadPosition(Math.min(timelineDuration(state.project),Math.max(0,state.playheadPosition+delta))); return;}
  const shift=Math.max(delta,-Math.min(...selected.map(clip=>clip.startTime)));
  if(shift===0)return;
  try{useProjectStore.setState(current=>{
    const project=moveClips(current.project,ids,shift);
    return {project:{...project,duration:timelineDuration(project)},selection:current.selection?{...current.selection,startTime:current.selection.startTime+shift,endTime:current.selection.endTime+shift}:null};
  });}catch(error){window.dispatchEvent(new CustomEvent('crispaudio-edit-error',{detail:String(error)}));}
}
