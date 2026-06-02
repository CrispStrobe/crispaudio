/**
 * PSOLA-style time stretcher — pure AudioBuffer → AudioBuffer transform.
 *
 * Algorithm: overlap-add (OLA) with a Hann window.
 * The analysis hop is fixed; the synthesis hop is scaled by `factor`.
 * This changes duration without affecting pitch (within the limits of OLA).
 *
 * @param buffer  Input AudioBuffer
 * @param factor  Stretch factor: >1 = slower/longer, <1 = faster/shorter
 * @returns       New AudioBuffer with adjusted duration
 */
export function timeStretch(buffer: AudioBuffer, factor: number): AudioBuffer {
  if (factor === 1.0) return buffer;

  const inputData = buffer.getChannelData(0);
  const inputLength = inputData.length;
  const outputLength = Math.floor(inputLength * factor);

  const frameSize = 1024;
  const hopAnalysis = Math.floor(frameSize / 4);
  const hopSynthesis = Math.floor(hopAnalysis * factor);

  // Pre-compute Hann window
  const window = createHannWindow(frameSize);

  // Allocate output buffer (requires a real AudioContext; use OfflineAudioContext)
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

  const outputData = outputBuffer.getChannelData(0);

  let analysisPos = 0;
  let synthesisPos = 0;

  while (analysisPos + frameSize < inputLength && synthesisPos + frameSize < outputLength) {
    // Extract Hann-windowed frame
    const frame = new Float32Array(frameSize);
    for (let i = 0; i < frameSize; i++) {
      if (analysisPos + i < inputLength) {
        frame[i] = inputData[analysisPos + i] * window[i];
      }
    }

    // Overlap-add into output
    for (let i = 0; i < frameSize && synthesisPos + i < outputLength; i++) {
      outputData[synthesisPos + i] += frame[i];
    }

    analysisPos += hopAnalysis;
    synthesisPos += hopSynthesis;
  }

  // Mirror channel 0 to remaining channels
  for (let ch = 1; ch < buffer.numberOfChannels; ch++) {
    outputBuffer.getChannelData(ch).set(outputData);
  }

  return outputBuffer;
}

/** Hann window helper shared across DSP modules. */
function createHannWindow(size: number): Float32Array {
  const win = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return win;
}
