/**
 * Stereo-style chorus effect using two LFO-modulated delay lines.
 * The second LFO is slightly detuned (1.2×) for a wider, more lush feel.
 * Returns the wet/dry mixed output node.
 */
export function createChorus(
  ctx: BaseAudioContext,
  source: AudioNode,
  rate: number,
  depth: number,
  mix: number,
): AudioNode {
  const delay1 = ctx.createDelay(0.1);
  const delay2 = ctx.createDelay(0.1);
  const lfo1 = ctx.createOscillator();
  const lfo2 = ctx.createOscillator();
  const lfoGain1 = ctx.createGain();
  const lfoGain2 = ctx.createGain();
  const wetGain = ctx.createGain();
  const dryGain = ctx.createGain();
  const output = ctx.createGain();

  // LFO configuration
  lfo1.type = 'sine';
  lfo2.type = 'sine';
  lfo1.frequency.value = rate;
  lfo2.frequency.value = rate * 1.2; // slight detuning for richness

  // Modulation depth — chorusDepth (0–1) maps to ±10ms of delay wobble
  const depthClamped = Math.max(0, Math.min(1, depth));
  lfoGain1.gain.value = depthClamped * 0.01;
  lfoGain2.gain.value = depthClamped * 0.01;

  // Static base delay times (20ms / 30ms centres)
  delay1.delayTime.value = 0.02;
  delay2.delayTime.value = 0.03;

  // Wire LFOs into delay time AudioParams
  lfo1.connect(lfoGain1);
  lfo2.connect(lfoGain2);
  lfoGain1.connect(delay1.delayTime);
  lfoGain2.connect(delay2.delayTime);

  // Audio path
  source.connect(delay1);
  source.connect(delay2);
  source.connect(dryGain);
  delay1.connect(wetGain);
  delay2.connect(wetGain);

  // Mix
  const mixClamped = Math.max(0, Math.min(1, mix));
  wetGain.gain.value = mixClamped;
  dryGain.gain.value = 1 - mixClamped;

  dryGain.connect(output);
  wetGain.connect(output);

  lfo1.start();
  lfo2.start();

  return output;
}
