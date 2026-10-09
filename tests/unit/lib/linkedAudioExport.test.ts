import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { exportLinkedAudio } from '../../../src/lib/linkedAudioExport';
import { linkedRenderDocument } from '../../../src/lib/projectFile';
import type { TimelineProject } from '../../../src/types/audio';
const document = linkedRenderDocument({ id: 'p', name: 'empty', sampleRate: 48000,
  duration: 1, tracks: [], masterEffects: [] } as TimelineProject, new Map())!;
beforeEach(() => { vi.resetAllMocks(); });
it('saves directly with the chosen bit depth after selecting the destination', async () => {
  vi.mocked(save).mockResolvedValue('/mix.wav'); const stage = vi.fn();
  await expect(exportLinkedAudio(document, 'mix.wav', 'wav', 24, new AbortController().signal, stage)).resolves.toBe(true);
  expect(stage).toHaveBeenCalledExactlyOnceWith('rendering');
  expect(invoke).toHaveBeenCalledExactlyOnceWith('export_linked_project_wav',
    { document, output: '/mix.wav', bitDepth: 24, jobId: expect.any(String) });
});
it('cancelling the save dialog starts no rendering or media job', async () => {
  vi.mocked(save).mockResolvedValue(null); const stage = vi.fn();
  await expect(exportLinkedAudio(document, 'mix.wav', 'wav', 16, new AbortController().signal, stage)).resolves.toBe(false);
  expect(stage).not.toHaveBeenCalled(); expect(invoke).not.toHaveBeenCalled();
});
it('an abort while the save dialog is open prevents a late destination from rendering', async () => {
  const controller = new AbortController();
  vi.mocked(save).mockImplementation(async () => { controller.abort(); return '/mix.wav'; });
  await expect(exportLinkedAudio(document, 'mix.wav', 'wav', 16, controller.signal, vi.fn())).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
});
it('native failure is surfaced without reading back bytes or choosing another mixer', async () => {
  vi.mocked(save).mockResolvedValue('/mix.wav'); vi.mocked(invoke).mockRejectedValueOnce(new Error('Output already exists'));
  await expect(exportLinkedAudio(document, 'mix.wav', 'wav', 32, new AbortController().signal, vi.fn())).rejects.toThrow('already exists');
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('FLAC chooses the native codec with its fixed 24-bit depth rather than the WAV setting', async () => {
  vi.mocked(save).mockResolvedValue('/mix.flac');
  await exportLinkedAudio(document, 'mix.flac', 'flac', 8, new AbortController().signal, vi.fn());
  expect(invoke).toHaveBeenCalledExactlyOnceWith('export_linked_project_flac',
    { document, output: '/mix.flac', jobId: expect.any(String) });
});

it('AAC preserves its ADTS extension and forwards the selected bitrate', async () => {
  vi.mocked(save).mockResolvedValue('/mix.aac');
  await exportLinkedAudio(document, 'mix.aac', 'aac', 24, new AbortController().signal, vi.fn(), 256);
  expect(invoke).toHaveBeenCalledExactlyOnceWith('export_linked_project_aac',
    { document, output: '/mix.aac', bitrateKbps: 256, jobId: expect.any(String) });
  expect(save).toHaveBeenCalledWith({ defaultPath: 'mix.aac', filters: [{ name: 'AAC Audio', extensions: ['aac'] }] });
});
