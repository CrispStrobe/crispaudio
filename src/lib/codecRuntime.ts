// Worker-only Glint runtime. Keep all synchronous WASM work off the UI thread.
import createGlint from './glint/glint.mjs';
import glintWasmUrl from './glint/glint.wasm?url';
import type { CompressedFormat } from './codecProtocol';

const GLINT_FORMAT: Record<CompressedFormat, number> = { mp3: 0, aac: 1, opus: 2 };
type GlintModule = Awaited<ReturnType<typeof createGlint>>;
let modPromise: Promise<GlintModule> | null = null;
function loadGlint(): Promise<GlintModule> {
  if (!modPromise) {
    modPromise = createGlint({
      locateFile: (p: string) => (p.endsWith('.wasm') ? glintWasmUrl : p),
    }).catch(error => { modPromise = null; throw error; });
  }
  return modPromise;
}

// Each request owns its allocations, including partially completed operations.
function allocations(m: GlintModule) {
  const pointers: number[] = [];
  return {
    malloc(size: number) {
      const ptr = m._malloc(Math.max(1, size));
      if (!ptr) throw new Error('Codec memory allocation failed');
      pointers.push(ptr);
      return ptr;
    },
    free() { for (const ptr of pointers) m._free(ptr); },
  };
}

export async function encodeCompressed(
  pcm: Float32Array,
  channels: number,
  sampleRate: number,
  format: CompressedFormat,
  bitrateKbps = 192,
): Promise<ArrayBuffer> {
  const m = await loadGlint();
  const owned = allocations(m);
  let ptr = 0;
  try {
    const frames = Math.floor(pcm.length / channels);
    const pcmPtr = owned.malloc(pcm.length * 4);
    m.HEAPF32.set(pcm, pcmPtr >> 2);
    const outSizePtr = owned.malloc(4);
    ptr = m._glint_encode_audio(
      pcmPtr, frames, channels, sampleRate, GLINT_FORMAT[format],
      bitrateKbps, -1, 1, outSizePtr,
    );
    if (!ptr) throw new Error(`glint ${format} encode failed`);
    const size = m.getValue(outSizePtr, 'i32');
    return new Uint8Array(m.HEAPU8.buffer, ptr, size).slice().buffer;
  } finally {
    if (ptr) m._glint_free(ptr);
    owned.free();
  }
}

export async function decodeCompressed(bytes: Uint8Array): Promise<{
  channelData: Float32Array<ArrayBuffer>[];
  sampleRate: number;
}> {
  const m = await loadGlint();
  const owned = allocations(m);
  let ptr = 0;
  try {
    const inPtr = owned.malloc(bytes.length);
    m.HEAPU8.set(bytes, inPtr);
    const srPtr = owned.malloc(4);
    const chPtr = owned.malloc(4);
    const frPtr = owned.malloc(4);
    ptr = m._glint_decode_audio(inPtr, bytes.length, srPtr, chPtr, frPtr);
    if (!ptr) throw new Error('glint decode failed (unrecognized or unsupported audio)');
    const sampleRate = m.getValue(srPtr, 'i32');
    const channels = m.getValue(chPtr, 'i32');
    const frames = m.getValue(frPtr, 'i32');
    const interleaved = new Float32Array(m.HEAPF32.buffer, ptr, frames * channels);
    const channelData: Float32Array<ArrayBuffer>[] = [];
    for (let c = 0; c < channels; c++) {
      const ch = new Float32Array(frames);
      for (let i = 0; i < frames; i++) ch[i] = interleaved[i * channels + c];
      channelData.push(ch);
    }
    return { channelData, sampleRate };
  } finally {
    if (ptr) m._glint_free(ptr);
    owned.free();
  }
}
