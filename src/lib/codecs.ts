// ---------------------------------------------------------------------------
// codecs — compressed audio export (MP3 / AAC / Opus) via the glint codec
// suite compiled to WebAssembly. Runs entirely in the browser/webview, same
// as the rest of CrispAudio's audio path; the .wasm is lazy-loaded on first
// use so it never bloats the initial bundle. WAV export stays in wavExport.ts.
// ---------------------------------------------------------------------------

import { runCodec } from './codecClient';

export type CompressedFormat = 'mp3' | 'aac' | 'opus';
export type AudioFormat = 'wav' | CompressedFormat;

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
  signal?: AbortSignal,
): Promise<Blob> {
  signal?.throwIfAborted();
  // Transfer an owned copy, never detach a caller's playback buffer or subview.
  const copy = new Float32Array(pcm).buffer;
  return encodeOwned(copy, channels, sampleRate, format, bitrateKbps, signal);
}

/** Internal ownership boundary: the supplied buffer is detached on dispatch. */
async function encodeOwned(
  pcm: ArrayBuffer,
  channels: number,
  sampleRate: number,
  format: CompressedFormat,
  bitrateKbps: number,
  signal?: AbortSignal,
): Promise<Blob> {
  const result = await runCodec({ type: 'encode', pcm, channels, sampleRate, format, bitrateKbps }, [pcm], signal);
  if (result.type !== 'encoded') throw new Error('Unexpected codec encode response');
  return new Blob([result.bytes], { type: MIME[format] });
}

/** Convenience: encode a Web Audio AudioBuffer to a compressed Blob. */
export async function encodeAudioBuffer(
  buffer: AudioBuffer,
  format: CompressedFormat,
  bitrateKbps = 192,
  signal?: AbortSignal,
): Promise<Blob> {
  signal?.throwIfAborted();
  const channelData = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
    buffer.getChannelData(c),
  );
  const { pcm, channels } = interleave(channelData);
  // Mono interleave aliases caller data; multichannel interleave is newly owned.
  if (channels === 1) return encodeCompressed(pcm, channels, buffer.sampleRate, format, bitrateKbps, signal);
  return encodeOwned(pcm.buffer as ArrayBuffer, channels, buffer.sampleRate, format, bitrateKbps, signal);
}

/** Convenience: encode a mono Float32Array to a compressed Blob. */
export async function encodeMono(
  data: Float32Array,
  sampleRate: number,
  format: CompressedFormat,
  bitrateKbps = 192,
  signal?: AbortSignal,
): Promise<Blob> {
  signal?.throwIfAborted();
  return encodeCompressed(data, 1, sampleRate, format, bitrateKbps, signal);
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
  const copy = new Uint8Array(bytes).buffer;
  const result = await runCodec({ type: 'decode', bytes: copy }, [copy]);
  if (result.type !== 'decoded') throw new Error('Unexpected codec decode response');
  return { channelData: result.channelData.map(data => new Float32Array(data)), sampleRate: result.sampleRate };
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
