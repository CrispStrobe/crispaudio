import type { CodecJob, CodecRequest, CodecResponse, CodecResult } from './codecProtocol';

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, {
  resolve: (value: CodecResult) => void;
  reject: (error: Error) => void;
}>();

function getWorker(): Worker {
  if (worker) return worker;
  const instance = new Worker(new URL('./codec.worker.ts', import.meta.url), { type: 'module' });
  worker = instance;
  const fail = (error: Error) => {
    if (worker !== instance) return;
    worker = null;
    instance.terminate();
    instance.onmessage = null;
    instance.onerror = null;
    instance.onmessageerror = null;
    for (const job of pending.values()) job.reject(error);
    pending.clear();
  };
  instance.onerror = (event) => {
    event.preventDefault();
    fail(new Error(event.message || 'Codec worker failed'));
  };
  instance.onmessageerror = () => fail(new Error('Codec worker response could not be read'));
  instance.onmessage = ({ data }: MessageEvent<CodecResponse>) => {
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    if (data.type === 'error') job.reject(new Error(data.message));
    else job.resolve(data);
  };
  return instance;
}

// Cancellable jobs use an exclusive worker: terminating synchronous WASM must
// never abort an unrelated decode/export. Retain at most one idle instance.
let idleCancellableWorker: Worker | null = null;
function runCancellable(job: CodecJob, transfer: Transferable[], signal: AbortSignal): Promise<CodecResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Export cancelled', 'AbortError')); return; }
    const instance = idleCancellableWorker ?? new Worker(new URL('./codec.worker.ts', import.meta.url), { type: 'module' });
    idleCancellableWorker = null;
    const id = nextId++;
    let settled = false;
    const finish = (error?: Error, result?: CodecResult, reusable = false) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      instance.onmessage = null;
      instance.onerror = null;
      instance.onmessageerror = null;
      if (reusable && !idleCancellableWorker) idleCancellableWorker = instance;
      else instance.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const abort = () => finish(new DOMException('Export cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    instance.onerror = event => { event.preventDefault(); finish(new Error(event.message || 'Codec worker failed')); };
    instance.onmessageerror = () => finish(new Error('Codec worker response could not be read'));
    instance.onmessage = ({ data }: MessageEvent<CodecResponse>) => {
      if (data.id !== id) return;
      if (data.type === 'error') finish(new Error(data.message), undefined, true);
      else finish(undefined, data, true);
    };
    try { instance.postMessage({ ...job, id } satisfies CodecRequest, transfer); }
    catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
  });
}

export function runCodec(job: CodecJob, transfer: Transferable[], signal?: AbortSignal): Promise<CodecResult> {
  if (signal) return runCancellable(job, transfer, signal);
  return new Promise((resolve, reject) => {
    const instance = getWorker();
    const id = nextId++;
    pending.set(id, { resolve, reject });
    try {
      const request: CodecRequest = { ...job, id };
      instance.postMessage(request, transfer);
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}
