// ---------------------------------------------------------------------------
// useAutosave utility function tests
// ---------------------------------------------------------------------------
// Tests the standalone utility functions (getAutosaveInfo, restoreAutosave,
// clearAutosave) which operate on localStorage directly.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { getAutosaveInfo, restoreAutosave, clearAutosave } from '../../../src/hooks/useAutosave';

const AUTOSAVE_KEY = 'crispaudio-autosave';

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// getAutosaveInfo
// ---------------------------------------------------------------------------

describe('getAutosaveInfo', () => {
  it('returns null when nothing is saved', () => {
    expect(getAutosaveInfo()).toBeNull();
  });

  it('returns savedAt when autosave data exists', () => {
    const savedAt = '2026-01-15T12:00:00.000Z';
    const data = {
      savedAt,
      project: {
        id: 'test-id',
        name: 'Test Project',
        sampleRate: 44100,
        tracks: [],
        masterEffects: [],
        duration: 0,
      },
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));

    const info = getAutosaveInfo();
    expect(info).not.toBeNull();
    expect(info!.savedAt).toBe(savedAt);
  });

  it('returns null when localStorage contains invalid JSON', () => {
    localStorage.setItem(AUTOSAVE_KEY, 'not valid json {{{');
    expect(getAutosaveInfo()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// restoreAutosave
// ---------------------------------------------------------------------------

describe('restoreAutosave', () => {
  it('returns false when nothing is saved', () => {
    expect(restoreAutosave()).toBe(false);
  });

  it('returns false when localStorage contains invalid JSON', () => {
    localStorage.setItem(AUTOSAVE_KEY, '{{invalid');
    expect(restoreAutosave()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clearAutosave
// ---------------------------------------------------------------------------

describe('clearAutosave', () => {
  it('removes autosave data from localStorage', () => {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ savedAt: 'test', project: {} }));
    expect(localStorage.getItem(AUTOSAVE_KEY)).not.toBeNull();

    clearAutosave();
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull();
  });

  it('does not throw when nothing is saved', () => {
    expect(() => clearAutosave()).not.toThrow();
  });

  it('makes getAutosaveInfo return null after clearing', () => {
    const data = {
      savedAt: '2026-01-15T12:00:00.000Z',
      project: {
        id: 'test-id',
        name: 'Test',
        sampleRate: 44100,
        tracks: [],
        masterEffects: [],
        duration: 0,
      },
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
    expect(getAutosaveInfo()).not.toBeNull();

    clearAutosave();
    expect(getAutosaveInfo()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Save / restore round-trip via localStorage
// ---------------------------------------------------------------------------

describe('autosave round-trip via localStorage', () => {
  it('saved data can be retrieved by getAutosaveInfo', () => {
    const savedAt = new Date().toISOString();
    const project = {
      id: 'round-trip-id',
      name: 'Round Trip Project',
      sampleRate: 48000,
      tracks: [
        {
          id: 'track-1',
          name: 'Track 1',
          volume: 1,
          pan: 0,
          mute: false,
          solo: false,
          segments: [
            {
              id: 'seg-1',
              sourceId: 'src-1',
              startTime: 0,
              duration: 2.5,
              offset: 0,
              gain: 1,
              fadeIn: 0,
              fadeOut: 0,
            },
          ],
          effects: [],
        },
      ],
      masterEffects: [],
      duration: 2.5,
    };

    localStorage.setItem(
      AUTOSAVE_KEY,
      JSON.stringify({ savedAt, project }),
    );

    const info = getAutosaveInfo();
    expect(info).not.toBeNull();
    expect(info!.savedAt).toBe(savedAt);
  });

  it('raw localStorage data preserves project structure', () => {
    const savedAt = '2026-06-06T10:30:00.000Z';
    const project = {
      id: 'p1',
      name: 'My Project',
      sampleRate: 44100,
      tracks: [],
      masterEffects: [],
      duration: 0,
    };

    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ savedAt, project }));

    const raw = localStorage.getItem(AUTOSAVE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.project.name).toBe('My Project');
    expect(parsed.project.sampleRate).toBe(44100);
  });
});
