import { afterEach, expect, it, vi } from 'vitest';
import { exportWav } from '../../../src/lib/wavExport';
// Exercise real WAV encoding in jsdom; worker transport is covered separately.
vi.mock('../../../src/lib/codecClient', () => ({
  runCodec: async (job: { channelData: ArrayBuffer[]; sampleRate: number; bitDepth: number }) => {
    const { encodeWavJS } = await import('../../../src/lib/wavRuntime');
    return { type: 'encoded', bytes: await encodeWavJS(new Float32Array(job.channelData[0]), job.sampleRate, job.bitDepth).arrayBuffer() };
  },
}));

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

afterEach(() => {
  vi.restoreAllMocks();
  invoke.mockReset();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

it('encodes web exports without copying samples into a native payload', async () => {
  invoke.mockRejectedValue(new Error('No native bridge'));
  const samples = new Float32Array([0, 0.5, -0.5]);
  const from = vi.spyOn(Array, 'from');
  const blob = await exportWav(samples, 44100, 16);
  expect(from.mock.calls.some(([input]) => input === samples)).toBe(false);
  expect(invoke).not.toHaveBeenCalled();
  const view = new DataView(await blob.arrayBuffer());
  expect(blob.type).toBe('audio/wav');
  expect(blob.size).toBe(50);
  expect(view.getUint32(24, true)).toBe(44100);
  expect(view.getInt16(44, true)).toBe(0);
  expect(view.getInt16(46, true)).toBe(16384);
  expect(view.getInt16(48, true)).toBe(-16383);
});

it('sends a binary header and only the selected float32 view to native export', async () => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  const bytes = [82, 73, 70, 70];
  invoke.mockResolvedValue(new Uint8Array(bytes).buffer);
  const source = new Float32Array([99, 0, 0.5, 88]);
  const blob = await exportWav(source.subarray(1, 3), 48000, 24);
  expect(invoke).toHaveBeenCalledExactlyOnceWith('export_wav_binary', expect.any(ArrayBuffer));
  const body = new DataView(invoke.mock.calls[0][1]);
  expect(body.byteLength).toBe(16);
  expect(body.getUint32(0, true)).toBe(48000);
  expect(body.getUint16(4, true)).toBe(24);
  expect(body.getUint16(6, true)).toBe(1);
  expect(body.getFloat32(8, true)).toBe(0);
  expect(body.getFloat32(12, true)).toBe(0.5);
  expect(source.byteLength).toBe(16);
  expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual(bytes);
  expect(blob.type).toBe('audio/wav');
});

it('preserves the JS fallback when native encoding fails', async () => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  invoke.mockRejectedValue(new Error('Native encoding failed'));
  const blob = await exportWav(new Float32Array([0.5]), 44100, 32);
  expect(invoke).toHaveBeenCalledTimes(1);
  const view = new DataView(await blob.arrayBuffer());
  expect(view.getUint16(20, true)).toBe(3);
  expect(view.getFloat32(44, true)).toBe(0.5);
});

it('preserves unsupported bit-depth errors on the web', async () => {
  await expect(exportWav(new Float32Array([0]), 44100, 12))
    .rejects.toThrow('Unsupported bit depth: 12');
  expect(invoke).not.toHaveBeenCalled();
});
