// ---------------------------------------------------------------------------
// settingsStore — TTS settings tests
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { useSettingsStore } from '../../../src/stores/settingsStore';

// ---------------------------------------------------------------------------
// Mock matchMedia (jsdom does not provide it)
// ---------------------------------------------------------------------------

beforeAll(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Reset helper
// ---------------------------------------------------------------------------

function resetStore(): void {
  useSettingsStore.setState({
    language: 'en',
    theme: 'dark',
    defaultSampleRate: 44100,
    defaultBitDepth: 16,
    ttsServerUrl: 'http://localhost:8766',
    ttsDefaultVoice: '',
    ttsDefaultBackend: 'kokoro',
  });
  document.documentElement.classList.remove('light');
}

beforeEach(resetStore);

// ---------------------------------------------------------------------------
// TTS defaults
// ---------------------------------------------------------------------------

describe('settingsStore — TTS initial state', () => {
  it('ttsServerUrl defaults to http://localhost:8766', () => {
    expect(useSettingsStore.getState().ttsServerUrl).toBe('http://localhost:8766');
  });

  it('ttsDefaultVoice defaults to empty string', () => {
    expect(useSettingsStore.getState().ttsDefaultVoice).toBe('');
  });

  it('ttsDefaultBackend defaults to kokoro', () => {
    expect(useSettingsStore.getState().ttsDefaultBackend).toBe('kokoro');
  });
});

// ---------------------------------------------------------------------------
// setTTSServerUrl
// ---------------------------------------------------------------------------

describe('settingsStore — setTTSServerUrl', () => {
  it('changes server URL', () => {
    useSettingsStore.getState().setTTSServerUrl('http://myserver:9000');
    expect(useSettingsStore.getState().ttsServerUrl).toBe('http://myserver:9000');
  });

  it('accepts empty string', () => {
    useSettingsStore.getState().setTTSServerUrl('');
    expect(useSettingsStore.getState().ttsServerUrl).toBe('');
  });

  it('does not affect other settings', () => {
    useSettingsStore.getState().setTTSServerUrl('http://other:1234');
    expect(useSettingsStore.getState().language).toBe('en');
    expect(useSettingsStore.getState().defaultSampleRate).toBe(44100);
    expect(useSettingsStore.getState().ttsDefaultBackend).toBe('kokoro');
  });
});

// ---------------------------------------------------------------------------
// setTTSDefaultVoice
// ---------------------------------------------------------------------------

describe('settingsStore — setTTSDefaultVoice', () => {
  it('changes default voice', () => {
    useSettingsStore.getState().setTTSDefaultVoice('vivian');
    expect(useSettingsStore.getState().ttsDefaultVoice).toBe('vivian');
  });

  it('clears voice back to empty', () => {
    useSettingsStore.getState().setTTSDefaultVoice('vivian');
    useSettingsStore.getState().setTTSDefaultVoice('');
    expect(useSettingsStore.getState().ttsDefaultVoice).toBe('');
  });
});

// ---------------------------------------------------------------------------
// setTTSDefaultBackend
// ---------------------------------------------------------------------------

describe('settingsStore — setTTSDefaultBackend', () => {
  it('changes default backend', () => {
    useSettingsStore.getState().setTTSDefaultBackend('qwen3-tts');
    expect(useSettingsStore.getState().ttsDefaultBackend).toBe('qwen3-tts');
  });

  it('changes to piper', () => {
    useSettingsStore.getState().setTTSDefaultBackend('piper');
    expect(useSettingsStore.getState().ttsDefaultBackend).toBe('piper');
  });

  it('does not affect other TTS settings', () => {
    useSettingsStore.getState().setTTSDefaultBackend('orpheus');
    expect(useSettingsStore.getState().ttsServerUrl).toBe('http://localhost:8766');
    expect(useSettingsStore.getState().ttsDefaultVoice).toBe('');
  });
});
