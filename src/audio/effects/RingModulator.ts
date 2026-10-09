/**
 * Ring modulator: multiplies the input signal by a sine wave carrier.
 * The classic "robot voice" / metallic effect.
 *
 * Uses a pure Web Audio graph (OscillatorNode × GainNode) rather than
 * ScriptProcessorNode so it works inside OfflineAudioContext without issues.
 *
 * @param ctx    Audio context
 * @param source Input audio node
 * @param freq   Carrier frequency in Hz
 * @param mix    Wet/dry 0–1 (0 = fully dry, 1 = fully ring-modulated)
 * @returns      Mixed output node
 */
export function createRingModulator(
  ctx: BaseAudioContext,
  source: AudioNode,
  freq: number,
  mix: number,
): AudioNode {
  // The modulator oscillator acts as a multiplier via a GainNode
  const carrier = ctx.createOscillator();
  const carrierGain = ctx.createGain();
  const modulatedGain = ctx.createGain();
  const dryGain = ctx.createGain();
  const output = ctx.createGain();

  carrier.type = 'sine';
  carrier.frequency.value = Math.max(0.1, freq);

  const mixClamped = Math.max(0, Math.min(1, mix));
  // AudioParam inputs add to its intrinsic value. Keep that value zero,
  // then scale the carrier itself to obtain a true wet/dry blend.
  carrierGain.gain.value = mixClamped;
  dryGain.gain.value = 1 - mixClamped;
  modulatedGain.gain.value = 0;

  // Source feeds the ring-mod gain node
  source.connect(modulatedGain);
  // Carrier oscillator modulates the gain value of modulatedGain (ring-mod)
  carrier.connect(carrierGain);
  carrierGain.connect(modulatedGain.gain);

  // Dry path
  source.connect(dryGain);

  // Sum
  dryGain.connect(output);
  modulatedGain.connect(output);

  carrier.start();

  return output;
}
