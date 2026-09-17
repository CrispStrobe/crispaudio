// ---------------------------------------------------------------------------
// CrispAudio — WAV export utility
// Uses the Rust `export_wav_binary` Tauri command when available, falls back to a
// pure-JS encoder that supports 8 / 16 / 24 / 32-bit PCM.
// ---------------------------------------------------------------------------

import { runCodec } from './codecClient';
import { isIOSApp, isTauri, shareFile } from './native';

/**
 * Encode a mono Float32Array as a WAV blob.
 *
 * In a Tauri context the encoding is delegated to the Rust `export_wav_binary`
 * command (via hound). On the web (or if the Tauri call fails) a JS fallback
 * handles the encoding directly.
 */
export async function exportWav(
  buffer: Float32Array,
  sampleRate: number,
  bitDepth: number,
  signal?: AbortSignal,
): Promise<Blob> {
  signal?.throwIfAborted();
  // Avoid loading the native bridge and copying samples on the web.
  if (!isTauri()) return encodeWavWorker([buffer], sampleRate, bitDepth, 'mono-float', signal);

  // --- Tauri path (binary payload: header + interleaved f32 samples) --------
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    signal?.throwIfAborted();
    const body = new ArrayBuffer(8 + buffer.length * 4);
    const header = new DataView(body);
    header.setUint32(0, sampleRate, true);
    header.setUint16(4, bitDepth, true);
    header.setUint16(6, 1, true);
    new Float32Array(body, 8).set(buffer);
    const bytes = await invoke<ArrayBuffer | number[]>('export_wav_binary', body);
    signal?.throwIfAborted();
    return new Blob([new Uint8Array(bytes)], { type: 'audio/wav' });
  } catch {
    signal?.throwIfAborted();
    // Not running in Tauri or command failed — fall through to JS encoder.
  }

  // --- JS fallback ----------------------------------------------------------
  return encodeWavWorker([buffer], sampleRate, bitDepth, 'mono-float', signal);
}


/**
 * Save an audio Blob to disk (WAV or a compressed format — the extension is
 * taken from `filename`). In a Tauri context (desktop and mobile) this opens a
 * native save dialog and writes via @tauri-apps/plugin-fs, which works inside
 * the iOS/Android sandbox. On the web it falls back to an `<a download>` — note
 * that iOS Safari/WKWebView ignores the download attribute, which is exactly why
 * the Tauri build must not use this fallback.
 *
 * On iOS the share sheet replaces the save dialog: it offers Save to Files
 * alongside AirDrop, Messages and every other app that accepts audio.
 *
 * Returns false if the user cancels the dialog.
 */
export async function downloadWavFile(blob: Blob, filename: string): Promise<boolean> {
  const ext = filename.split('.').pop()?.toLowerCase() || 'wav';
  if (isIOSApp()) {
    try {
      return await shareFile(blob, filename);
    } catch (err) {
      console.error('Share sheet failed, falling back to save dialog:', err);
    }
  }
  if (isTauri()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      const path = await save({
        defaultPath: filename,
        filters: [{ name: ext === 'json' ? 'JSON' : `${ext.toUpperCase()} Audio`, extensions: [ext] }],
      });
      if (!path) return false;
      await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
      return true;
    } catch (err) {
      console.error('Failed to save WAV:', err);
      return false;
    }
  }

  // Browser fallback.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

async function encodeWavWorker(channels: Float32Array[], sampleRate: number, bitDepth: number, mode: 'mono-float' | 'multichannel-pcm', signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  const channelData = channels.map(channel => new Float32Array(channel).buffer);
  const result = await runCodec({ type: 'wav', channelData, sampleRate, bitDepth, mode }, channelData, signal);
  if (result.type !== 'encoded') throw new Error('Unexpected WAV response');
  return new Blob([result.bytes], { type: 'audio/wav' });
}

export async function encodeAudioBufferWav(buffer: AudioBuffer, bitDepth: number, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  return encodeWavWorker(channels, buffer.sampleRate, bitDepth, 'multichannel-pcm', signal);
}
