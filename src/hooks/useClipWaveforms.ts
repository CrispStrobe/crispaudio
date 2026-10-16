import {useEffect, useMemo, useRef, useState} from 'react';
import type {AudioSource, TimelineTrack} from '../types/audio';
import {cachedClipWaveform, clipWaveformState, type ClipWaveformState} from '../lib/clipWaveform';
import {ClipWaveformScheduler, waveformRequest, type WaveformCompletion} from '../lib/clipWaveformScheduler';

export interface ClipWaveformView {state: ClipWaveformState; source?: AudioSource}
/** Visible clips only; sample continuous edits and discard displaced/unmounted work. */
export function useClipWaveforms(tracks: TimelineTrack[], sources: Map<string, AudioSource>, start: number, end: number) {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const requests = (visible ? tracks : []).flatMap(track => track.segments.flatMap(clip => {
    const source = sources.get(clip.sourceId);
    return source && clip.startTime < end && clip.startTime + clip.duration > start
      ? [waveformRequest(source, clip)] : [];
  }));
  const signature = JSON.stringify(requests.map(r => [r.clip.id, r.key]));
  // Equivalent viewport/selection changes must not cancel ongoing DSP.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => requests, [signature]);
  const [completed, setCompleted] = useState<Map<string, WaveformCompletion>>(new Map());
  const scheduler = useRef<ClipWaveformScheduler | null>(null);
  useEffect(() => {
    const worker = new ClipWaveformScheduler(setCompleted); scheduler.current = worker;
    return () => { worker.dispose(); scheduler.current = null; };
  }, []);
  useEffect(() => { scheduler.current?.update(stable); }, [stable]);
  return new Map(stable.map(r => {
    const state = clipWaveformState(r.source, r.clip);
    const done = completed.get(r.clip.id);
    const cached = state === 'pending' ? cachedClipWaveform(r.key) : undefined;
    // While the newest rack is rendering, keep the last processed shape rather
    // than flashing back to dry audio. FX… explicitly marks this older snapshot.
    const previous = state === 'pending' && done?.geometry === r.geometry && done.key !== r.key
      ? cachedClipWaveform(done.key) : undefined;
    const view: ClipWaveformView = cached ? {state: 'ready', source: cached}
      : state !== 'pending' ? {state}
      : done?.key === r.key ? {state: 'source'} : {state: 'pending', source: previous};
    return [r.clip.id, view];
  }));
}
