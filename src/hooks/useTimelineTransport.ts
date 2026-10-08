import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { TimelineEngine } from '../audio/engine/TimelineEngine';
import type { AudioEngineHandle } from './useAudioEngine';
import { useProjectStore } from '../stores/projectStore';

/** Anchor the playhead to the audio clock. Explicit seeks reschedule audio;
 * animation frames only display that clock, including after a hidden tab. */
export function useTimelineTransport(engineRef: RefObject<TimelineEngine | null>, audio: AudioEngineHandle) {
  const playing = useProjectStore((s) => s.isPlaying);
  const project = useProjectStore((s) => s.project);
  const sources = useProjectStore((s) => s.sources);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !playing) return;
    let cancelled = false;
    let ready = false;
    let internalPosition = false;
    let frame = 0;
    let clockStart = 0;
    let timelineStart = 0;
    const ctx = audio.getContext();
    const reschedule = (time: number) => {
      clockStart = ctx.currentTime;
      timelineStart = time;
      engine.setSources(sources);
      engine.play(project, time);
    };
    const unsubscribe = useProjectStore.subscribe((next, previous) => {
      if (ready && next.isPlaying && !internalPosition && next.playheadPosition !== previous.playheadPosition) {
        reschedule(next.playheadPosition);
      }
    });
    const tick = () => {
      if (cancelled || !ready || document.visibilityState === 'hidden') return;
      const state = useProjectStore.getState();
      let position = timelineStart + ctx.currentTime - clockStart;
      if (project.duration > 0 && position >= project.duration) {
        if (state.loopEnabled) {
          position %= project.duration;
          reschedule(position);
        } else {
          internalPosition = true;
          state.setPlayheadPosition(project.duration);
          internalPosition = false;
          state.setIsPlaying(false);
          return;
        }
      }
      internalPosition = true;
      state.setPlayheadPosition(position);
      internalPosition = false;
      frame = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (document.visibilityState !== 'hidden' && ready) frame = requestAnimationFrame(tick);
    };
    document.addEventListener('visibilitychange', onVisibility);
    void Promise.resolve(audio.resume()).then(() => {
      if (cancelled) return;
      reschedule(useProjectStore.getState().playheadPosition);
      ready = true;
      if (document.visibilityState !== 'hidden') frame = requestAnimationFrame(tick);
    }).catch((error) => {
      console.error('Timeline playback failed:', error);
      if (!cancelled) useProjectStore.getState().setIsPlaying(false);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
      engine.stop();
    };
  }, [audio, engineRef, playing, project, sources]);
}
