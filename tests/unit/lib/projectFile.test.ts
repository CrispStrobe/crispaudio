// ---------------------------------------------------------------------------
// projectFile tests — serialize / deserialize error handling paths
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the audio utils so we don't need real WAV encoding / peak computation
vi.mock('../../../src/audio/utils/audioBufferUtils', () => ({
  encodeAudioBufferToWav: vi.fn(() => new ArrayBuffer(44)), // minimal WAV stub
  computeWaveformPeaks: vi.fn(() => ({
    min: new Float32Array(100),
    max: new Float32Array(100),
  })),
}));

import { serializeProject, deserializeProject } from '../../../src/lib/projectFile';
import type { TimelineProject, AudioSource } from '../../../src/types/audio';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProject(overrides: Partial<TimelineProject> = {}): TimelineProject {
  return {
    id: 'proj-1',
    name: 'Test Project',
    sampleRate: 44100,
    tracks: [],
    masterEffects: [],
    duration: 0,
    ...overrides,
  };
}

function makeMockAudioBuffer(opts: Partial<{
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  duration: number;
}> = {}): AudioBuffer {
  const length = opts.length ?? 1024;
  const numberOfChannels = opts.numberOfChannels ?? 1;
  const sampleRate = opts.sampleRate ?? 44100;
  const duration = opts.duration ?? length / sampleRate;

  return {
    length,
    numberOfChannels,
    sampleRate,
    duration,
    getChannelData: () => new Float32Array(length),
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

function makeMockAudioContext(
  decodeImpl?: (buf: ArrayBuffer) => Promise<AudioBuffer>,
): BaseAudioContext {
  const defaultDecode = () => Promise.resolve(makeMockAudioBuffer());
  return {
    decodeAudioData: vi.fn(decodeImpl ?? defaultDecode),
  } as unknown as BaseAudioContext;
}

function makeSource(id: string, name: string): AudioSource {
  const buffer = makeMockAudioBuffer();
  return {
    id,
    name,
    buffer,
    peaks: { min: new Float32Array(10), max: new Float32Array(10) },
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// serializeProject
// ---------------------------------------------------------------------------

describe('serializeProject', () => {
  it('produces valid JSON with format and version fields', () => {
    const project = makeProject();
    const sources = new Map<string, AudioSource>();
    sources.set('src-1', makeSource('src-1', 'Kick'));

    const json = serializeProject(project, sources);
    const parsed = JSON.parse(json);

    expect(parsed.format).toBe('crispaudio-project');
    expect(parsed.version).toBe(1);
    expect(parsed.project).toBeDefined();
    expect(parsed.project.id).toBe('proj-1');
    expect(Array.isArray(parsed.sources)).toBe(true);
    expect(parsed.sources).toHaveLength(1);
    expect(parsed.sources[0].id).toBe('src-1');
    expect(parsed.sources[0].name).toBe('Kick');
    expect(typeof parsed.sources[0].wav).toBe('string');
  });

  it('serializes an empty source map', () => {
    const json = serializeProject(makeProject(), new Map());
    const parsed = JSON.parse(json);

    expect(parsed.sources).toEqual([]);
    expect(parsed.format).toBe('crispaudio-project');
  });
});

// ---------------------------------------------------------------------------
// deserializeProject — valid input
// ---------------------------------------------------------------------------

describe('deserializeProject — valid input', () => {
  it('deserializes a project with valid sources', async () => {
    const mockBuffer = makeMockAudioBuffer({ duration: 2.0, sampleRate: 48000 });
    const ctx = makeMockAudioContext(() => Promise.resolve(mockBuffer));

    const doc = {
      format: 'crispaudio-project',
      version: 1,
      project: makeProject({ name: 'Loaded Project' }),
      sources: [
        { id: 's1', name: 'Snare', sampleRate: 48000, channels: 1, duration: 2.0, wav: btoa('fake-wav-data') },
      ],
    };

    const result = await deserializeProject(JSON.stringify(doc), ctx);

    expect(result.project.name).toBe('Loaded Project');
    expect(result.sources.size).toBe(1);
    expect(result.sources.has('s1')).toBe(true);
    const src = result.sources.get('s1')!;
    expect(src.name).toBe('Snare');
    expect(src.duration).toBe(2.0);
    expect(src.sampleRate).toBe(48000);
  });
});

// ---------------------------------------------------------------------------
// deserializeProject — corrupt source is skipped
// ---------------------------------------------------------------------------

describe('deserializeProject — corrupt source handling', () => {
  it('skips a corrupt source without crashing', async () => {
    let callCount = 0;
    const ctx = makeMockAudioContext(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Corrupt audio data');
      }
      return Promise.resolve(makeMockAudioBuffer());
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const doc = {
      format: 'crispaudio-project',
      version: 1,
      project: makeProject(),
      sources: [
        { id: 'bad', name: 'Corrupt File', sampleRate: 44100, channels: 1, duration: 1.0, wav: btoa('bad') },
        { id: 'good', name: 'Good File', sampleRate: 44100, channels: 1, duration: 1.0, wav: btoa('good') },
      ],
    };

    const result = await deserializeProject(JSON.stringify(doc), ctx);

    // The corrupt source should be skipped, the good one should be present
    expect(result.sources.size).toBe(1);
    expect(result.sources.has('bad')).toBe(false);
    expect(result.sources.has('good')).toBe(true);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('returns empty sources when all sources are corrupt', async () => {
    const ctx = makeMockAudioContext(() => {
      throw new Error('all broken');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const doc = {
      format: 'crispaudio-project',
      version: 1,
      project: makeProject(),
      sources: [
        { id: 'a', name: 'A', sampleRate: 44100, channels: 1, duration: 1, wav: btoa('x') },
      ],
    };

    const result = await deserializeProject(JSON.stringify(doc), ctx);
    expect(result.sources.size).toBe(0);
    expect(result.project).toBeDefined();

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// deserializeProject — invalid format / missing fields
// ---------------------------------------------------------------------------

describe('deserializeProject — invalid documents', () => {
  it('throws on invalid format string', async () => {
    const ctx = makeMockAudioContext();
    const doc = {
      format: 'wrong-format',
      version: 1,
      project: makeProject(),
      sources: [],
    };

    await expect(
      deserializeProject(JSON.stringify(doc), ctx),
    ).rejects.toThrow('Not a valid CrispAudio project file');
  });

  it('throws when project field is missing', async () => {
    const ctx = makeMockAudioContext();
    const doc = {
      format: 'crispaudio-project',
      version: 1,
      sources: [],
    };

    await expect(
      deserializeProject(JSON.stringify(doc), ctx),
    ).rejects.toThrow('Not a valid CrispAudio project file');
  });

  it('throws when sources is not an array', async () => {
    const ctx = makeMockAudioContext();
    const doc = {
      format: 'crispaudio-project',
      version: 1,
      project: makeProject(),
      sources: 'not-an-array',
    };

    await expect(
      deserializeProject(JSON.stringify(doc), ctx),
    ).rejects.toThrow('Not a valid CrispAudio project file');
  });

  it('throws on invalid JSON', async () => {
    const ctx = makeMockAudioContext();

    await expect(
      deserializeProject('this is not json', ctx),
    ).rejects.toThrow();
  });
});
