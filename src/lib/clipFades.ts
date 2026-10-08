import type { TimelineProject, FadeCurve } from '../types/audio';
import { videoClips, frameTime } from './videoEditing';

/** Apply reviewed fades in one undoable edit, without moving linked material. */
export function applyClipFades(project: TimelineProject, ids: string[], side: 'in' | 'out' | 'both', duration: number, curve: FadeCurve): TimelineProject {
  if (!Number.isFinite(duration) || duration < 0) throw new Error('Invalid fade duration');
  const selected = new Set(ids);
  const tracks = project.tracks.map(track => ({...track, segments: track.segments.map(clip => {
    if (!selected.has(clip.id)) return clip;
    const value = Math.min(duration, clip.duration);
    return {...clip, ...(side !== 'out' ? {fadeInDuration: value, fadeInCurve: curve} : {}),
      ...(side !== 'in' ? {fadeOutDuration: value, fadeOutCurve: curve} : {})};
  })}));
  const original = videoClips(project.video);
  const clips = original.map(clip => !selected.has(clip.id) ? clip : {
    ...clip, ...(side !== 'out' ? {fadeIn: Math.min(frameTime(duration, project.frameRate ?? 25), clip.duration)} : {}),
    ...(side !== 'in' ? {fadeOut: Math.min(frameTime(duration, project.frameRate ?? 25), clip.duration)} : {}),
  });
  const video = project.video && clips.some((clip, i) => clip !== original[i]) ? {...project.video, clips} : project.video;
  return {...project, tracks, video};
}
