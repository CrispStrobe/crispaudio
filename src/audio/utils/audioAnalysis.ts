// ---------------------------------------------------------------------------
// CrispAudio — audioAnalysis
// Pure analysis utilities: RMS, peak, FFT spectrum, clipping detection.
// All functions are stateless — no AudioContext dependency.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Amplitude metrics
// ---------------------------------------------------------------------------

/**
 * Compute the Root-Mean-Square amplitude of a sample buffer.
 * Returns 0 for an empty buffer.
 */
export function computeRMS(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Compute the true peak (maximum absolute sample value).
 * Returns 0 for an empty buffer.
 */
export function computePeak(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

// ---------------------------------------------------------------------------
// Clipping detection
// ---------------------------------------------------------------------------

/**
 * Return `true` if any sample exceeds `threshold` in absolute value.
 *
 * @param samples   Input PCM data.
 * @param threshold Detection threshold (default 0.999, i.e. ~0 dBFS).
 */
export function detectClipping(
  samples: Float32Array,
  threshold = 0.999,
): boolean {
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= threshold) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// FFT (radix-2 Cooley-Tukey, pure JS)
// ---------------------------------------------------------------------------

/**
 * In-place radix-2 FFT on split complex arrays.
 * `re` and `im` must each have a length that is a power of two.
 */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Butterfly computation
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < half; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + half] * curRe - im[i + k + half] * curIm;
        const vIm = re[i + k + half] * curIm + im[i + k + half] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + half] = uRe - vRe;
        im[i + k + half] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * Compute the magnitude spectrum of an audio buffer.
 *
 * A rectangular window (no windowing) is applied to the first `fftSize`
 * samples. For better frequency resolution use a Hann-windowed frame before
 * calling this function. The spectrum is scaled so that a full-scale sine
 * at exactly one of the FFT bins returns a magnitude of 1.
 *
 * @param samples Input PCM data (only the first `fftSize` samples are used).
 * @param fftSize Power-of-two FFT size (default 2048).
 * @returns Float32Array of length `fftSize / 2` containing magnitude values.
 *
 * @throws RangeError if `fftSize` is not a positive power of two.
 */
export function computeSpectrum(
  samples: Float32Array,
  fftSize = 2048,
): Float32Array {
  if (fftSize <= 0 || (fftSize & (fftSize - 1)) !== 0) {
    throw new RangeError(`fftSize must be a positive power of two, got ${fftSize}`);
  }

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  // Copy samples into re (zero-pad if the buffer is shorter than fftSize)
  const copyLen = Math.min(samples.length, fftSize);
  for (let i = 0; i < copyLen; i++) {
    re[i] = samples[i];
  }

  fft(re, im);

  // Compute magnitude for the positive-frequency half
  const half = fftSize / 2;
  const magnitudes = new Float32Array(half);
  const scale = 2 / fftSize; // normalise so a full-scale tone = 1

  for (let i = 0; i < half; i++) {
    magnitudes[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) * scale;
  }

  return magnitudes;
}

// ---------------------------------------------------------------------------
// dBFS conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a linear amplitude value (0..1) to dBFS.
 * Returns -Infinity for zero.
 */
export function linearToDbfs(linear: number): number {
  if (linear <= 0) return -Infinity;
  return 20 * Math.log10(linear);
}

/**
 * Convert a dBFS value to a linear amplitude (0..1).
 */
export function dbfsToLinear(dbfs: number): number {
  return Math.pow(10, dbfs / 20);
}
