import { useLayoutEffect } from 'react';

/** Coalesce invalidations into one frame; hidden documents do no drawing work. */
export function useTimelineCanvasInvalidation(draw: () => void) {
  useLayoutEffect(() => {
    let frame: number | null = null;
    const cancel = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };
    const invalidate = () => {
      if (document.visibilityState === 'hidden') {
        cancel();
        return;
      }
      if (frame === null) {
        frame = requestAnimationFrame(() => {
          frame = null;
          if (document.visibilityState !== 'hidden') draw();
        });
      }
    };
    let resolution: MediaQueryList | undefined;
    const watchResolution = () => {
      resolution?.removeEventListener('change', onResolutionChange);
      resolution = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      resolution?.addEventListener('change', onResolutionChange);
    };
    const onResolutionChange = () => {
      watchResolution();
      invalidate();
    };
    watchResolution();
    const themeObserver = new MutationObserver(invalidate);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    document.addEventListener('visibilitychange', invalidate);
    invalidate();
    return () => {
      themeObserver.disconnect();
      resolution?.removeEventListener('change', onResolutionChange);
      cancel();
      document.removeEventListener('visibilitychange', invalidate);
    };
  }, [draw]);
}
