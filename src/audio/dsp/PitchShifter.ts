/**
 * Granular pitch shifter — pure AudioBuffer → AudioBuffer transform.
 *
 * Algorithm: overlap-add with per-grain linear-interpolation resampling.
 * Each grain is extracted from the input, windowed with a Hann function,
 * resampled to change the playback speed within the grain (which shifts
 * pitch without changing duration when hop sizes are adjusted), and
 * overlap-added into the output buffer.
 *
 * @param buffer    Input AudioBuffer (mono or multi-channel; only ch0 processed)
 * @param semitones Pitch shift in semitones (-24 to +24)
 * @param grainSize Grain length in samples (default 2048)
 * @param overlap   Overlap fraction 0–1 (default 0.75)
 * @returns         New AudioBuffer pitched by `semitones`
 */
export function granularPitchShift(
  buffer: AudioBuffer,
  semitones: number,
  grainSize = 2048,
  overlap = 0.75,
): AudioBuffer {
  if (semitones === 0) return buffer;

  const pitchRatio = Math.pow(2, semitones / 12);
  const inputData = buffer.getChannelData(0);
  const inputLength = inputData.length;
  const outputLength = Math.floor(inputLength / pitchRatio);

  // Allocate output — same number of channels, same sample rate
  const offCtx = new OfflineAudioContext(
    buffer.numberOfChannels,
    outputLength,
    buffer.sampleRate,
  );
  const outputBuffer = offCtx.createBuffer(
    buffer.numberOfChannels,
    outputLength,
    buffer.sampleRate,
  );

  // Pre-compute Hann window for the grain size
  const window = createHannWindow(grainSize);

  const hopInput = Math.floor(grainSize * (1 - overlap));
  const hopOutput = Math.floor(hopInput / pitchRatio);

  // Process channel 0 (and mirror to all other channels if multi-channel)
  const outputData = outputBuffer.getChannelData(0);

  let inputPos = 0;
  let outputPos = 0;

  while (inputPos + grainSize < inputLength && outputPos + grainSize < outputLength) {
    // Extract and window grain
    const grain = new Float32Array(grainSize);
    for (let i = 0; i < grainSize; i++) {
      if (inputPos + i < inputLength) {
        grain[i] = inputData[inputPos + i] * window[i];
      }
    }

    // Resample grain using linear interpolation (changes speed → shifts pitch)
    const resampled = resampleGrain(grain, pitchRatio);

    // Overlap-add into output
    for (let i = 0; i < resampled.length && outputPos + i < outputLength; i++) {
      outputData[outputPos + i] += resampled[i];
    }

    inputPos += hopInput;
    outputPos += hopOutput;
  }

  // Copy channel 0 to remaining channels
  for (let ch = 1; ch < buffer.numberOfChannels; ch++) {
    const chData = outputBuffer.getChannelData(ch);
    chData.set(outputData);
  }

  return outputBuffer;
}

/** Resample a grain using linear interpolation. */
function resampleGrain(grain: Float32Array, ratio: number): Float32Array {
  const outputLength = Math.floor(grain.length / ratio);
  const resampled = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const floor = Math.floor(srcIndex);
    const ceil = Math.min(floor + 1, grain.length - 1);
    const frac = srcIndex - floor;
    resampled[i] = grain[floor] * (1 - frac) + grain[ceil] * frac;
  }

  return resampled;
}

/** Create a Hann (raised cosine) window of the given size. */
function createHannWindow(size: number): Float32Array {
  const win = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return win;
}
