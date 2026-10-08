import type { AudioSource, TimelineTrack } from '../types/audio';

const gains = new WeakMap<Float32Array, number>();
/** Visual normalization only. Never write gain back to the audio project. */
export function sourceDisplayGain(source: AudioSource): number {
  const key = source.peaks.max;
  const cached = gains.get(key);
  if (cached !== undefined) return cached;
  let peak = 0;
  for (let i = 0; i < key.length; i++) peak = Math.max(peak, Math.abs(key[i]), Math.abs(source.peaks.min[i]));
  const gain = peak > 1e-8 ? 0.9 / peak : 1;
  gains.set(key, gain);
  return gain;
}

/** Preserve all transients in a pixel; use decoded samples when zoom exceeds
 * the cached peak resolution. At coarser zoom, inspect every covered peak bin. */
export function waveformBounds(source: AudioSource, start: number, end: number): [number, number] {
  if (end <= 0 || start >= source.duration || end <= start) return [0, 0];
  const lo = Math.max(0, start), hi = Math.min(source.duration, end);
  const count = source.peaks.max.length;
  if (!count) return [0, 0];
  let min = 0, max = 0;
  if (hi - lo < source.duration / count && typeof source.buffer.getChannelData === 'function') {
    const data = source.buffer.getChannelData(0);
    const from = Math.floor(lo * source.sampleRate);
    const to = Math.min(data.length, Math.max(from + 1, Math.ceil(hi * source.sampleRate)));
    for (let i = from; i < to; i++) { min = Math.min(min, data[i]); max = Math.max(max, data[i]); }
  } else {
    const from = Math.floor(lo / source.duration * count);
    const to = Math.min(count, Math.max(from + 1, Math.ceil(hi / source.duration * count)));
    for (let i = from; i < to; i++) { min = Math.min(min, source.peaks.min[i]); max = Math.max(max, source.peaks.max[i]); }
  }
  return [min, max];
}

export function trackEnvelope(track: TimelineTrack, sources: Map<string, AudioSource>, start: number, end: number, columns: number): Float32Array {
  const result = new Float32Array(columns);
  for (const clip of track.segments) {
    const source = sources.get(clip.sourceId);
    if (!source) continue;
    for (let i = 0; i < columns; i++) {
      const a = Math.max(start + i / columns * (end - start), clip.startTime);
      const b = Math.min(start + (i + 1) / columns * (end - start), clip.startTime + clip.duration);
      if (b <= a) continue;
      const [min, max] = waveformBounds(source, clip.sourceOffset + a - clip.startTime, clip.sourceOffset + b - clip.startTime);
      result[i] = Math.max(result[i], -min, max);
    }
  }
  const peak = result.reduce((a, b) => Math.max(a, b), 0);
  if (peak > 1e-8) for (let i = 0; i < columns; i++) result[i] /= peak;
  return result;
}
