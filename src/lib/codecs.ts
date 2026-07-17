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

/**
 * Decode a whole encoded stream (MP3 / AAC-LC / Ogg-Opus, auto-detected from
 * the header) to de-interleaved per-channel Float32 PCM (±1.0). Throws on
 * unrecognized/unsupported input. Used as a fallback for formats a platform
 * can't decode natively — notably Ogg-Opus in iOS WKWebView.
 */
export async function decodeCompressed(bytes: Uint8Array): Promise<{
  channelData: Float32Array[];
  sampleRate: number;
}> {
  const m = await loadGlint();
  const inPtr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, inPtr);
  const srPtr = m._malloc(4);
  const chPtr = m._malloc(4);
  const frPtr = m._malloc(4);
  const ptr = m._glint_decode_audio(inPtr, bytes.length, srPtr, chPtr, frPtr);
  m._free(inPtr);
  if (!ptr) {
    m._free(srPtr);
    m._free(chPtr);
    m._free(frPtr);
    throw new Error('glint decode failed (unrecognized or unsupported audio)');
  }
  const sampleRate = m.getValue(srPtr, 'i32');
  const channels = m.getValue(chPtr, 'i32');
  const frames = m.getValue(frPtr, 'i32');
  m._free(srPtr);
  m._free(chPtr);
  m._free(frPtr);
  // glint returns interleaved float PCM of length frames*channels. De-interleave
  // into per-channel arrays before freeing the wasm buffer. No allocations occur
  // between the view and the copy, so the heap can't grow and detach it.
  const interleaved = new Float32Array(m.HEAPF32.buffer, ptr, frames * channels);
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const ch = new Float32Array(frames);
    for (let i = 0; i < frames; i++) ch[i] = interleaved[i * channels + c];
    channelData.push(ch);
  }
  m._glint_free(ptr);
  return { channelData, sampleRate };
}

/** Decode compressed bytes and build an AudioBuffer on the given context. */
export async function decodeCompressedToBuffer(
  ctx: BaseAudioContext,
  bytes: Uint8Array,
): Promise<AudioBuffer> {
  const { channelData, sampleRate } = await decodeCompressed(bytes);
  const buffer = ctx.createBuffer(channelData.length, channelData[0].length, sampleRate);
  // Use .set() rather than copyToChannel: it accepts ArrayLike<number> and so
  // doesn't trip the strict Float32Array<ArrayBuffer> generic in newer TS libs.
  channelData.forEach((ch, c) => buffer.getChannelData(c).set(ch));
  return buffer;
}
