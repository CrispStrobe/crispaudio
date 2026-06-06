// ---------------------------------------------------------------------------
// Voice store extended tests — getEffectiveSettings edge cases, swapSlots,
// setMorphAmount clamping, multiple preset loads
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { useVoiceStore } from '../../../src/stores/voiceStore';
import { getPreset } from '../../../src/audio/presets/voicePresets';

function resetStore() {
  useVoiceStore.setState({
    settingsA: getPreset('original'),
    settingsB: getPreset('original'),
    activeSlot: 'A',
    morphAmount: 0,
    sourceBuffer: null,
    processedBuffer: null,
    isProcessing: false,
    selectedPreset: 'original',
  });
}

beforeEach(resetStore);

// ---------------------------------------------------------------------------
// getEffectiveSettings — deeper edge cases
// ---------------------------------------------------------------------------

describe('getEffectiveSettings — edge cases', () => {
  it('morphAmount=1 returns the opposite slot settings', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.setSettings({ pitchShift: 0 });
    store.setActiveSlot('B');
    store.setSettings({ pitchShift: 12 });

    // Active = B, morph = 1 => fully toward A
    store.setMorphAmount(1);
    const eff = store.getEffectiveSettings();
    expect(eff.pitchShift).toBeCloseTo(0);
  });

  it('morphAmount=1 with A active returns B settings', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.setSettings({ pitchShift: 5 });
    store.setActiveSlot('B');
    store.setSettings({ pitchShift: -5 });

    store.setActiveSlot('A');
    store.setMorphAmount(1);
    const eff = store.getEffectiveSettings();
    expect(eff.pitchShift).toBeCloseTo(-5);
  });

  it('interpolates all numeric fields consistently', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.setSettings({
      pitchShift: 0,
      masterGain: 0,
      formantShift: -1,
      reverbMix: 0,
    });
    store.setActiveSlot('B');
    store.setSettings({
      pitchShift: 10,
      masterGain: 2,
      formantShift: 1,
      reverbMix: 1,
    });

    store.setActiveSlot('A');
    store.setMorphAmount(0.25);
    const eff = store.getEffectiveSettings();

    expect(eff.pitchShift).toBeCloseTo(2.5);
    expect(eff.masterGain).toBeCloseTo(0.5);
    expect(eff.formantShift).toBeCloseTo(-0.5);
    expect(eff.reverbMix).toBeCloseTo(0.25);
  });

  it('returns exact active settings when morph is 0 (no interpolation artifacts)', () => {
    const demon = getPreset('demon');
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.loadPreset('demon');
    store.setMorphAmount(0);

    const eff = store.getEffectiveSettings();
    // Should be identical, not interpolated
    for (const key of Object.keys(demon) as (keyof typeof demon)[]) {
      expect(eff[key]).toBe(demon[key]);
    }
  });
});

// ---------------------------------------------------------------------------
// swapSlots — deeper checks
// ---------------------------------------------------------------------------

describe('swapSlots — extended', () => {
  it('swapping twice restores original state', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.loadPreset('alien');
    store.setActiveSlot('B');
    store.loadPreset('demon');

    const aBefore = { ...useVoiceStore.getState().settingsA };
    const bBefore = { ...useVoiceStore.getState().settingsB };

    store.swapSlots();
    store.swapSlots();

    const state = useVoiceStore.getState();
    expect(state.settingsA.pitchShift).toBe(aBefore.pitchShift);
    expect(state.settingsB.pitchShift).toBe(bBefore.pitchShift);
  });

  it('swap preserves all settings fields', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.loadPreset('chipmunk');
    store.setActiveSlot('B');
    store.loadPreset('classicRobot');

    const aPreSwap = { ...useVoiceStore.getState().settingsA };

    store.swapSlots();

    const state = useVoiceStore.getState();
    // B should now have what A had
    for (const key of Object.keys(aPreSwap) as (keyof typeof aPreSwap)[]) {
      expect(state.settingsB[key]).toBe(aPreSwap[key]);
    }
  });

  it('swap does not change activeSlot', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('B');
    store.swapSlots();
    expect(useVoiceStore.getState().activeSlot).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// setMorphAmount — clamping
// ---------------------------------------------------------------------------

describe('setMorphAmount — clamping', () => {
  it('clamps large positive values to 1', () => {
    useVoiceStore.getState().setMorphAmount(100);
    expect(useVoiceStore.getState().morphAmount).toBe(1);
  });

  it('clamps large negative values to 0', () => {
    useVoiceStore.getState().setMorphAmount(-100);
    expect(useVoiceStore.getState().morphAmount).toBe(0);
  });

  it('allows exact boundaries (0 and 1)', () => {
    useVoiceStore.getState().setMorphAmount(0);
    expect(useVoiceStore.getState().morphAmount).toBe(0);

    useVoiceStore.getState().setMorphAmount(1);
    expect(useVoiceStore.getState().morphAmount).toBe(1);
  });

  it('allows intermediate values', () => {
    useVoiceStore.getState().setMorphAmount(0.333);
    expect(useVoiceStore.getState().morphAmount).toBeCloseTo(0.333);
  });
});

// ---------------------------------------------------------------------------
// Multiple preset loads don't interfere
// ---------------------------------------------------------------------------

describe('multiple preset loads — independence', () => {
  it('loading presets sequentially into the same slot only keeps the last', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.loadPreset('demon');
    store.loadPreset('chipmunk');
    store.loadPreset('alien');

    const state = useVoiceStore.getState();
    const alien = getPreset('alien');
    expect(state.settingsA.pitchShift).toBe(alien.pitchShift);
    expect(state.selectedPreset).toBe('alien');
  });

  it('loading into A then B does not corrupt A', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.loadPreset('chipmunk');
    const chipmunkPitch = getPreset('chipmunk').pitchShift;

    store.setActiveSlot('B');
    store.loadPreset('demon');

    const state = useVoiceStore.getState();
    expect(state.settingsA.pitchShift).toBe(chipmunkPitch);
    expect(state.settingsB.pitchShift).toBe(getPreset('demon').pitchShift);
  });

  it('rapid alternating slot/preset loads produce correct state', () => {
    const store = useVoiceStore.getState();

    store.setActiveSlot('A');
    store.loadPreset('radio');
    store.setActiveSlot('B');
    store.loadPreset('metallic');
    store.setActiveSlot('A');
    store.loadPreset('cyborg');
    store.setActiveSlot('B');
    store.loadPreset('deepRobot');

    const state = useVoiceStore.getState();
    expect(state.settingsA.pitchShift).toBe(getPreset('cyborg').pitchShift);
    expect(state.settingsB.pitchShift).toBe(getPreset('deepRobot').pitchShift);
  });

  it('setSettings after loadPreset merges correctly', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.loadPreset('demon');
    const demonGain = getPreset('demon').masterGain;

    store.setSettings({ pitchShift: 99 });

    const state = useVoiceStore.getState();
    expect(state.settingsA.pitchShift).toBe(99);
    expect(state.settingsA.masterGain).toBe(demonGain);
  });
});
