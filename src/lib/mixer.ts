export function signalLevels(samples: Float32Array) {
  let peak = 0, sum = 0;
  for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); sum += sample * sample; }
  return {peak, rms: samples.length ? Math.sqrt(sum / samples.length) : 0};
}
