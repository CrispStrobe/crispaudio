import { save } from '@tauri-apps/plugin-dialog';
import { mediaJob } from './mediaJob';
import type { linkedRenderDocument } from './projectFile';
import type { AudioExportStage } from '../hooks/useAudioExport';

/** The native save dialog precedes rendering; no Blob or audio cache is created. */
export async function exportLinkedWav(document: NonNullable<ReturnType<typeof linkedRenderDocument>>,
  filename: string, bitDepth: number, signal: AbortSignal,
  setStage: (stage: AudioExportStage | null) => void): Promise<boolean> {
  signal.throwIfAborted();
  const output = await save({ defaultPath: filename, filters: [{ name: 'WAV Audio', extensions: ['wav'] }] });
  signal.throwIfAborted();
  if (!output) return false;
  setStage('rendering');
  await mediaJob('export_linked_project_wav', { document, output, bitDepth }, signal);
  return true;
}
