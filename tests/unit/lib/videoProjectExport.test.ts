import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioSource, TimelineProject } from '../../../src/types/audio';
import type { TimelineEngine } from '../../../src/audio/engine/TimelineEngine';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ remove: vi.fn() }));
vi.mock('../../../src/lib/wavExport', () => ({ encodeAudioBufferWav: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
import { remove } from '@tauri-apps/plugin-fs';
import { encodeAudioBufferWav } from '../../../src/lib/wavExport';
import { linkedRenderDocument } from '../../../src/lib/projectFile';
import { exportVideoProject } from '../../../src/lib/videoProjectExport';

function fixture() {
  const project = { id: 'p', name: 'interview', sampleRate: 48000, duration: 4, masterEffects: [],
    tracks: [{ id: 't', volume: 1, pan: 0, muted: false, solo: false,
      segments: [{ sourceId: 's', startTime: 0, duration: 4 }] }],
    video: { path: '/picture.mp4', duration: 4, inPoint: 1, outPoint: 3 },
  } as TimelineProject;
  const source = { id: 's', name: 'mic', filePath: '/mic.wav', duration: 4, channels: 1, sampleRate: 48000,
    buffer: { getChannelData: () => { throw new Error('Must not read PCM'); } } } as AudioSource;
  const sources = new Map([['s', source]]);
  const renderToBuffer = vi.fn();
  const engine = { renderToBuffer } as unknown as TimelineEngine;
  const options = { project, sources, engine, output: '/export.mp4', backend: 'apple', format: 'mp4', nativeMac: true };
  return { project, source, sources, renderToBuffer, options };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(remove).mockResolvedValue(undefined);
});
describe('linked desktop video export', () => {
  it('sends only paths and the complete clock to the native mixer, retaining the selected section', async () => {
    const { options, renderToBuffer } = fixture();
    await exportVideoProject(options, new AbortController().signal);
    expect(renderToBuffer).not.toHaveBeenCalled();
    expect(encodeAudioBufferWav).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledExactlyOnceWith('export_linked_project_video', expect.objectContaining({
      document: expect.objectContaining({ sources: [expect.objectContaining({ path: '/mic.wav' })],
        project: expect.objectContaining({ duration: 4 }) }), start: 1, end: 3, jobId: expect.any(String),
    }));
  });
  it('does not silently fall back after a native render failure', async () => {
    const { options, renderToBuffer } = fixture();
    vi.mocked(invoke).mockRejectedValueOnce(new Error('DSP budget exceeded'));
    await expect(exportVideoProject(options, new AbortController().signal)).rejects.toThrow('DSP budget');
    expect(renderToBuffer).not.toHaveBeenCalled();
  });
  it('ignores a muted in-memory source, but honors solo even while its mute is stored', () => {
    const { project, sources } = fixture();
    project.tracks.push({ ...project.tracks[0], id: 'memory', muted: true, segments: [{ sourceId: 'memory', startTime: 0, duration: 4 }] } as TimelineProject['tracks'][number]);
    expect(linkedRenderDocument(project, sources)?.sources).toHaveLength(1);
    project.tracks[1].solo = true;
    expect(linkedRenderDocument(project, sources)).toBeNull();
  });
  it('uses Web Audio for in-memory sources and removes its staged mix on export failure', async () => {
    const { source, options, renderToBuffer } = fixture();
    source.filePath = undefined;
    renderToBuffer.mockResolvedValue({});
    vi.mocked(encodeAudioBufferWav).mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) } as Blob);
    vi.mocked(invoke).mockResolvedValueOnce('/temp/mix.wav').mockRejectedValueOnce(new Error('Picture failed'));
    await expect(exportVideoProject(options, new AbortController().signal)).rejects.toThrow('Picture failed');
    expect(renderToBuffer).toHaveBeenCalledWith(options.project, 1, 3, expect.any(AbortSignal));
    expect(remove).toHaveBeenCalledWith('/temp/mix.wav');
  });
  it('rejects pre-cancelled work without invoking or reading any audio', async () => {
    const { options } = fixture(); const controller = new AbortController(); controller.abort();
    await expect(exportVideoProject(options, controller.signal)).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
  it('cancels the active native job and surfaces the cancellation', async () => {
    const { options } = fixture(); const controller = new AbortController();
    let finish!: () => void;
    vi.mocked(invoke).mockImplementation((command) => command === 'cancel_media_job'
      ? Promise.resolve(true) : new Promise<void>(resolve => { finish = resolve; }));
    const work = exportVideoProject(options, controller.signal);
    controller.abort(); finish();
    await expect(work).rejects.toThrow();
    expect(invoke).toHaveBeenCalledWith('cancel_media_job', { jobId: expect.any(String) });
  });
  it('keeps other render rates and multichannel sources in Web Audio', () => {
    const { project, source, sources } = fixture();
    project.sampleRate = 44100; expect(linkedRenderDocument(project, sources)).toBeNull();
    project.sampleRate = 48000; source.channels = 6; expect(linkedRenderDocument(project, sources)).toBeNull();
  });
});
