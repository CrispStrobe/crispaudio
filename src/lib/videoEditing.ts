import { validVideoColor } from './videoColor';
import type { TimelineProject, VideoClip, VideoSource } from '../types/audio';
export const VIDEO_TRANSITIONS = ['cut', 'fade', 'fadeblack', 'fadewhite', 'wipeleft', 'wiperight', 'wipeup', 'wipedown', 'slideleft', 'slideright', 'slideup', 'slidedown', 'hblur', 'zoomin', 'pixelize', 'whip', 'glitch', 'pagepeel'] as const;
export type VideoTransition = typeof VIDEO_TRANSITIONS[number];
export function videoClips(video: TimelineProject['video']): VideoClip[] {
  return video ? video.clips ?? [{id: 'source-video', startTime: 0, duration: video.duration, sourceOffset: 0, fadeIn: 0, fadeOut: 0, transition: 'cut', transitionDuration: 0}] : [];
}
export function videoTimelineDuration(video: TimelineProject['video']): number {
  return Math.max(0, ...videoClips(video).map(clip => clip.startTime + clip.duration));
}
export function activeVideoClips(video: TimelineProject['video'], time: number): VideoClip[] {
  return videoClips(video).filter(clip => clip.startTime <= time && time < clip.startTime + clip.duration).sort((a,b) => a.startTime-b.startTime);
}
/** Reject ambiguous overlaps rather than silently changing clip/audio timing. */
export function validateVideoClips(clips: VideoClip[], sourceDuration: number, sources?: VideoSource[]): string | null {
  const sorted = [...clips].sort((a,b) => a.startTime-b.startTime);
  for (let i=0; i<sorted.length; i++) {
    const clip=sorted[i], previous=sorted[i-1];
    if (!validVideoColor(clip.colorCorrection)) return 'Invalid video colour settings';
    if (![clip.startTime,clip.duration,clip.sourceOffset,clip.fadeIn,clip.fadeOut,clip.transitionDuration].every(Number.isFinite) || clip.startTime<0 || clip.sourceOffset<0 || clip.duration<1/120 || clip.sourceOffset+clip.duration>(clip.sourceId ? sources?.find(s=>s.id===clip.sourceId)?.duration ?? -1 : sourceDuration)+1e-6 || clip.transitionDuration<0 || clip.fadeIn<0 || clip.fadeOut<0 || clip.fadeIn>clip.duration || clip.fadeOut>clip.duration || !VIDEO_TRANSITIONS.includes(clip.transition)) return 'Invalid video clip timing';
    if (previous) {
      const overlap=previous.startTime+previous.duration-clip.startTime;
      if (overlap>1e-6 && (clip.transition==='cut' || Math.abs(overlap-clip.transitionDuration)>1e-6 || overlap>=Math.min(previous.duration,clip.duration) || (i>1 && sorted[i-2].startTime+sorted[i-2].duration>clip.startTime+1e-6))) return 'Overlapping video clips need a transition matching the overlap';
    }
  }
  return null;
}

export function videoSources(video: TimelineProject['video']): VideoSource[] {
  if (!video) return [];
  return [{id:'legacy-video', path:video.path, name:video.path.split(/[\\/]/).pop() || 'Video', duration:video.duration}, ...(video.sources ?? [])];
}
export function clipSource(video: TimelineProject['video'], clip?: VideoClip): VideoSource | undefined {
  return videoSources(video).find(source=>source.id===(clip?.sourceId ?? 'legacy-video'));
}
export function frameTime(time: number, fps = 25): number {
  return Math.round(time * fps) / fps;
}
