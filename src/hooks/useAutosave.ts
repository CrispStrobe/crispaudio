// ---------------------------------------------------------------------------
// useAutosave — periodically saves timeline project structure to localStorage.
// Audio buffers are NOT saved (too large); only track/segment layout is stored
// so the user's arrangement survives accidental page reloads.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react';
import { useProjectStore } from '../stores/projectStore';

const AUTOSAVE_KEY = 'crispaudio-autosave';
const AUTOSAVE_INTERVAL_MS = 30_000; // 30 seconds

interface AutosaveData {
  savedAt: string;
  project: ReturnType<typeof useProjectStore.getState>['project'];
}

export function useAutosave() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const save = () => {
      const { project } = useProjectStore.getState();
      // Only save if there are tracks with segments (non-empty project)
      const hasContent = project.tracks.some((t) => t.segments.length > 0);
      if (!hasContent) return;

      const data: AutosaveData = {
        savedAt: new Date().toISOString(),
        project,
      };
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
      } catch {
        // localStorage full or unavailable — silently ignore
      }
    };

    timerRef.current = setInterval(save, AUTOSAVE_INTERVAL_MS);

    // Also save on beforeunload
    const handleUnload = () => save();
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);
}

/** Check if there's an autosaved project and return its metadata. */
export function getAutosaveInfo(): { savedAt: string } | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const data: AutosaveData = JSON.parse(raw);
    return { savedAt: data.savedAt };
  } catch {
    return null;
  }
}

/** Restore the autosaved project structure (without audio buffers). */
export function restoreAutosave(): boolean {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    const data: AutosaveData = JSON.parse(raw);
    useProjectStore.getState().loadProjectState(data.project, new Map());
    return true;
  } catch {
    return false;
  }
}

/** Clear the autosave slot. */
export function clearAutosave(): void {
  localStorage.removeItem(AUTOSAVE_KEY);
}
