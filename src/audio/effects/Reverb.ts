/**
 * Generate a stereo impulse response that models a hall-type reverb.
 *
 * The response combines a fast early-reflection burst and a slower
 * exponentially-decaying tail with low-level random diffusion noise.
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
    for (let i = 0; i < length; i++) {
      const t = i / ctx.sampleRate;
      const envelope = Math.exp(-3 * t / Math.max(0.001, decay));
      const earlyReflection = Math.exp(-t / 0.1) * 0.3;
      const lateTail = Math.exp(-t / Math.max(0.001, decay * 0.5)) * 0.7;
      const diffusion = (Math.random() * 2 - 1) * 0.1;
      channelData[i] = (earlyReflection + lateTail + diffusion) * envelope;
    }
  }

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
  convolver.buffer = generateImpulseResponse(ctx, duration, Math.max(0.01, decay));

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
