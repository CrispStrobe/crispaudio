import { useCallback, useEffect, useRef, useState } from 'react';

export type AudioExportStage = 'rendering' | 'encoding';
interface ExportRequest {
  key: readonly unknown[];
  stage: AudioExportStage;
  produce: (signal: AbortSignal, setStage: (stage: AudioExportStage) => void) => Promise<Blob>;
  save: (blob: Blob) => Promise<unknown>;
}

/** Owns an export job; only its current, non-aborted result may open a save UI. */
export function useAudioExport() {
  const [stage, setStage] = useState<AudioExportStage | null>(null);
  const [error, setError] = useState<unknown>(null);
  const active = useRef<AbortController | null>(null);
  const cache = useRef<{ key: readonly unknown[]; blob: Blob } | null>(null);
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
      const hit = cached && cached.key.length === request.key.length && cached.key.every((value, index) => Object.is(value, request.key[index]));
      const blob = hit ? cached.blob : await request.produce(controller.signal, next => { if (current()) setStage(next); });
      if (!current()) return false;
      cache.current = { key: [...request.key], blob };
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
