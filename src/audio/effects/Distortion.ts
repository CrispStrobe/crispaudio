export type DistortionAlgorithm = 'tanh' | 'hardClip' | 'softClip' | 'fuzz' | 'wavefold';

/**
 * Build a waveshaper curve for the requested algorithm.
 * `drive` is normalised 0–1; `samples` controls curve resolution (default 256).
 */
export function createDistortionCurve(
  algorithm: DistortionAlgorithm,
  drive: number,
  samples = 256,
): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(samples);
  const d = Math.max(0, Math.min(1, drive));

  for (let i = 0; i < samples; i++) {
    // Map curve index to [-1, 1]
    const x = (i * 2) / (samples - 1) - 1;

    switch (algorithm) {
      case 'tanh': {
        // Warm tube-style saturation
        const gain = 1 + d * 4;
        const norm = 1 + d * 0.5;
        curve[i] = Math.tanh(x * gain) / norm;
        break;
      }
      case 'hardClip': {
        // Hard digital clipping
        const threshold = Math.max(0.05, 1 - d * 0.8);
        curve[i] = Math.max(-threshold, Math.min(threshold, x));
        break;
      }
      case 'softClip': {
        // Soft polynomial clip
        const gain = 1 + d * 2;
        const y = x * gain;
        curve[i] = Math.tanh(y);
        break;
      }
      case 'fuzz': {
        // Exponential fuzz curve
        const fGain = 1 + d * 10;
        curve[i] = Math.sign(x) * (1 - Math.exp(-Math.abs(x * fGain)));
        break;
      }
      case 'wavefold': {
        // Wave folding
        const foldAmount = 1 + d * 5;
        curve[i] = Math.sin(x * foldAmount * Math.PI) * 0.8;
        break;
      }
    }

    // Hard limit output to [-1, 1]
    curve[i] = Math.max(-1, Math.min(1, curve[i]));
  }

  return curve;
}

/**
 * Apply distortion to `source` using a WaveShaperNode (wet/dry mix supported).
 * Returns the output mixer node.
 */
export function applyDistortion(
  ctx: BaseAudioContext,
  source: AudioNode,
  drive: number,
  mix: number,
  algorithm: DistortionAlgorithm = 'tanh',
): AudioNode {
  const shaper = ctx.createWaveShaper();
  shaper.curve = createDistortionCurve(algorithm, drive);
  shaper.oversample = '4x';

  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const output = ctx.createGain();

  const wetAmount = Math.max(0, Math.min(1, mix));
  dryGain.gain.value = 1 - wetAmount;
  wetGain.gain.value = wetAmount;

  source.connect(dryGain);
  source.connect(shaper);
  shaper.connect(wetGain);
  dryGain.connect(output);
  wetGain.connect(output);

  return output;
}
