// ---------------------------------------------------------------------------
// codecs — compressed audio export (MP3 / AAC / Opus) via the glint codec
// suite compiled to WebAssembly. Runs entirely in the browser/webview, same
// as the rest of CrispAudio's audio path; the .wasm is lazy-loaded on first
// use so it never bloats the initial bundle. WAV export stays in wavExport.ts.
// ---------------------------------------------------------------------------

import createGlint from './glint/glint.mjs';
import glintWasmUrl from './glint/glint.wasm?url';

export type CompressedFormat = 'mp3' | 'aac' | 'opus';
export type AudioFormat = 'wav' | CompressedFormat;

const GLINT_FORMAT: Record<CompressedFormat, number> = { mp3: 0, aac: 1, opus: 2 };
const MIME: Record<CompressedFormat, string> = {
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  opus: 'audio/ogg',
};
export const FORMAT_EXT: Record<AudioFormat, string> = {
  wav: 'wav',
  mp3: 'mp3',
  aac: 'aac',
  opus: 'opus',
};
export const FORMAT_LABEL: Record<AudioFormat, string> = {
  wav: 'WAV',
  mp3: 'MP3',
  aac: 'AAC',
  opus: 'Opus',
};

type GlintModule = Awaited<ReturnType<typeof createGlint>>;
let modPromise: Promise<GlintModule> | null = null;
function loadGlint(): Promise<GlintModule> {
  if (!modPromise) {
    modPromise = createGlint({
      locateFile: (p: string) => (p.endsWith('.wasm') ? glintWasmUrl : p),
    });
  }
  return modPromise;
}

/** Interleave per-channel Float32 buffers into a single interleaved buffer. */
export function interleave(channelData: Float32Array[]): {
  pcm: Float32Array;
  channels: number;
} {
  const channels = channelData.length;
  if (channels === 1) return { pcm: channelData[0], channels: 1 };
  const frames = channelData[0].length;
  const pcm = new Float32Array(frames * channels);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) pcm[i * channels + c] = channelData[c][i];
  }
  return { pcm, channels };
}

/**
 * Encode interleaved Float32 PCM (±1.0) to a compressed Blob. The input is
 * auto-resampled to a codec-valid rate by glint (Opus → 48 kHz).
 */
export async function encodeCompressed(
  pcm: Float32Array,
  channels: number,
  sampleRate: number,
  format: CompressedFormat,
  bitrateKbps = 192,
): Promise<Blob> {
  const m = await loadGlint();
  const frames = Math.floor(pcm.length / channels);
  const pcmPtr = m._malloc(pcm.length * 4);
  m.HEAPF32.set(pcm, pcmPtr >> 2);
  const outSizePtr = m._malloc(4);
  const ptr = m._glint_encode_audio(
    pcmPtr, frames, channels, sampleRate, GLINT_FORMAT[format],
    bitrateKbps, -1, 1, outSizePtr,
  );
  m._free(pcmPtr);
  if (!ptr) {
    m._free(outSizePtr);
    throw new Error(`glint ${format} encode failed`);
  }
  const size = m.getValue(outSizePtr, 'i32');
  m._free(outSizePtr);
  const bytes = new Uint8Array(m.HEAPU8.buffer, ptr, size).slice();
  m._glint_free(ptr);
  return new Blob([bytes], { type: MIME[format] });
}

/** Convenience: encode a Web Audio AudioBuffer to a compressed Blob. */
export async function encodeAudioBuffer(
  buffer: AudioBuffer,
  format: CompressedFormat,
  bitrateKbps = 192,
): Promise<Blob> {
  const channelData = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
    buffer.getChannelData(c),
  );
  const { pcm, channels } = interleave(channelData);
  return encodeCompressed(pcm, channels, buffer.sampleRate, format, bitrateKbps);
}

/** Convenience: encode a mono Float32Array to a compressed Blob. */
export async function encodeMono(
  data: Float32Array,
  sampleRate: number,
  format: CompressedFormat,
  bitrateKbps = 192,
): Promise<Blob> {
  return encodeCompressed(data, 1, sampleRate, format, bitrateKbps);
}
