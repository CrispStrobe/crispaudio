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

export function runCodec(job: CodecJob, transfer: Transferable[]): Promise<CodecResult> {
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
