declare module '*/glint.mjs' {
  interface GlintModule {
    _malloc(n: number): number;
    _free(p: number): void;
    _glint_free(p: number): void;
    _glint_encode_audio(pcm: number, frames: number, channels: number, sampleRate: number, format: number, bitrateKbps: number, vbrQuality: number, quality: number, outSize: number): number;
    _glint_decode_audio(data: number, len: number, sr: number, ch: number, fr: number): number;
    getValue(ptr: number, type: string): number;
    HEAPU8: Uint8Array;
    HEAPF32: Float32Array;
  }
  const createGlint: (opts?: { locateFile?: (p: string) => string }) => Promise<GlintModule>;
  export default createGlint;
}
