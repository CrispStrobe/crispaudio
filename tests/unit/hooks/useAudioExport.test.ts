import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAudioExport } from '../../../src/hooks/useAudioExport';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('uses weak object-key retention and treats a collected key as a miss', async () => {
  const { result } = renderHook(() => useAudioExport());
  const source = new Float32Array([1]);
  const project = { sources: new Map([['source', source]]) };
  const produce = vi.fn(async () => new Blob(['encoded']));
  const request = { key: [project, project.sources, source], stage: 'encoding' as const, produce, save: async () => {} };
  await act(async () => { await result.current.start(request); });
  const deref = vi.spyOn(WeakRef.prototype, 'deref');
  await act(async () => { await result.current.start(request); });
  expect(produce).toHaveBeenCalledTimes(1);
  expect(deref.mock.results.map(call => call.value)).toEqual(request.key);
  // Simulate collection, without relying on GC timing or finalizers.
  deref.mockReturnValue(undefined);
  await act(async () => { await result.current.start(request); });
  expect(produce).toHaveBeenCalledTimes(2);
});

it('retains at most 16 MiB and saves oversized results without caching them', async () => {
  const { result } = renderHook(() => useAudioExport());
  const limit = 16 * 1024 * 1024;
  // Report boundary sizes without allocating tens of megabytes in a unit test.
  const boundary = new Blob(['boundary']);
  const oversized = new Blob(['oversized']);
  vi.spyOn(boundary, 'size', 'get').mockReturnValue(limit);
  vi.spyOn(oversized, 'size', 'get').mockReturnValue(limit + 1);
  const produce = vi.fn().mockResolvedValue(boundary);
  const save = vi.fn(async () => {});
  const run = async (key: string) => {
    await act(async () => { expect(await result.current.start({ key: [key], stage: 'encoding', produce, save })).toBe(true); });
  };
  await run('small');
  await run('small');
  expect(produce).toHaveBeenCalledTimes(1);
  produce.mockResolvedValue(oversized);
  await run('large');
  await run('large');
  expect(produce).toHaveBeenCalledTimes(3);
  expect(save).toHaveBeenLastCalledWith(oversized);
  // The oversized success also evicts the previous result: there is no fallback entry.
  produce.mockResolvedValue(boundary);
  await run('small');
  expect(produce).toHaveBeenCalledTimes(4);
  expect(save).toHaveBeenCalledTimes(5);
});

it('ends rendering/encoding progress before opening the existing save UI', async () => {
  const { result } = renderHook(() => useAudioExport());
  const saving = deferred<void>();
  let run!: Promise<boolean>;
  await act(async () => {
    run = result.current.start({ key: [], stage: 'encoding', produce: async () => new Blob(), save: () => saving.promise });
  });
  expect(result.current.stage).toBeNull();
  await act(async () => { saving.resolve(); await run; });
});

it('reports failures without caching them and clears the error on retry', async () => {
  const { result } = renderHook(() => useAudioExport());
  const produce = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValue(new Blob());
  const save = vi.fn(async () => {});
  const request = { key: [{}], stage: 'encoding' as const, produce, save };
  await act(async () => { expect(await result.current.start(request)).toBe(false); });
  expect(result.current.error).toBeInstanceOf(Error);
  expect(save).not.toHaveBeenCalled();
  await act(async () => { expect(await result.current.start(request)).toBe(true); });
  expect(result.current.error).toBeNull();
  expect(produce).toHaveBeenCalledTimes(2);
});

it('silences aborted rejection and never caches the aborted result', async () => {
  const { result } = renderHook(() => useAudioExport());
  const pending = deferred<Blob>();
  const produce = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(new Blob());
  const save = vi.fn(async () => {});
  const request = { key: [{}], stage: 'encoding' as const, produce, save };
  let run!: Promise<boolean>;
  act(() => { run = result.current.start(request); result.current.cancel(); });
  await act(async () => { pending.reject(new DOMException('Cancelled', 'AbortError')); expect(await run).toBe(false); });
  expect(result.current.error).toBeNull();
  await act(async () => { await result.current.start(request); });
  expect(produce).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenCalledTimes(1);
});

it('aborts on unmount and ignores completion after cleanup', async () => {
  const { result, unmount } = renderHook(() => useAudioExport());
  const pending = deferred<Blob>();
  const save = vi.fn(async () => {});
  let signal!: AbortSignal;
  let run!: Promise<boolean>;
  act(() => { run = result.current.start({ key: [], stage: 'encoding', produce: s => { signal = s; return pending.promise; }, save }); });
  unmount();
  expect(signal.aborted).toBe(true);
  pending.resolve(new Blob());
  expect(await run).toBe(false);
  expect(save).not.toHaveBeenCalled();
});

it('keeps only the last successful blob keyed by immutable source identity and every setting', async () => {
  const { result } = renderHook(() => useAudioExport());
  const source = new Float32Array([1]);
  const key = [source, 44100, 16, 'wav', 128];
  const produce = vi.fn(async () => new Blob(['encoded']));
  const save = vi.fn(async () => {});
  const run = async (next: unknown[]) => { await act(async () => { await result.current.start({ key: next, stage: 'encoding', produce, save }); }); };
  await run(key);
  await run([...key]);
  expect(produce).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0]).toEqual(save.mock.calls[1]);
  for (let index = 0; index < key.length; index++) {
    const changed = [...key];
    changed[index] = index === 0 ? new Float32Array([1]) : `changed-${index}`;
    await run(changed);
    await run(key);
  }
  expect(produce).toHaveBeenCalledTimes(11);
});

it('cancels encoding and prevents a late completion from saving or resetting a restarted job', async () => {
  const { result } = renderHook(() => useAudioExport());
  const old = deferred<Blob>();
  const next = deferred<Blob>();
  const save = vi.fn(async () => {});
  let oldSignal!: AbortSignal;
  let oldRun!: Promise<boolean>;
  act(() => {
    oldRun = result.current.start({ key: [{}], stage: 'encoding', produce: signal => { oldSignal = signal; return old.promise; }, save });
  });
  expect(result.current.stage).toBe('encoding');
  act(() => result.current.cancel());
  expect(oldSignal.aborted).toBe(true);
  expect(result.current.stage).toBeNull();
  let nextRun!: Promise<boolean>;
  act(() => { nextRun = result.current.start({ key: [{}], stage: 'rendering', produce: () => next.promise, save }); });
  await act(async () => { old.resolve(new Blob(['old'])); expect(await oldRun).toBe(false); });
  expect(result.current.stage).toBe('rendering');
  expect(save).not.toHaveBeenCalled();
  const blob = new Blob(['new']);
  await act(async () => { next.resolve(blob); expect(await nextRun).toBe(true); });
  expect(save).toHaveBeenCalledExactlyOnceWith(blob);
  expect(result.current.stage).toBeNull();
});
