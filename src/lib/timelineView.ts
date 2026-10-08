import { videoTimelineDuration } from './videoEditing';
import type { TimelineProject, TimelineTrack } from '../types/audio';
export function timelineDuration(project: TimelineProject): number {
  return Math.max(videoTimelineDuration(project.video), ...project.tracks.flatMap(t => t.segments.map(c => c.startTime + c.duration)), 0);
}
/** Solo is a temporary audition override. Stored mute buttons are preserved. */
export function audibleTracks(tracks: TimelineTrack[]): TimelineTrack[] {
  return tracks.some(t => t.solo) ? tracks.filter(t => t.solo) : tracks.filter(t => !t.muted);
}
