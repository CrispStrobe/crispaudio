// ---------------------------------------------------------------------------
// CrispAudio — audioBufferUtils
// Buffer-level utilities: wrapping samples in AudioBuffer, WAV encoding,
// normalisation, and waveform peak extraction.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AudioContext integration
// ---------------------------------------------------------------------------

/**
 * Wrap a mono Float32Array of samples in an AudioBuffer.
 *
 * @param samples    PCM samples in [-1, 1].
 * @param sampleRate Sample rate used during synthesis (must match ctx if playing
 *                   back directly; can differ for offline encoding).
 * @param ctx        A running AudioContext (or OfflineAudioContext).
 */
export function samplesToAudioBuffer(
  samples: Float32Array,
  sampleRate: number,
  ctx: AudioContext | OfflineAudioContext,
): AudioBuffer {
  const buf = ctx.createBuffer(1, samples.length, sampleRate);
  buf.copyToChannel(samples, 0);
  return buf;
}

// ---------------------------------------------------------------------------
// Pure WAV encoder (no AudioContext dependency)
// ---------------------------------------------------------------------------

/** Supported PCM bit depths. */
export type BitDepth = 8 | 16 | 24 | 32;

/**
 * Encode a mono Float32Array as a PCM WAV file.
 *
 * Supports 8, 16, 24 and 32-bit integer PCM. Float32 samples are quantised
 * with correct dithering-free truncation.
 *
 * @param samples    Input PCM data in [-1, 1].
 * @param sampleRate Target sample rate (Hz).
 * @param bitDepth   Target bit depth (default 16).
 * @returns ArrayBuffer containing a well-formed RIFF WAV file.
 */
export function encodeWav(
  samples: Float32Array,
  sampleRate: number,
  bitDepth: BitDepth = 16,
): ArrayBuffer {
  const bytesPerSample = bitDepth / 8;
  const numChannels = 1;
  const numSamples = samples.length;
  const dataLength = numSamples * bytesPerSample * numChannels;

  // RIFF header (44 bytes) + PCM data
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  function writeStr(offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF chunk descriptor
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);     // ChunkSize
  writeStr(8, 'WAVE');

  // fmt sub-chunk
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);                  // Subchunk1Size (PCM = 16)
  view.setUint16(20, 1, true);                   // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);          // NumChannels
  view.setUint32(24, sampleRate, true);           // SampleRate
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // ByteRate
  view.setUint16(32, numChannels * bytesPerSample, true); // BlockAlign
  view.setUint16(34, bitDepth, true);             // BitsPerSample

  // data sub-chunk
  writeStr(36, 'data');
  view.setUint32(40, dataLength, true);           // Subchunk2Size

  // PCM samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    // Clamp to [-1, 1] before quantisation
    const s = Math.max(-1, Math.min(1, samples[i]));

    switch (bitDepth) {
      case 8: {
        // 8-bit WAV is unsigned, 0 = -1, 128 = 0, 255 = ~+1
        view.setUint8(offset, Math.round((s + 1) * 127.5));
        offset += 1;
        break;
      }
      case 16: {
        view.setInt16(offset, Math.round(s * 32767), true);
        offset += 2;
        break;
      }
      case 24: {
        const v = Math.round(s * 8388607); // 2^23 - 1
        view.setUint8(offset,     (v & 0x0000ff));
        view.setUint8(offset + 1, (v & 0x00ff00) >> 8);
        view.setUint8(offset + 2, (v & 0xff0000) >> 16);
        offset += 3;
        break;
      }
      case 32: {
        view.setInt32(offset, Math.round(s * 2147483647), true); // 2^31 - 1
        offset += 4;
        break;
      }
    }
  }

  return buffer;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Peak-normalise a Float32Array to ±1 in-place (returns the same array).
 * If the buffer is silent (all zeros) it is returned unchanged.
 */
export function normalizeBuffer(samples: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  if (peak === 0) return samples;
  const scale = 1 / peak;
  for (let i = 0; i < samples.length; i++) {
    samples[i] *= scale;
  }
  return samples;
}

// ---------------------------------------------------------------------------
// Waveform peak extraction (for canvas rendering)
// ---------------------------------------------------------------------------

/**
 * Downsample an audio buffer into a fixed number of bins for waveform display.
 * Each bin contains the min and max sample values within that chunk, giving an
 * accurate envelope representation at any zoom level.
 *
 * @param samples Input PCM data.
 * @param numBins Number of display columns (e.g. canvas pixel width).
 * @returns Object with `min` and `max` Float32Arrays, each of length `numBins`.
 */
export function computeWaveformPeaks(
  samples: Float32Array,
  numBins: number,
): { min: Float32Array; max: Float32Array } {
  const minPeaks = new Float32Array(numBins);
  const maxPeaks = new Float32Array(numBins);
  const binSize = samples.length / numBins;

  for (let b = 0; b < numBins; b++) {
    const start = Math.floor(b * binSize);
    const end = Math.min(samples.length, Math.ceil((b + 1) * binSize));

    let lo = Infinity;
    let hi = -Infinity;

    for (let i = start; i < end; i++) {
      const v = samples[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }

    minPeaks[b] = lo === Infinity ? 0 : lo;
    maxPeaks[b] = hi === -Infinity ? 0 : hi;
  }

  return { min: minPeaks, max: maxPeaks };
}

// ---------------------------------------------------------------------------
// Sample-rate conversion (nearest-neighbour, integer ratio)
// ---------------------------------------------------------------------------

/**
 * Resample a mono Float32Array to a new sample rate using nearest-neighbour
 * interpolation. For production use consider a polyphase sinc-interpolated
 * resampler; this is provided as a fast offline fallback.
 *
 * @param samples       Input samples at `fromRate`.
 * @param fromRate      Source sample rate (Hz).
 * @param toRate        Target sample rate (Hz).
 * @returns Resampled Float32Array.
 */
export function resampleNearest(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const newLength = Math.round(samples.length / ratio);
  const out = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    out[i] = samples[Math.min(Math.floor(i * ratio), samples.length - 1)];
  }
  return out;
}
