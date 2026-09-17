// Worker-safe mono encoder: preserve legacy float32/rounding semantics.
export function encodeWavJS(
  buffer: Float32Array,
  sampleRate: number,
  bitDepth: number,
): Blob {
  const numChannels = 1;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const numSamples = buffer.length;
  const dataSize = numSamples * blockAlign;

  // For 32-bit float we use format tag 3 (IEEE float); otherwise 1 (PCM).
  const formatTag = bitDepth === 32 ? 3 : 1;

  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i));
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);           // sub-chunk size
  view.setUint16(20, formatTag, true);     // audio format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  switch (bitDepth) {
    case 8:
      for (let i = 0; i < numSamples; i++) {
        // 8-bit WAV is unsigned: 0-255, 128 = silence
        view.setUint8(offset, Math.round((buffer[i] + 1) * 127.5));
        offset += 1;
      }
      break;

    case 16:
      for (let i = 0; i < numSamples; i++) {
        const s = Math.max(-1, Math.min(1, buffer[i]));
        view.setInt16(offset, Math.round(s * 32767), true);
        offset += 2;
      }
      break;

    case 24:
      for (let i = 0; i < numSamples; i++) {
        const s = Math.max(-1, Math.min(1, buffer[i]));
        const val = Math.round(s * 8388607);
        // Write 24-bit little-endian (3 bytes)
        view.setUint8(offset, val & 0xff);
        view.setUint8(offset + 1, (val >> 8) & 0xff);
        view.setUint8(offset + 2, (val >> 16) & 0xff);
        offset += 3;
      }
      break;

    case 32:
      for (let i = 0; i < numSamples; i++) {
        view.setFloat32(offset, buffer[i], true);
        offset += 4;
      }
      break;

    default:
      throw new Error(`Unsupported bit depth: ${bitDepth}`);
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

