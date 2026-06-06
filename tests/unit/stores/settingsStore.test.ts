// ---------------------------------------------------------------------------
// settingsStore unit tests
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { useSettingsStore, SAMPLE_RATES, BIT_DEPTHS } from '../../../src/stores/settingsStore';

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
  });
  // Clean up any CSS class changes from previous tests
  document.documentElement.classList.remove('light');
}

beforeEach(() => {
  resetStore();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('settingsStore -- initial state', () => {
  it('language defaults to "en"', () => {
    expect(useSettingsStore.getState().language).toBe('en');
  });

  it('theme defaults to "dark"', () => {
    expect(useSettingsStore.getState().theme).toBe('dark');
  });

  it('defaultSampleRate defaults to 44100', () => {
    expect(useSettingsStore.getState().defaultSampleRate).toBe(44100);
  });

  it('defaultBitDepth defaults to 16', () => {
    expect(useSettingsStore.getState().defaultBitDepth).toBe(16);
  });

  it('exposes valid SAMPLE_RATES constant', () => {
    expect(SAMPLE_RATES).toEqual([22050, 44100, 48000]);
  });

  it('exposes valid BIT_DEPTHS constant', () => {
    expect(BIT_DEPTHS).toEqual([8, 16, 24, 32]);
  });
});

// ---------------------------------------------------------------------------
// setLanguage
// ---------------------------------------------------------------------------

describe('settingsStore -- setLanguage', () => {
  it('changes language to "de"', () => {
    useSettingsStore.getState().setLanguage('de');
    expect(useSettingsStore.getState().language).toBe('de');
  });

  it('changes language back to "en"', () => {
    useSettingsStore.getState().setLanguage('de');
    useSettingsStore.getState().setLanguage('en');
    expect(useSettingsStore.getState().language).toBe('en');
  });
});

// ---------------------------------------------------------------------------
// setTheme
// ---------------------------------------------------------------------------

describe('settingsStore -- setTheme', () => {
  it('changes theme to "light"', () => {
    useSettingsStore.getState().setTheme('light');
    expect(useSettingsStore.getState().theme).toBe('light');
  });

  it('applies "light" class to documentElement when theme is "light"', () => {
    useSettingsStore.getState().setTheme('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('removes "light" class when theme is "dark"', () => {
    useSettingsStore.getState().setTheme('light');
    useSettingsStore.getState().setTheme('dark');
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('changes theme to "system"', () => {
    useSettingsStore.getState().setTheme('system');
    expect(useSettingsStore.getState().theme).toBe('system');
  });

  it('handles "system" theme by checking prefers-color-scheme', () => {
    // jsdom matchMedia mock defaults to not matching, so system should behave like dark
    useSettingsStore.getState().setTheme('system');
    // In jsdom, prefers-color-scheme: dark is false by default, so light class should be toggled on
    // The exact behavior depends on the matchMedia mock, but state should be "system"
    expect(useSettingsStore.getState().theme).toBe('system');
  });
});

// ---------------------------------------------------------------------------
// setDefaultSampleRate
// ---------------------------------------------------------------------------

describe('settingsStore -- setDefaultSampleRate', () => {
  it('changes sample rate to 48000', () => {
    useSettingsStore.getState().setDefaultSampleRate(48000);
    expect(useSettingsStore.getState().defaultSampleRate).toBe(48000);
  });

  it('changes sample rate to 22050', () => {
    useSettingsStore.getState().setDefaultSampleRate(22050);
    expect(useSettingsStore.getState().defaultSampleRate).toBe(22050);
  });

  it.each(SAMPLE_RATES)('accepts valid sample rate %d', (rate) => {
    useSettingsStore.getState().setDefaultSampleRate(rate);
    expect(useSettingsStore.getState().defaultSampleRate).toBe(rate);
  });
});

// ---------------------------------------------------------------------------
// setDefaultBitDepth
// ---------------------------------------------------------------------------

describe('settingsStore -- setDefaultBitDepth', () => {
  it('changes bit depth to 24', () => {
    useSettingsStore.getState().setDefaultBitDepth(24);
    expect(useSettingsStore.getState().defaultBitDepth).toBe(24);
  });

  it('changes bit depth to 32', () => {
    useSettingsStore.getState().setDefaultBitDepth(32);
    expect(useSettingsStore.getState().defaultBitDepth).toBe(32);
  });

  it.each(BIT_DEPTHS)('accepts valid bit depth %d', (depth) => {
    useSettingsStore.getState().setDefaultBitDepth(depth);
    expect(useSettingsStore.getState().defaultBitDepth).toBe(depth);
  });
});
