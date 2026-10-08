import type { TimelineProject, VideoTransform } from '../types/audio';
import { videoClips } from './videoEditing';
import { validVideoTransform } from './videoTransform';
export function applyVideoTransform(project: TimelineProject, ids: string[], value: VideoTransform | undefined): TimelineProject {
  if(!validVideoTransform(value)) throw new Error('Invalid picture orientation');
  if(!project.video)return project;
  const selected=new Set(ids),clips=videoClips(project.video);
  if(!clips.some(clip=>selected.has(clip.id)))return project;
  return {...project,video:{...project.video,clips:clips.map(clip=>selected.has(clip.id)?{...clip,transform:value&&{...value}}:clip)}};
}
