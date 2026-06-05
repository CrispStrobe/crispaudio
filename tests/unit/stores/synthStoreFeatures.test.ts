// ---------------------------------------------------------------------------
// Tests for new synthStore features: mutate, import/export, share link, undo
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { useSynthStore } from '../../../src/stores/synthStore';
import { createDefaultParams } from '../../../src/audio/engine/SynthEngine';
import type { SynthParams } from '../../../src/types/synth';

function resetStore(): void {
  useSynthStore.setState({
    paramsA: createDefaultParams(),
    paramsB: createDefaultParams(),
    activeSlot: 'A',
    morphAmount: 0,
    lockedParams: new Set<keyof SynthParams>(),
    buffer: null,
    sampleRate: 44100,
    bitDepth: 16,
    isPlaying: false,
  });
}

beforeEach(resetStore);

// ---------------------------------------------------------------------------
// mutateParams
// ---------------------------------------------------------------------------

describe('mutateParams', () => {
  it('changes some params of the active slot', () => {
    const store = useSynthStore.getState();
    store.loadPreset('pickupCoin');
    const before = { ...useSynthStore.getState().paramsA };

    store.mutateParams();
    const after = useSynthStore.getState().paramsA;

    // At least one param should differ
    let diffCount = 0;
    for (const key of Object.keys(before) as Array<keyof SynthParams>) {
      if (before[key] !== after[key]) diffCount++;
    }
    expect(diffCount).toBeGreaterThan(0);
    expect(diffCount).toBeLessThanOrEqual(5); // 2-4 params mutated
  });

  it('respects locked params', () => {
    const store = useSynthStore.getState();
    store.setParams({ p_base_freq: 0.5 });
    store.toggleLock('p_base_freq');

    // Mutate many times — locked param should never change
    for (let i = 0; i < 10; i++) {
      store.mutateParams();
    }

    expect(useSynthStore.getState().paramsA.p_base_freq).toBe(0.5);
  });

  it('mutates the active slot only', () => {
    const store = useSynthStore.getState();
    store.setActiveSlot('A');
    store.loadPreset('explosion');
    store.setActiveSlot('B');
    store.loadPreset('ambient');
    const bBefore = { ...useSynthStore.getState().paramsB };

    store.setActiveSlot('A');
    store.mutateParams();

    // B should be unchanged
    const bAfter = useSynthStore.getState().paramsB;
    expect(bAfter.p_base_freq).toBe(bBefore.p_base_freq);
  });
});

// ---------------------------------------------------------------------------
// exportParamsJSON / importParamsJSON
// ---------------------------------------------------------------------------

describe('JSON export/import', () => {
  it('exportParamsJSON produces valid JSON with params', () => {
    const store = useSynthStore.getState();
    store.loadPreset('pickupCoin');
    const json = store.exportParamsJSON();
    const parsed = JSON.parse(json);

    expect(parsed.slot).toBe('A');
    expect(parsed.params).toBeDefined();
    expect(typeof parsed.params.p_base_freq).toBe('number');
  });

  it('importParamsJSON loads params into active slot', () => {
    const store = useSynthStore.getState();
    const json = JSON.stringify({
      slot: 'A',
      params: { p_base_freq: 1.234, sound_vol: 0.99 },
    });

    store.importParamsJSON(json);
    const state = useSynthStore.getState();
    expect(state.paramsA.p_base_freq).toBe(1.234);
    expect(state.paramsA.sound_vol).toBe(0.99);
  });

  it('importParamsJSON respects locked params', () => {
    const store = useSynthStore.getState();
    store.setParams({ p_base_freq: 0.5 });
    store.toggleLock('p_base_freq');

    store.importParamsJSON(JSON.stringify({
      params: { p_base_freq: 1.0, sound_vol: 0.8 },
    }));

    const state = useSynthStore.getState();
    expect(state.paramsA.p_base_freq).toBe(0.5); // locked
    expect(state.paramsA.sound_vol).toBe(0.8);    // imported
  });

  it('importParamsJSON ignores invalid JSON', () => {
    const store = useSynthStore.getState();
    const before = { ...useSynthStore.getState().paramsA };

    store.importParamsJSON('not valid json');

    const after = useSynthStore.getState().paramsA;
    expect(after.p_base_freq).toBe(before.p_base_freq);
  });

  it('round-trips export → import', () => {
    const store = useSynthStore.getState();
    store.loadPreset('explosion');
    const exported = store.exportParamsJSON();

    // Reset and import
    resetStore();
    useSynthStore.getState().importParamsJSON(exported);

    const imported = useSynthStore.getState().paramsA;
    const parsed = JSON.parse(exported);
    expect(imported.p_base_freq).toBe(parsed.params.p_base_freq);
    expect(imported.wave_type).toBe(parsed.params.wave_type);
  });
});

// ---------------------------------------------------------------------------
// encodeShareLink
// ---------------------------------------------------------------------------

describe('encodeShareLink', () => {
  it('produces a URL with ?sound= parameter', () => {
    const store = useSynthStore.getState();
    store.loadPreset('pickupCoin');
    const link = store.encodeShareLink();

    expect(link).toContain('?sound=');
    // Decode and verify
    const url = new URL(link);
    const encoded = url.searchParams.get('sound');
    expect(encoded).toBeTruthy();

    const decoded = JSON.parse(atob(encoded!));
    expect(typeof decoded.p_base_freq).toBe('number');
  });

  it('encodes the active slot params', () => {
    const store = useSynthStore.getState();
    store.setActiveSlot('B');
    store.setParams({ p_base_freq: 1.777 });
    const link = store.encodeShareLink();

    const url = new URL(link);
    const decoded = JSON.parse(atob(url.searchParams.get('sound')!));
    expect(decoded.p_base_freq).toBe(1.777);
  });
});

// ---------------------------------------------------------------------------
// Undo/Redo via temporal
// ---------------------------------------------------------------------------

describe('Undo/Redo', () => {
  it('undo reverts parameter changes', () => {
    const store = useSynthStore.getState();
    const origFreq = store.paramsA.p_base_freq;

    store.setParams({ p_base_freq: 1.5 });
    expect(useSynthStore.getState().paramsA.p_base_freq).toBe(1.5);

    useSynthStore.temporal.getState().undo();
    expect(useSynthStore.getState().paramsA.p_base_freq).toBe(origFreq);
  });

  it('redo restores after undo', () => {
    const store = useSynthStore.getState();
    store.setParams({ p_base_freq: 1.5 });

    useSynthStore.temporal.getState().undo();
    useSynthStore.temporal.getState().redo();

    expect(useSynthStore.getState().paramsA.p_base_freq).toBe(1.5);
  });

  it('undo reverts preset loads', () => {
    const store = useSynthStore.getState();
    const origFreq = store.paramsA.p_base_freq;

    store.loadPreset('explosion');
    const explosionFreq = useSynthStore.getState().paramsA.p_base_freq;
    expect(explosionFreq).not.toBe(origFreq);

    useSynthStore.temporal.getState().undo();
    expect(useSynthStore.getState().paramsA.p_base_freq).toBe(origFreq);
  });
});
