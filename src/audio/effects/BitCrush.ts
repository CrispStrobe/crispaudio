/**
 * Bit-crusher effect implemented as a WaveShaperNode.
 *
 * Quantises the signal to `bits` bits (1–16) and blends with the dry signal
 * via `mix` (0 = fully dry, 1 = fully bit-crushed).
 *
 * A WaveShaperNode curve is pre-computed for the given bit depth so the effect
 * runs natively without ScriptProcessorNode.
 */
export function createBitCrush(
  ctx: BaseAudioContext,
  source: AudioNode,
  bits: number,
  mix: number,
): AudioNode {
  const bitsClamped = Math.max(1, Math.min(16, Math.round(bits)));
  const mixClamped = Math.max(0, Math.min(1, mix));

  const shaper = ctx.createWaveShaper();
  shaper.curve = buildBitCrushCurve(bitsClamped);

  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const output = ctx.createGain();

  dryGain.gain.value = 1 - mixClamped;
  wetGain.gain.value = mixClamped;

  source.connect(dryGain);
  source.connect(shaper);
  shaper.connect(wetGain);
  dryGain.connect(output);
  wetGain.connect(output);

  return output;
}

/**
 * Build a waveshaper curve that quantises to `bits` levels.
 * The curve maps every possible input value [-1, 1] to its quantised equivalent.
 */
function buildBitCrushCurve(bits: number, samples = 65536): Float32Array {
  const curve = new Float32Array(samples);
  const levels = Math.pow(2, bits - 1);

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1; // [-1, 1]
    curve[i] = Math.floor(x * levels) / levels;
  }

  return curve;
}
