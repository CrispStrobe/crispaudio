import { describe, expect, it } from 'vitest';
import { canAlign, projectFromSession } from '../../../src/lib/media';
import type { SyncSession } from '../../../src/lib/media';

function session(): SyncSession {
  return { format: 'crispaudio-sync', version: 1,
    video: { path: '/camera.mp4', duration: 10, channels: 2, sample_rate: 48000, has_video: true },
    tracks: [{ source: { path: '/rode.wav', duration: 30, channels: 1, sample_rate: 44100, has_video: false },
      alignment: { offset: 5, rate: 1.00001, confidence: 0.8, residual_ms: 1, reliable: true, manual: false, anchors: [] },
      aligned_path: '/aligned/rode.wav' }], camera_path: '/aligned/camera.wav' };
}

describe('interview import', () => {
  it('blocks uncertain/nonfinite alignment unless manually confirmed', () => {
    const input = session();
    expect(canAlign(input)).toBe(true);
    input.tracks[0].alignment.reliable = false;
    expect(canAlign(input)).toBe(false);
    input.tracks[0].alignment.manual = true;
    expect(canAlign(input)).toBe(true);
    input.tracks[0].alignment.offset = NaN;
    expect(canAlign(input)).toBe(false);
  });

  it('retains channels, provenance and video; plays only the first microphone', async () => {
    const input = session();
    const result = await projectFromSession(input, async (path) => ({
      duration: 10, sampleRate: 48000, numberOfChannels: path.includes('camera') ? 2 : 1,
      getChannelData: () => new Float32Array(1000),
    } as unknown as AudioBuffer));
    expect(result.project.sampleRate).toBe(48000);
    expect(result.project.video?.path).toBe('/camera.mp4');
    expect(result.project.tracks.map((track) => track.muted)).toEqual([false, true]);
    expect([...result.sources.values()].map((source) => source.channels)).toEqual([1, 2]);
    expect([...result.sources.values()][0].provenance).toEqual({ path: '/rode.wav', offset: 5, rate: 1.00001 });
    expect([...result.sources.values()][0].filePath).toBe('/aligned/rode.wav');
    expect(result.project.tracks[0].segments[0].sourceOffset).toBe(0);
  });

  it('rejects an incomplete render rather than importing a partial interview', async () => {
    const input = session();
    input.tracks[0].aligned_path = null;
    await expect(projectFromSession(input, async () => { throw new Error('Must not decode'); })).rejects.toThrow('not been aligned');
  });
});
