// ---------------------------------------------------------------------------
// native — bridge to CrispAudio's native iOS integrations (the
// `crispaudio-native` Tauri plugin, Swift) and to files opened from other
// apps. Every helper is a safe no-op outside the iOS app, so call sites need
// no platform checks of their own.
// ---------------------------------------------------------------------------

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** True inside the native iOS/iPadOS app (not Safari, not desktop). */
export function isIOSApp(): boolean {
  if (!isTauri() || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS reports a desktop Macintosh UA; touch support tells them apart.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(`plugin:crispaudio-native|${command}`, args);
}

// --- Share sheet ----------------------------------------------------------

/**
 * Hand a file to the iOS share sheet (Save to Files, AirDrop, Messages, …).
 * Resolves true when the user completed an action, false when dismissed.
 */
export async function shareFile(blob: Blob, filename: string): Promise<boolean> {
  const { invoke } = await import('@tauri-apps/api/core');
  const safeName = filename.replace(/[^A-Za-z0-9._ -]/g, '_');
  const path = await invoke<string>('stage_share_file', new Uint8Array(await blob.arrayBuffer()), {
    headers: { 'x-file-name': safeName },
  });
  const { completed } = await invokeNative<{ completed: boolean }>('shareFile', { path });
  return completed;
}

// --- Haptics --------------------------------------------------------------

export type HapticStyle = 'light' | 'medium' | 'selection' | 'success' | 'warning' | 'error';

/** Fire-and-forget tactile feedback; does nothing off iOS. */
export function haptic(style: HapticStyle): void {
  if (!isIOSApp()) return;
  invokeNative('haptic', { style }).catch(() => {});
}

// --- Audio session --------------------------------------------------------

/**
 * WebKit plays Web Audio in the "ambient" session by default, which the
 * ring/silent switch mutes. An audio tool should behave like a media player,
 * so opt into "playback" where the Audio Session API exists (iOS 16.4+).
 */
export function setAudioSessionType(type: 'playback' | 'play-and-record'): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (isIOSApp() && session) session.type = type;
}

// --- Files opened from other apps ----------------------------------------

export interface OpenedFile {
  filePath?: string;
  name: string;
  bytes: ArrayBuffer;
}

/**
 * Deliver files opened with CrispAudio ("Open in…", Files, AirDrop, Finder)
 * to `onFiles`: those queued before the UI started, then any that arrive
 * while it runs. Returns an unsubscribe function.
 */
export async function subscribeOpenedFiles(
  onFiles: (files: OpenedFile[]) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');

  const drain = async () => {
    const paths = await invoke<string[]>('take_opened_files');
    const files: OpenedFile[] = [];
    for (const path of paths) {
      try {
        const video=!isIOSApp()&&/\.(mp4|mov|m4v|mkv|webm|avi|ogv|mpeg|mpg)$/i.test(path);
        const bytes = await invoke<ArrayBuffer>('read_opened_file', video?{path,pathOnly:true}:{path});
        files.push({ name: path.split(/[\\/]/).pop() || 'audio', bytes, ...(!isIOSApp()?{filePath:path}:{}) });
      } catch (err) {
        console.error(`Failed to read opened file ${path}:`, err);
      }
    }
    if (files.length > 0) onFiles(files);
  };

  const unlisten = await listen('opened-files', () => {
    drain().catch((err) => console.error('Opening files failed:', err));
  });
  await drain();
  return unlisten;
}
