import type {AudioSegment, AudioSource} from '../types/audio';
import {TimelineEngine} from '../audio/engine/TimelineEngine';

export type ClipWaveformState = 'dry' | 'pending' | 'ready' | 'source';
const bufferIds = new WeakMap<AudioBuffer, number>();
let nextId = 0;
/** Source identity and every audible clip edit, never names/selection/view state. */
export function clipWaveformKey(source: AudioSource, clip: AudioSegment): string {
  if (!bufferIds.has(source.buffer)) bufferIds.set(source.buffer, ++nextId);
  return JSON.stringify([bufferIds.get(source.buffer), clip.sourceOffset, clip.duration,
    clip.startTime, clip.gain, clip.fadeInDuration, clip.fadeOutDuration,
    clip.fadeInCurve, clip.fadeOutCurve, clip.effects, clip.nativeEffects]);
}
export function clipWaveformState(source: AudioSource, clip: AudioSegment): ClipWaveformState {
  if (!clip.effects.some(fx => fx.enabled) && !clip.nativeEffects?.some(fx => fx.enabled && !fx.bypass)) return 'dry';
  if (typeof OfflineAudioContext === 'undefined' || clip.duration > 60 || clip.duration <= 0 ||
      !Number.isFinite(clip.duration) || clip.duration * source.sampleRate * 8 > 32 * 1024 * 1024 ||
      clip.nativeEffects?.some(fx => fx.enabled && !fx.bypass)) return 'source';
  return 'pending';
}

// One render at a time, including superseded requests: OfflineAudioContext cannot
// reliably abort DSP after startRendering. Never queue obsolete slider positions.
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, AudioSource>();
let cacheBytes = 0;
const bytes = (s: AudioSource) => s.buffer.length * s.channels * 4 + s.peaks.max.byteLength + s.peaks.min.byteLength;
export function cachedClipWaveform(key: string): AudioSource | undefined {
  const source = cache.get(key);
  if (source) { cache.delete(key); cache.set(key, source); }
  return source;
}
export function prepareClipWaveform(source: AudioSource, clip: AudioSegment, current: () => boolean): Promise<AudioSource | undefined> {
  const key = clipWaveformKey(source, clip);
  const task = queue.then(async () => {
    if (!current()) return;
    const existing = cachedClipWaveform(key); if (existing) return existing;
    if (clipWaveformState(source, clip) !== 'pending') return;
    const buffer = await TimelineEngine.renderClipWaveform(source, clip);
    if (!current()) return;
    const bins = Math.max(1, Math.min(12000, Math.ceil(buffer.duration * 200)));
    const min = new Float32Array(bins), max = new Float32Array(bins);
    const channels = Array.from({length: buffer.numberOfChannels}, (_, i) => buffer.getChannelData(i));
    let last = performance.now();
    for (let bin = 0; bin < bins; bin++) {
      const from = Math.floor(bin * buffer.length / bins), to = Math.ceil((bin + 1) * buffer.length / bins);
      for (const channel of channels) for (let i = from; i < to; i++) {
        min[bin] = Math.min(min[bin], channel[i]); max[bin] = Math.max(max[bin], channel[i]);
      }
      if (performance.now() - last > 8) {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (!current()) return;
        last = performance.now();
      }
    }
    const result: AudioSource = {id: key, name: source.name, buffer, peaks: {min, max},
      duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels};
    const size = bytes(result);
    while (cache.size && (cache.size >= 8 || cacheBytes + size > 32 * 1024 * 1024)) {
      const oldest = cache.keys().next().value!; cacheBytes -= bytes(cache.get(oldest)!); cache.delete(oldest);
    }
    if (size <= 32 * 1024 * 1024) { cache.set(key, result); cacheBytes += size; }
    return result;
  });
  queue = task.catch(() => undefined);
  return task;
}
