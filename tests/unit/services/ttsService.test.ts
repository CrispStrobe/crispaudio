// ---------------------------------------------------------------------------
// ttsService unit tests
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { synthesizeSpeech, fetchVoices, checkServerHealth } from '../../../src/services/ttsService';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// synthesizeSpeech
// ---------------------------------------------------------------------------

describe('ttsService — synthesizeSpeech', () => {
  it('sends POST request to /v1/audio/speech with correct body', async () => {
    const wavData = new ArrayBuffer(44);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(wavData),
    });

    const result = await synthesizeSpeech('http://localhost:8766', 'Hello world', 'vivian', 'kokoro');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8766/v1/audio/speech');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(opts.body);
    expect(body.input).toBe('Hello world');
    expect(body.voice).toBe('vivian');
    expect(body.model).toBe('kokoro');
    expect(body.response_format).toBe('wav');
    expect(result).toBe(wavData);
  });

  it('strips trailing slashes from server URL', async () => {
    const wavData = new ArrayBuffer(44);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(wavData),
    });

    await synthesizeSpeech('http://localhost:8766/', 'Test');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8766/v1/audio/speech');
  });

  it('omits voice and model when not provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

    await synthesizeSpeech('http://localhost:8766', 'Test');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice).toBeUndefined();
    expect(body.model).toBeUndefined();
  });

  it('throws on HTTP error with server error message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { message: 'Model not loaded' } }),
    });

    await expect(synthesizeSpeech('http://localhost:8766', 'Test'))
      .rejects.toThrow('Model not loaded');
  });

  it('throws generic message when error response is not JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    });

    await expect(synthesizeSpeech('http://localhost:8766', 'Test'))
      .rejects.toThrow('TTS request failed (500)');
  });

  it('throws on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(synthesizeSpeech('http://localhost:8766', 'Test'))
      .rejects.toThrow('Failed to fetch');
  });
});

// ---------------------------------------------------------------------------
// fetchVoices
// ---------------------------------------------------------------------------

describe('ttsService — fetchVoices', () => {
  it('returns parsed voice array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { id: 'vivian', name: 'Vivian' },
        { id: 'alex', name: 'Alex' },
      ]),
    });

    const voices = await fetchVoices('http://localhost:8766');
    expect(voices).toHaveLength(2);
    expect(voices[0]).toEqual({ id: 'vivian', name: 'Vivian' });
  });

  it('handles string array format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(['vivian', 'alex']),
    });

    const voices = await fetchVoices('http://localhost:8766');
    expect(voices).toHaveLength(2);
    expect(voices[0]).toEqual({ id: 'vivian', name: 'vivian' });
  });

  it('handles { voices: [...] } wrapper format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ voices: ['v1', 'v2'] }),
    });

    const voices = await fetchVoices('http://localhost:8766');
    expect(voices).toHaveLength(2);
  });

  it('returns empty array on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const voices = await fetchVoices('http://localhost:8766');
    expect(voices).toEqual([]);
  });

  it('returns empty array on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    const voices = await fetchVoices('http://localhost:8766');
    expect(voices).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// checkServerHealth
// ---------------------------------------------------------------------------

describe('ttsService — checkServerHealth', () => {
  it('returns true when server responds OK', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const result = await checkServerHealth('http://localhost:8766');
    expect(result).toBe(true);
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:8766/health');
  });

  it('returns false when server responds with error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const result = await checkServerHealth('http://localhost:8766');
    expect(result).toBe(false);
  });

  it('returns false on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('connection refused'));
    const result = await checkServerHealth('http://localhost:8766');
    expect(result).toBe(false);
  });
});
