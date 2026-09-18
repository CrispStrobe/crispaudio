import { useCallback, useEffect, useRef, useState } from 'react';

export type AudioExportStage = 'rendering' | 'encoding';
interface ExportRequest {
  key: readonly unknown[];
  stage: AudioExportStage;
  produce: (signal: AbortSignal, setStage: (stage: AudioExportStage) => void) => Promise<Blob>;
  save: (blob: Blob) => Promise<unknown>;
}

type CacheKeyPart = { weak: WeakRef<object> } | { value: unknown };

/** One retained result only; larger results save without being retained. */
const MAX_CACHE_BYTES = 16 * 1024 * 1024;

// Never pin a project, source map, AudioBuffer, or callback through the key.
function retainKey(key: readonly unknown[]): CacheKeyPart[] {
  return key.map(value =>
    (typeof value === 'object' && value !== null) || typeof value === 'function'
      ? { weak: new WeakRef(value) }
      : { value });
}

function matchesKey(cached: readonly CacheKeyPart[], key: readonly unknown[]): boolean {
  return cached.length === key.length && cached.every((part, index) => {
    if ('weak' in part) {
      const value = part.weak.deref();
      return value !== undefined && Object.is(value, key[index]);
    }
    return Object.is(part.value, key[index]);
  });
}

/** Owns an export job; only its current, non-aborted result may open a save UI. */
export function useAudioExport() {
  const [stage, setStage] = useState<AudioExportStage | null>(null);
  const [error, setError] = useState<unknown>(null);
  const active = useRef<AbortController | null>(null);
  const cache = useRef<{ key: readonly CacheKeyPart[]; blob: Blob } | null>(null);
  useEffect(() => () => {
    active.current?.abort();
    active.current = null;
    cache.current = null;
  }, []);
  const cancel = useCallback(() => {
    active.current?.abort();
    active.current = null;
    setStage(null);
  }, []);
  const start = useCallback(async (request: ExportRequest): Promise<boolean> => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const current = () => active.current === controller && !controller.signal.aborted;
    setError(null);
    setStage(request.stage);
    try {
      const cached = cache.current;
      const hit = cached && matchesKey(cached.key, request.key);
      const blob = hit ? cached.blob : await request.produce(controller.signal, next => { if (current()) setStage(next); });
      if (!current()) return false;
      // A retained result must not pin more than the cache budget. An oversized
      // success still saves, but evicts rather than occupying the single slot.
      cache.current = blob.size > MAX_CACHE_BYTES ? null : { key: retainKey(request.key), blob };
      // Encoding has finished. A native save/share dialog owns cancellation
      // from this point; do not claim it is still rendering or encoding.
      setStage(null);
      await request.save(blob);
      return current();
    } catch (failure) {
      if (current()) setError(failure);
      return false;
    } finally {
      if (current()) { active.current = null; setStage(null); }
    }
  }, []);
  return { stage, error, start, cancel };
}
