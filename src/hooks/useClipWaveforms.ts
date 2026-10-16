import {useEffect, useMemo, useState} from 'react';
import type {AudioSource, TimelineTrack} from '../types/audio';
import {cachedClipWaveform, clipWaveformKey, clipWaveformState, prepareClipWaveform, type ClipWaveformState} from '../lib/clipWaveform';

export interface ClipWaveformView {state: ClipWaveformState; source?: AudioSource}
/** Visible clips only; debounce sliders and discard stale/unmounted work. */
export function useClipWaveforms(tracks: TimelineTrack[], sources: Map<string, AudioSource>, start: number, end: number) {
  const requests = tracks.flatMap(track => track.segments.flatMap(clip => {
    const source = sources.get(clip.sourceId);
    return source && clip.startTime < end && clip.startTime + clip.duration > start
      ? [{clip, source, key: clipWaveformKey(source, clip), state: clipWaveformState(source, clip)}] : [];
  }));
  const signature = JSON.stringify(requests.map(r => [r.clip.id, r.key, r.state]));
  // Equivalent viewport/selection changes must not cancel ongoing DSP.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => requests, [signature]);
  const [completed, setCompleted] = useState<Map<string, {key: string; view: ClipWaveformView}>>(new Map());
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        const next = new Map<string, {key: string; view: ClipWaveformView}>();
        for (const r of stable) {
          if (!active) return;
          if (r.state !== 'pending') continue;
          let view: ClipWaveformView;
          try {
            const source = await prepareClipWaveform(r.source, r.clip, () => active);
            if (!active) return;
            view = {state: source ? 'ready' : 'source'};
          } catch { view = {state: 'source'}; }
          next.set(r.clip.id, {key: r.key, view});
          // Publish each completed clip rather than waiting for the whole viewport.
          setCompleted(new Map(next));
        }
        if (active) setCompleted(next);
      })();
    }, 120);
    return () => { active = false; clearTimeout(timer); };
  }, [stable]);
  return new Map(stable.map(r => {
    const done = completed.get(r.clip.id), cached = r.state === 'pending' ? cachedClipWaveform(r.key) : undefined;
    const view: ClipWaveformView = cached ? {state: 'ready', source: cached} : done?.key === r.key ? {state: 'source'} : {state: r.state};
    return [r.clip.id, view];
  }));
}
