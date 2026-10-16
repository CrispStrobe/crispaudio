import type {AudioSegment, AudioSource} from '../types/audio';
import {cachedClipWaveform, clipWaveformKey, clipWaveformState, prepareClipWaveform} from './clipWaveform';

export interface WaveformRequest {clip: AudioSegment; source: AudioSource; key: string; geometry: string}
export interface WaveformCompletion {key: string; geometry: string}
export function waveformRequest(source: AudioSource, clip: AudioSegment): WaveformRequest {
  // Effects/gain/fades may change while a preview renders. A previous processed
  // result remains useful during a drag ONLY with the same PCM and placement.
  return {source, clip, key: clipWaveformKey(source, clip), geometry: clipWaveformKey(source,
    {...clip, gain: 1, effects: [], nativeEffects: [], fadeInDuration: 0, fadeOutDuration: 0,
      fadeInCurve: 'linear', fadeOutCurve: 'linear'})};
}
/** Sample the latest slider state periodically, rather than waiting for silence.
 * Never overlap renders; unchanged/failed/evicted requests are not retried forever.
 */
export class ClipWaveformScheduler {
  private requests: WaveformRequest[] = [];
  private completed = new Map<string, WaveformCompletion>();
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private disposed = false;
  private notify: (completed: Map<string, WaveformCompletion>) => void;
  constructor(notify: (completed: Map<string, WaveformCompletion>) => void) { this.notify = notify; }
  update(requests: WaveformRequest[]) {
    this.requests = requests;
    for (const [id, done] of this.completed) {
      if (!requests.some(r => r.clip.id === id && r.geometry === done.geometry)) this.completed.delete(id);
    }
    this.schedule();
  }
  private next() {
    return this.requests.find(r => clipWaveformState(r.source, r.clip) === 'pending' &&
      this.completed.get(r.clip.id)?.key !== r.key && !cachedClipWaveform(r.key));
  }
  private schedule() {
    if (this.disposed || this.running || this.timer !== undefined || !this.next()) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.run(); }, 120);
  }
  private async run() {
    const request = this.next(); if (!request || this.disposed) return;
    this.running = true;
    const current = () => !this.disposed && this.requests.some(r => r.clip.id === request.clip.id &&
      r.geometry === request.geometry && clipWaveformState(r.source, r.clip) === 'pending');
    try {
      await prepareClipWaveform(request.source, request.clip, current);
    } catch { /* A failed current key falls back to source until the next edit. */ }
    finally {
      if (current()) {
        this.completed.set(request.clip.id, {key: request.key, geometry: request.geometry});
        this.notify(new Map(this.completed));
      }
      this.running = false;
      this.schedule();
    }
  }
  dispose() {
    this.disposed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.requests = []; this.completed.clear();
  }
}
