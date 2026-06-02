// ---------------------------------------------------------------------------
// synthStore unit tests
// ---------------------------------------------------------------------------
// NOTE: Zustand stores keep state between tests because they are module-level
// singletons. We reset the store to fresh defaults in a beforeEach hook.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { useSynthStore } from '../../../src/stores/synthStore';
import { createDefaultParams } from '../../../src/audio/engine/SynthEngine';
import type { SynthParams } from '../../../src/types/synth';

// ---------------------------------------------------------------------------
// Reset helper — bring the store back to initial state before every test
// ---------------------------------------------------------------------------

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

beforeEach(() => {
  resetStore();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('synthStore — initial state', () => {
  it('active slot defaults to A', () => {
    expect(useSynthStore.getState().activeSlot).toBe('A');
  });

  it('morphAmount defaults to 0', () => {
    expect(useSynthStore.getState().morphAmount).toBe(0);
  });

  it('paramsA is a valid default', () => {
    const p = useSynthStore.getState().paramsA;
    expect(p.sound_vol).toBe(0.5);
    expect(p.sample_rate).toBe(44100);
  });

  it('paramsB is a valid default', () => {
    const p = useSynthStore.getState().paramsB;
    expect(p.sound_vol).toBe(0.5);
  });

  it('buffer is null initially', () => {
    expect(useSynthStore.getState().buffer).toBeNull();
  });

  it('lockedParams set is empty', () => {
    expect(useSynthStore.getState().lockedParams.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// setParams
// ---------------------------------------------------------------------------

describe('synthStore — setParams', () => {
  it('updates the active slot (A) with partial params', () => {
    useSynthStore.getState().setParams({ sound_vol: 0.9 });
    expect(useSynthStore.getState().paramsA.sound_vol).toBe(0.9);
  });

  it('updates slot B when activeSlot is B', () => {
    useSynthStore.getState().setActiveSlot('B');
    useSynthStore.getState().setParams({ sound_vol: 0.7 });
    expect(useSynthStore.getState().paramsB.sound_vol).toBe(0.7);
    // A is untouched
    expect(useSynthStore.getState().paramsA.sound_vol).toBe(0.5);
  });

  it('does not modify the inactive slot', () => {
    const volB = useSynthStore.getState().paramsB.sound_vol;
    useSynthStore.getState().setParams({ sound_vol: 0.1 });
    expect(useSynthStore.getState().paramsB.sound_vol).toBe(volB);
  });

  it('does not modify locked params', () => {
    useSynthStore.getState().toggleLock('sound_vol');
    const original = useSynthStore.getState().paramsA.sound_vol;
    useSynthStore.getState().setParams({ sound_vol: 0.99 });
    expect(useSynthStore.getState().paramsA.sound_vol).toBe(original);
  });

  it('updates non-locked params even when other params are locked', () => {
    useSynthStore.getState().toggleLock('sound_vol');
    useSynthStore.getState().setParams({ p_base_freq: 1.2 });
    expect(useSynthStore.getState().paramsA.p_base_freq).toBeCloseTo(1.2);
  });
});

// ---------------------------------------------------------------------------
// setActiveSlot
// ---------------------------------------------------------------------------

describe('synthStore — setActiveSlot', () => {
  it('switches to B', () => {
    useSynthStore.getState().setActiveSlot('B');
    expect(useSynthStore.getState().activeSlot).toBe('B');
  });

  it('switches back to A', () => {
    useSynthStore.getState().setActiveSlot('B');
    useSynthStore.getState().setActiveSlot('A');
    expect(useSynthStore.getState().activeSlot).toBe('A');
  });
});

// ---------------------------------------------------------------------------
// setMorphAmount
// ---------------------------------------------------------------------------

describe('synthStore — setMorphAmount', () => {
  it('sets the morph amount', () => {
    useSynthStore.getState().setMorphAmount(0.5);
    expect(useSynthStore.getState().morphAmount).toBe(0.5);
  });

  it('clamps to 0 when given a negative value', () => {
    useSynthStore.getState().setMorphAmount(-1);
    expect(useSynthStore.getState().morphAmount).toBe(0);
  });

  it('clamps to 1 when given a value > 1', () => {
    useSynthStore.getState().setMorphAmount(5);
    expect(useSynthStore.getState().morphAmount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// loadPreset
// ---------------------------------------------------------------------------

describe('synthStore — loadPreset', () => {
  it('loads the pickupCoin preset into the active slot', () => {
    useSynthStore.getState().loadPreset('pickupCoin');
    const p = useSynthStore.getState().paramsA;
    // pickupCoin always uses SAWTOOTH (wave_type = 1)
    expect(p.wave_type).toBe(1);
  });

  it('loads the explosion preset (NOISE wave_type=3)', () => {
    useSynthStore.getState().loadPreset('explosion');
    expect(useSynthStore.getState().paramsA.wave_type).toBe(3);
  });

  it('loads a preset into slot B when active', () => {
    useSynthStore.getState().setActiveSlot('B');
    useSynthStore.getState().loadPreset('jump');
    // jump always uses SQUARE (wave_type = 0)
    expect(useSynthStore.getState().paramsB.wave_type).toBe(0);
    // Slot A should be unchanged
    expect(useSynthStore.getState().paramsA.wave_type).toBe(
      createDefaultParams().wave_type,
    );
  });

  it('does not overwrite locked params during loadPreset', () => {
    useSynthStore.getState().toggleLock('sound_vol');
    const originalVol = useSynthStore.getState().paramsA.sound_vol;
    useSynthStore.getState().loadPreset('laserShoot');
    expect(useSynthStore.getState().paramsA.sound_vol).toBe(originalVol);
  });
});

// ---------------------------------------------------------------------------
// swapSlots
// ---------------------------------------------------------------------------

describe('synthStore — swapSlots', () => {
  it('exchanges paramsA and paramsB', () => {
    useSynthStore.getState().setParams({ sound_vol: 0.1 }); // set A
    useSynthStore.getState().setActiveSlot('B');
    useSynthStore.getState().setParams({ sound_vol: 0.9 }); // set B
    useSynthStore.getState().setActiveSlot('A');

    useSynthStore.getState().swapSlots();

    expect(useSynthStore.getState().paramsA.sound_vol).toBeCloseTo(0.9);
    expect(useSynthStore.getState().paramsB.sound_vol).toBeCloseTo(0.1);
  });

  it('double swap restores original values', () => {
    useSynthStore.getState().setParams({ sound_vol: 0.3 });
    useSynthStore.getState().swapSlots();
    useSynthStore.getState().swapSlots();
    expect(useSynthStore.getState().paramsA.sound_vol).toBeCloseTo(0.3);
  });
});

// ---------------------------------------------------------------------------
// toggleLock
// ---------------------------------------------------------------------------

describe('synthStore — toggleLock', () => {
  it('adds a param to the locked set', () => {
    useSynthStore.getState().toggleLock('sound_vol');
    expect(useSynthStore.getState().lockedParams.has('sound_vol')).toBe(true);
  });

  it('removes a param from the locked set on second toggle', () => {
    useSynthStore.getState().toggleLock('sound_vol');
    useSynthStore.getState().toggleLock('sound_vol');
    expect(useSynthStore.getState().lockedParams.has('sound_vol')).toBe(false);
  });

  it('can lock multiple params independently', () => {
    useSynthStore.getState().toggleLock('sound_vol');
    useSynthStore.getState().toggleLock('p_base_freq');
    const locked = useSynthStore.getState().lockedParams;
    expect(locked.has('sound_vol')).toBe(true);
    expect(locked.has('p_base_freq')).toBe(true);
  });

  it('unlocking one param does not unlock others', () => {
    useSynthStore.getState().toggleLock('sound_vol');
    useSynthStore.getState().toggleLock('p_base_freq');
    useSynthStore.getState().toggleLock('sound_vol'); // unlock only sound_vol
    const locked = useSynthStore.getState().lockedParams;
    expect(locked.has('sound_vol')).toBe(false);
    expect(locked.has('p_base_freq')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generate
// ---------------------------------------------------------------------------

describe('synthStore — generate', () => {
  it('populates buffer with a Float32Array after generate()', () => {
    useSynthStore.getState().generate();
    const buf = useSynthStore.getState().buffer;
    expect(buf).not.toBeNull();
    expect(buf).toBeInstanceOf(Float32Array);
  });

  it('generated buffer has non-zero length', () => {
    useSynthStore.getState().generate();
    expect(useSynthStore.getState().buffer!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// setExportSettings
// ---------------------------------------------------------------------------

describe('synthStore — setExportSettings', () => {
  it('updates sampleRate and bitDepth', () => {
    useSynthStore.getState().setExportSettings(22050, 24);
    expect(useSynthStore.getState().sampleRate).toBe(22050);
    expect(useSynthStore.getState().bitDepth).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// setIsPlaying
// ---------------------------------------------------------------------------

describe('synthStore — setIsPlaying', () => {
  it('sets isPlaying to true', () => {
    useSynthStore.getState().setIsPlaying(true);
    expect(useSynthStore.getState().isPlaying).toBe(true);
  });

  it('sets isPlaying back to false', () => {
    useSynthStore.getState().setIsPlaying(true);
    useSynthStore.getState().setIsPlaying(false);
    expect(useSynthStore.getState().isPlaying).toBe(false);
  });
});
