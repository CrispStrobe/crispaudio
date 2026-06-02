/**
 * Creates a lowpass BiquadFilterNode and connects `source` to it.
 * Returns the filter node as the output.
 *
 * @param ctx    Audio context
 * @param source Input node
 * @param freq   Cutoff frequency in Hz (clamped to 20–22050)
 * @param q      Quality factor (default 1.0)
 */
export function createLowpass(
  ctx: BaseAudioContext,
  source: AudioNode,
  freq: number,
  q = 1.0,
): AudioNode {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.max(20, Math.min(22050, freq));
  filter.Q.value = Math.max(0.0001, Math.min(1000, q));
  source.connect(filter);
  return filter;
}

/**
 * Creates a highpass BiquadFilterNode and connects `source` to it.
 *
 * @param ctx    Audio context
 * @param source Input node
 * @param freq   Cutoff frequency in Hz (clamped to 10–20000)
 * @param q      Quality factor (default 1.0)
 */
export function createHighpass(
  ctx: BaseAudioContext,
  source: AudioNode,
  freq: number,
  q = 1.0,
): AudioNode {
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = Math.max(10, Math.min(20000, freq));
  filter.Q.value = Math.max(0.0001, Math.min(1000, q));
  source.connect(filter);
  return filter;
}

/**
 * Creates a bandpass BiquadFilterNode and connects `source` to it.
 *
 * @param ctx    Audio context
 * @param source Input node
 * @param freq   Centre frequency in Hz
 * @param q      Quality factor (default 1.0)
 */
export function createBandpass(
  ctx: BaseAudioContext,
  source: AudioNode,
  freq: number,
  q = 1.0,
): AudioNode {
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = Math.max(20, Math.min(22050, freq));
  filter.Q.value = Math.max(0.0001, Math.min(1000, q));
  source.connect(filter);
  return filter;
}
