// ---------------------------------------------------------------------------
// Minimal iterative radix-2 Cooley–Tukey FFT and a helper to turn a PCM buffer
// into log-spaced magnitude bars for spectrum display.
// ---------------------------------------------------------------------------

/**
 * In-place iterative radix-2 FFT. `re`/`im` must have a power-of-two length.
 * Transforms in place (forward transform).
 */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * Compute `numBars` log-spaced, normalised (0..1) magnitude bars from a PCM
 * buffer. A Hann-windowed slice (up to `fftSize` samples, taken from the part
 * of the signal with the most energy) is transformed and its magnitude
 * spectrum bucketed across the bars.
 */
export function computeSpectrumBars(
  buffer: Float32Array,
  numBars: number,
  fftSize = 4096,
): Float32Array {
  const bars = new Float32Array(numBars);
  if (buffer.length === 0) return bars;

  const n = Math.min(fftSize, 1 << Math.floor(Math.log2(buffer.length)));
  if (n < 2) return bars;

  // Pick the window start near the loudest region for a representative slice.
  let start = 0;
  let bestEnergy = -1;
  const hop = Math.max(1, Math.floor((buffer.length - n) / 8));
  for (let s = 0; s + n <= buffer.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + n; i += 32) e += buffer[i] * buffer[i];
    if (e > bestEnergy) {
      bestEnergy = e;
      start = s;
    }
  }

  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // Hann window
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    re[i] = buffer[start + i] * w;
  }

  fft(re, im);

  const half = n / 2;
  let max = 1e-9;
  const mags = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    const m = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    mags[i] = m;
    if (m > max) max = m;
  }

  // Log-spaced bucketing across the available bins.
  for (let b = 0; b < numBars; b++) {
    const lo = Math.floor(Math.pow(half, b / numBars));
    const hi = Math.max(lo + 1, Math.floor(Math.pow(half, (b + 1) / numBars)));
    let peak = 0;
    for (let i = lo; i < hi && i < half; i++) {
      if (mags[i] > peak) peak = mags[i];
    }
    // Normalise and apply a mild log curve for visual balance.
    bars[b] = Math.min(1, Math.sqrt(peak / max));
  }

  return bars;
}
