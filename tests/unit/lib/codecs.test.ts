import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Detach transferables exactly as the browser does, while controlling replies.
class ControlledWorker {
  static instances: ControlledWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  requests: Record<string, unknown>[] = [];
  terminate = vi.fn();
  constructor(public url: URL, public options: WorkerOptions) {
    ControlledWorker.instances.push(this);
  }
  postMessage(message: Record<string, unknown>, transfer: Transferable[]) {
    this.requests.push(structuredClone(message, { transfer }));
  }
  reply(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
}

beforeEach(() => {
  vi.resetModules();
  ControlledWorker.instances = [];
  vi.stubGlobal('Worker', ControlledWorker);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('routes mono WAV encoding through the worker with an owned copy', async () => {
  const { exportWav } = await import('../../../src/lib/wavExport');
  const samples = new Float32Array([99, 0.25, -0.5, 88]);
  const result = exportWav(samples.subarray(1, 3), 48000, 32);
  expect(ControlledWorker.instances).toHaveLength(1);
  const worker = ControlledWorker.instances[0];
  const request = worker.requests[0];
  expect(request).toMatchObject({ type: 'wav', sampleRate: 48000, bitDepth: 32, mode: 'mono-float' });
  expect(new Float32Array((request.channelData as ArrayBuffer[])[0])).toEqual(new Float32Array([0.25, -0.5]));
  expect(samples.byteLength).toBe(16);
  worker.reply({ id: request.id, type: 'encoded', bytes: new ArrayBuffer(44) });
  expect((await result).type).toBe('audio/wav');
});

it('aborts a cancellable encode without disrupting unrelated jobs', async () => {
  const { encodeMono } = await import('../../../src/lib/codecs');
  const controller = new AbortController();
  const input = new Float32Array([0.5]);
  const cancelled = encodeMono(input, 48000, 'mp3', 192, controller.signal);
  const rejection = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
  const activeWorker = ControlledWorker.instances[0];
  const unrelated = encodeMono(input, 48000, 'mp3');
  controller.abort();
  await rejection;
  expect(activeWorker.terminate).toHaveBeenCalledTimes(1);
  expect(input.byteLength).toBe(4);
  const otherWorker = ControlledWorker.instances[1];
  otherWorker.reply({ id: otherWorker.requests[0].id, type: 'encoded', bytes: new ArrayBuffer(0) });
  await expect(unrelated).resolves.toBeInstanceOf(Blob);
});

it('does not start or copy a pre-aborted encode', async () => {
  const { encodeMono } = await import('../../../src/lib/codecs');
  const controller = new AbortController();
  controller.abort();
  await expect(encodeMono(new Float32Array([0]), 48000, 'mp3', 192, controller.signal))
    .rejects.toMatchObject({ name: 'AbortError' });
  expect(ControlledWorker.instances).toHaveLength(0);
});

it('reuses one worker and correlates concurrent decode/encode replies', async () => {
  const { encodeMono, decodeCompressed } = await import('../../../src/lib/codecs');
  const encoded = encodeMono(new Float32Array([0]), 48000, 'opus');
  const input = new Uint8Array([99, 1, 2, 88]);
  const decoded = decodeCompressed(input.subarray(1, 3));
  expect(ControlledWorker.instances).toHaveLength(1);
  const worker = ControlledWorker.instances[0];
  const [a, b] = worker.requests;
  expect(new Uint8Array(b.bytes as ArrayBuffer)).toEqual(new Uint8Array([1, 2]));
  expect(input.byteLength).toBe(4);
  worker.reply({ id: b.id, type: 'decoded', channelData: [new Float32Array([0.5]).buffer], sampleRate: 48000 });
  expect((await decoded).channelData[0][0]).toBe(0.5);
  worker.reply({ id: a.id, type: 'encoded', bytes: new ArrayBuffer(0) });
  expect((await encoded).type).toBe('audio/ogg');
});

it.each(['onerror', 'onmessageerror'] as const)('rejects pending jobs on %s and restarts on the next call', async event => {
  const { encodeMono } = await import('../../../src/lib/codecs');
  const first = encodeMono(new Float32Array([0]), 48000, 'mp3');
  const second = encodeMono(new Float32Array([0]), 48000, 'aac');
  const failures = Promise.allSettled([first, second]);
  const worker = ControlledWorker.instances[0];
  if (event === 'onerror') worker.onerror?.({ message: 'crashed', preventDefault: vi.fn() } as unknown as ErrorEvent);
  else worker.onmessageerror?.({} as MessageEvent);
  expect((await failures).map(result => result.status)).toEqual(['rejected', 'rejected']);
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  const next = encodeMono(new Float32Array([0]), 48000, 'mp3');
  expect(ControlledWorker.instances).toHaveLength(2);
  const replacement = ControlledWorker.instances[1];
  replacement.reply({ id: replacement.requests[0].id, type: 'encoded', bytes: new ArrayBuffer(0) });
  await expect(next).resolves.toBeInstanceOf(Blob);
});

it('rejects a codec failure without terminating the reusable worker', async () => {
  const { decodeCompressed } = await import('../../../src/lib/codecs');
  const first = decodeCompressed(new Uint8Array([0]));
  const failure = expect(first).rejects.toThrow('bad input');
  const worker = ControlledWorker.instances[0];
  worker.reply({ id: worker.requests[0].id, type: 'error', message: 'bad input' });
  await failure;
  const next = decodeCompressed(new Uint8Array([1]));
  worker.reply({ id: worker.requests[1].id, type: 'decoded', channelData: [], sampleRate: 48000 });
  await expect(next).resolves.toEqual({ channelData: [], sampleRate: 48000 });
  expect(worker.terminate).not.toHaveBeenCalled();
});

it('rejects postMessage failure without poisoning later requests', async () => {
  const { encodeMono } = await import('../../../src/lib/codecs');
  vi.spyOn(ControlledWorker.prototype, 'postMessage').mockImplementationOnce(() => { throw new Error('clone failed'); });
  await expect(encodeMono(new Float32Array([0]), 48000, 'mp3')).rejects.toThrow('clone failed');
  const next = encodeMono(new Float32Array([0]), 48000, 'mp3');
  const worker = ControlledWorker.instances[0];
  worker.reply({ id: worker.requests[0].id, type: 'encoded', bytes: new ArrayBuffer(0) });
  await expect(next).resolves.toBeInstanceOf(Blob);
});

it('rejects clearly when Worker is unavailable', async () => {
  vi.stubGlobal('Worker', undefined);
  const { encodeMono } = await import('../../../src/lib/codecs');
  await expect(encodeMono(new Float32Array([0]), 48000, 'mp3')).rejects.toThrow();
});


it('encodes via a module worker without detaching the exact caller PCM view', async () => {
  const { encodeCompressed } = await import('../../../src/lib/codecs');
  const original = new Float32Array([99, 0.25, -0.5, 88]);
  const promise = encodeCompressed(original.subarray(1, 3), 2, 44100, 'mp3');
  expect(ControlledWorker.instances).toHaveLength(1);
  const worker = ControlledWorker.instances[0];
  expect(worker.url.pathname).toMatch(/codec\.worker\.ts$/);
  expect(worker.options).toEqual({ type: 'module' });
  const request = worker.requests[0];
  expect(request).toMatchObject({ type: 'encode', channels: 2, sampleRate: 44100, format: 'mp3', bitrateKbps: 192 });
  expect(Array.from(new Float32Array(request.pcm as ArrayBuffer))).toEqual([0.25, -0.5]);
  expect(original).toEqual(new Float32Array([99, 0.25, -0.5, 88]));
  worker.reply({ id: request.id, type: 'encoded', bytes: new Uint8Array([1, 2, 3]).buffer });
  const blob = await promise;
  expect(blob.type).toBe('audio/mpeg');
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
});
