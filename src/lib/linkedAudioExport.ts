import { save } from '@tauri-apps/plugin-dialog';
import { mediaJob } from './mediaJob';
import type { linkedRenderDocument } from './projectFile';
import type { AudioExportStage } from '../hooks/useAudioExport';

/** The native save dialog precedes rendering; no Blob or audio cache is created. */
export async function exportLinkedAudio(document: NonNullable<ReturnType<typeof linkedRenderDocument>>,
  filename: string, format: 'wav' | 'flac' | 'aac', bitDepth: number, signal: AbortSignal,
  setStage: (stage: AudioExportStage | null) => void, bitrateKbps = 192): Promise<boolean> {
  signal.throwIfAborted();
  const output = await save({ defaultPath: filename, filters: [{ name: `${format.toUpperCase()} Audio`, extensions: [format] }] });
  signal.throwIfAborted();
  if (!output) return false;
  setStage('rendering');
  await mediaJob(`export_linked_project_${format}`,
    { document, output, ...(format === 'wav' ? { bitDepth } : format === 'aac' ? { bitrateKbps } : {}) }, signal);
  return true;
}
