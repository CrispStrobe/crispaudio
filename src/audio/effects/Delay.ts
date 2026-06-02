/**
 * Feedback delay effect with wet/dry mix.
 * Returns the mixed output node.
 */
export function createDelay(
  ctx: BaseAudioContext,
  source: AudioNode,
  time: number,
  feedback: number,
  mix: number,
): AudioNode {
  // Allow up to 2s max delay time
  const delay = ctx.createDelay(2.0);
  const feedbackGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const dryGain = ctx.createGain();
  const output = ctx.createGain();

  // Clamp feedback below unity to prevent infinite blowup
  delay.delayTime.value = Math.max(0, Math.min(2.0, time));
  feedbackGain.gain.value = Math.max(0, Math.min(0.95, feedback));

  const mixClamped = Math.max(0, Math.min(1, mix));
  wetGain.gain.value = mixClamped;
  dryGain.gain.value = 1 - mixClamped;

  // Signal flow: source → delay → feedback loop
  source.connect(delay);
  delay.connect(feedbackGain);
  feedbackGain.connect(delay); // feedback loop

  // Mix
  source.connect(dryGain);
  delay.connect(wetGain);
  dryGain.connect(output);
  wetGain.connect(output);

  return output;
}
