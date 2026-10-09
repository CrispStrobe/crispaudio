import { invoke } from '@tauri-apps/api/core';
import { remove } from '@tauri-apps/plugin-fs';
import type { AudioSource, TimelineProject } from '../types/audio';
import type { TimelineEngine } from '../audio/engine/TimelineEngine';
import { linkedRenderDocument } from './projectFile';
import { videoClips } from './videoEditing';
import { timelineDuration } from './timelineView';
import { mediaJob } from './mediaJob';
import { encodeAudioBufferWav } from './wavExport';

interface ExportOptions {
  project: TimelineProject;
  sources: Map<string, AudioSource>;
  engine: TimelineEngine | null;
  output: string;
  backend: string;
  format: string;
  nativeMac: boolean;
}

/** A stable project snapshot is passed by the caller before starting the job. */
export async function exportVideoProject(options: ExportOptions, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const { project, sources, output, backend, format, engine } = options;
  if (!project.video) throw new Error('Project has no video');
  const start = project.video.inPoint ?? 0;
  const end = project.video.outPoint ?? timelineDuration(project);
  const edit = { path: project.video.path, sources: project.video.sources,
    frameRate: project.frameRate, duration: Math.max(project.duration, timelineDuration(project)),
    clips: videoClips(project.video), backend, outputFormat: format };
  const document = options.nativeMac ? linkedRenderDocument(project, sources) : null;
  if (document) {
    // Strict native audio: failures remain visible; never silently switch mixers.
    await mediaJob('export_linked_project_video', { document, edit, output, start, end }, signal);
    return;
  }
  if (!engine) throw new Error('Audio engine is unavailable');
  const rendered = await engine.renderToBuffer(project, start, end, signal);
  const wav = await encodeAudioBufferWav(rendered, 24, signal);
  signal.throwIfAborted();
  const mix = await invoke<string>('stage_share_file', new Uint8Array(await wav.arrayBuffer()), {
    headers: { 'x-file-name': `video-mix-${crypto.randomUUID()}.wav` },
  });
  try {
    signal.throwIfAborted();
    await mediaJob('export_video_edit', { edit, output, mix, start, end }, signal);
  } finally { await remove(mix).catch(() => {}); }
}
