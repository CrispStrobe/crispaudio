import { beforeEach, expect, it, vi } from 'vitest';
const { create, free, encode, decode, malloc } = vi.hoisted(() => ({ create: vi.fn(), free: vi.fn(), encode: vi.fn(), decode: vi.fn(), malloc: vi.fn() }));
vi.mock('../../../src/lib/glint/glint.mjs', () => ({ default: create }));
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  let ptr = 16;
  malloc.mockImplementation(() => { ptr += 16; return ptr; });
  const heap = new ArrayBuffer(1024);
  create.mockResolvedValue({ _malloc: malloc, _free: free, _glint_free: free,
    _glint_encode_audio: encode, _glint_decode_audio: decode,
    HEAPF32: new Float32Array(heap), HEAPU8: new Uint8Array(heap), getValue: () => 1 });
});
it.each(['encode', 'decode'])('frees allocations when %s throws', async operation => {
  const runtime = await import('../../../src/lib/codecRuntime');
  encode.mockImplementation(() => { throw new Error('trap'); });
  decode.mockImplementation(() => { throw new Error('trap'); });
  const promise = operation === 'encode' ? runtime.encodeCompressed(new Float32Array([0]), 1, 48000, 'mp3') : runtime.decodeCompressed(new Uint8Array([1]));
  await expect(promise).rejects.toThrow('trap');
  expect(free.mock.calls.map(([ptr]) => ptr).sort()).toEqual(malloc.mock.results.map(r => r.value).sort());
});
it('retries initialization after a failed WASM load', async () => {
  create.mockRejectedValueOnce(new Error('network'));
  const runtime = await import('../../../src/lib/codecRuntime');
  await expect(runtime.encodeCompressed(new Float32Array([0]), 1, 48000, 'mp3')).rejects.toThrow('network');
  encode.mockReturnValue(128);
  await expect(runtime.encodeCompressed(new Float32Array([0]), 1, 48000, 'mp3')).resolves.toBeInstanceOf(ArrayBuffer);
  expect(create).toHaveBeenCalledTimes(2);
});
