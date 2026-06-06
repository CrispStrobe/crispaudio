// ---------------------------------------------------------------------------
// projectIO — save/open a project JSON via native Tauri dialogs (with browser
// fallbacks for dev/preview). The actual file read/write goes through the Rust
// save_project / load_project commands.
// ---------------------------------------------------------------------------

import { save, open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

const FILTERS = [{ name: 'CrispAudio Project', extensions: ['json'] }];

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Prompt for a location and write `json`. Returns false if the user cancels. */
export async function saveProjectFile(
  json: string,
  defaultName: string,
): Promise<boolean> {
  if (isTauri()) {
    try {
      const path = await save({
        defaultPath: `${defaultName}.crispaudio.json`,
        filters: FILTERS,
      });
      if (!path) return false;
      await invoke('save_project', { path, data: json });
      return true;
    } catch (err) {
      console.error('Failed to save project:', err);
      return false;
    }
  }

  // Browser fallback: trigger a download.
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${defaultName}.crispaudio.json`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

/** Prompt for a project file and return its contents (null if cancelled). */
export async function openProjectFile(): Promise<string | null> {
  if (isTauri()) {
    try {
      const selected = await open({ multiple: false, filters: FILTERS });
      if (!selected || typeof selected !== 'string') return null;
      return invoke<string>('load_project', { path: selected });
    } catch (err) {
      console.error('Failed to open project:', err);
      return null;
    }
  }

  // Browser fallback: hidden file input.
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then(resolve).catch(() => resolve(null));
    };
    input.click();
  });
}
