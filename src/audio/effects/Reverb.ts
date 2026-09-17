/**
 * Generate a stereo impulse response that models a hall-type reverb.
 *
 * The response combines a fast early-reflection burst and a slower
 * exponentially-decaying tail with low-level seeded diffusion noise.
 * Always returns a fresh, caller-owned buffer with reproducible stereo samples.
 *
 * @param ctx     Audio context (used only to allocate the buffer)
 * @param duration  Total IR length in seconds (controls reverb size feel)
 * @param decay   RT60-style decay time in seconds
 */
export function generateImpulseResponse(
  ctx: BaseAudioContext,
  duration: number,
  decay: number,
): AudioBuffer {
  const length = Math.round(ctx.sampleRate * Math.max(0.01, duration));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const channelData = impulse.getChannelData(ch);
    // Independent fixed seeds keep stereo diffusion reproducible across renders.
    let seed = (0x9e3779b9 ^ Math.imul(ch + 1, 0x85ebca6b)) >>> 0;
    for (let i = 0; i < length; i++) {
      const t = i / ctx.sampleRate;
      const envelope = Math.exp(-3 * t / Math.max(0.001, decay));
      const earlyReflection = Math.exp(-t / 0.1) * 0.3;
      const lateTail = Math.exp(-t / Math.max(0.001, decay * 0.5)) * 0.7;
      // xorshift32, converted to uniform [0, 1) noise.
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const diffusion = ((seed >>> 0) / 0x100000000 * 2 - 1) * 0.1;
      channelData[i] = (earlyReflection + lateTail + diffusion) * envelope;
    }
  }

  return impulse;
}

// Only createReverb uses this cache: the public generator returns caller-owned
// mutable buffers and must never expose or populate the shared entries.
const MAX_IMPULSE_ENTRIES = 8;
const MAX_IMPULSE_BYTES = 16 * 1024 * 1024;
const impulseCache = new Map<string, AudioBuffer>();
let impulseCacheBytes = 0;

function getCachedImpulseResponse(
  ctx: BaseAudioContext,
  duration: number,
  decay: number,
): AudioBuffer {
  const length = Math.round(ctx.sampleRate * Math.max(0.01, duration));
  const key = `${ctx.sampleRate}:${length}:${decay}`;
  const cached = impulseCache.get(key);
  if (cached) {
    impulseCache.delete(key);
    impulseCache.set(key, cached);
    return cached;
  }

  const impulse = generateImpulseResponse(ctx, duration, decay);
  const bytes = impulse.length * impulse.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
  // An oversized response still works, but is never retained by the cache.
  if (bytes > MAX_IMPULSE_BYTES) return impulse;
  while (impulseCache.size >= MAX_IMPULSE_ENTRIES || impulseCacheBytes + bytes > MAX_IMPULSE_BYTES) {
    const oldestKey = impulseCache.keys().next().value!;
    const oldest = impulseCache.get(oldestKey)!;
    impulseCacheBytes -= oldest.length * oldest.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
    impulseCache.delete(oldestKey);
  }
  impulseCache.set(key, impulse);
  impulseCacheBytes += bytes;
  return impulse;
}

/**
 * Convolutional reverb with wet/dry control.
 *
 * `size` (0–1) scales the impulse response duration (0.1s–5s).
 * Returns the mixed output node.
 */
export function createReverb(
  ctx: BaseAudioContext,
  source: AudioNode,
  size: number,
  decay: number,
  mix: number,
): AudioNode {
  const sizeClamped = Math.max(0, Math.min(1, size));
  const duration = 0.1 + sizeClamped * 4.9; // 0.1s–5.0s

  const convolver = ctx.createConvolver();
  convolver.buffer = getCachedImpulseResponse(ctx, duration, Math.max(0.01, decay));

  const wetGain = ctx.createGain();
  const dryGain = ctx.createGain();
  const output = ctx.createGain();

  const mixClamped = Math.max(0, Math.min(1, mix));
  wetGain.gain.value = mixClamped;
  // Reduce dry signal slightly less than wet to preserve clarity
  dryGain.gain.value = 1 - mixClamped * 0.7;

  source.connect(dryGain);
  source.connect(convolver);
  convolver.connect(wetGain);
  dryGain.connect(output);
  wetGain.connect(output);

  return output;
}
