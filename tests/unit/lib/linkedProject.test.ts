import { afterEach, describe, expect, it, vi } from 'vitest';
import { serializeProject, deserializeProject } from '../../../src/lib/projectFile';
import type { AudioSource, TimelineProject } from '../../../src/types/audio';

vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: vi.fn(async () => { throw new Error('File not found'); }) }));

const project: TimelineProject = { id: 'interview', name: 'Interview', sampleRate: 48000,
  bitDepth: 24, duration: 10, tracks: [], masterEffects: [] };

afterEach(() => { delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__; });

describe('linked interview projects', () => {
  it('saves media references and provenance without encoding audio', () => {
    const source: AudioSource = { id: 'source', name: 'Room', sampleRate: 48000,
      channels: 2, duration: 10, buffer: {} as AudioBuffer,
      peaks: { min: new Float32Array(), max: new Float32Array() },
      filePath: '/interview/aligned.wav', provenance: { path: '/original.wav', offset: 12.5, rate: 0.99999 } };
    const saved = JSON.parse(serializeProject(project, new Map([[source.id, source]]), 'linked'));
    expect(saved.version).toBe(3);
    expect(saved.sources[0]).toEqual({ id: 'source', name: 'Room', sampleRate: 48000,
      channels: 2, duration: 10, path: '/interview/aligned.wav', provenance: source.provenance });
    expect(saved.project.bitDepth).toBe(24);
  });

  it('fails visibly when linked audio is missing instead of dropping a microphone', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const file = JSON.stringify({ format: 'crispaudio-project', version: 2, project,
      sources: [{ id: 'source', name: 'Room', path: '/missing.wav', sampleRate: 48000, channels: 2 }] });
    await expect(deserializeProject(file, {} as BaseAudioContext)).rejects.toThrow('Cannot load linked audio "/missing.wav"');
  });

  it('rejects newer formats before attempting media loading', async () => {
    const file = JSON.stringify({ format: 'crispaudio-project', version: 99, project, sources: [] });
    await expect(deserializeProject(file, {} as BaseAudioContext)).rejects.toThrow('Unsupported CrispAudio project version');
  });
});
