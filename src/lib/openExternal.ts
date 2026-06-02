// ---------------------------------------------------------------------------
// openExternal — open a URL in the user's default browser.
// Uses the Tauri opener plugin when running inside the app; falls back to
// window.open in a plain browser (dev/preview).
// ---------------------------------------------------------------------------

import { openUrl } from '@tauri-apps/plugin-opener';

export async function openExternal(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
