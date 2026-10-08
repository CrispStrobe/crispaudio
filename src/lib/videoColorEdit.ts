import type { TimelineProject, VideoColor } from '../types/audio';
import { validVideoColor } from './videoColor';
import { videoClips } from './videoEditing';

export function applyVideoColor(project: TimelineProject, ids: string[], color: VideoColor | undefined): TimelineProject {
  if (!validVideoColor(color)) throw new Error('Invalid video colour settings');
  if (!project.video) return project;
  const selected = new Set(ids);
  const clips = videoClips(project.video);
  if (!clips.some(clip => selected.has(clip.id))) return project;
  return {...project, video:{...project.video, clips:clips.map(clip => selected.has(clip.id)
    ? {...clip, colorCorrection:color && {...color}} : clip)}};
}
