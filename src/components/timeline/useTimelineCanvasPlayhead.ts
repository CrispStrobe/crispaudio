import { timelineDuration } from '../../lib/timelineView';
import { useLayoutEffect, useRef } from 'react';
import { useProjectStore } from '../../stores/projectStore';

/** The frequently moving cursor is independent of the expensive static canvas. */
export function useTimelineCanvasPlayhead(width: number, overviewDuration?: number) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const update = () => {
      if (document.visibilityState === 'hidden' || !ref.current) return;
      const { playheadPosition, zoomLevel, scrollOffset } = useProjectStore.getState();
      const x = overviewDuration ? playheadPosition / overviewDuration * width : (playheadPosition - scrollOffset) * zoomLevel;
      ref.current.setAttribute('aria-valuenow', String(playheadPosition));
      ref.current.setAttribute('aria-valuemax', String(timelineDuration(useProjectStore.getState().project)));
      ref.current.style.transform = `translateX(${x}px)`;
      ref.current.style.display = x >= 0 && x <= width ? '' : 'none';
    };
    const unsubscribe = useProjectStore.subscribe((state, previous) => {
      if (state.project !== previous.project || state.playheadPosition !== previous.playheadPosition ||
          state.zoomLevel !== previous.zoomLevel || state.scrollOffset !== previous.scrollOffset) update();
    });
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', update);
    };
  }, [width, overviewDuration]);
  return ref;
}
