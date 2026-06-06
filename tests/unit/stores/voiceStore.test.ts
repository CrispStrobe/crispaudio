// ---------------------------------------------------------------------------
// Voice store functional tests
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { useVoiceStore } from '../../../src/stores/voiceStore';
import { getPreset } from '../../../src/audio/presets/voicePresets';
import type { VoicePresetName } from '../../../src/types/voicelab';

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
// Preset loading
// ---------------------------------------------------------------------------

describe('Voice preset loading', () => {
  const presetNames: VoicePresetName[] = [
    'original', 'classicRobot', 'deepRobot', 'alien', 'cyborg',
    'radio', 'metallic', 'demon', 'chipmunk',
  ];

  for (const name of presetNames) {
    it(`preset "${name}" loads without error`, () => {
      const store = useVoiceStore.getState();
      store.loadPreset(name);
      const state = useVoiceStore.getState();
      expect(state.selectedPreset).toBe(name);
    });
  }

  it('different presets produce different settings', () => {
    const store = useVoiceStore.getState();
    store.loadPreset('classicRobot');
    const robot = { ...useVoiceStore.getState().settingsA };

    store.loadPreset('chipmunk');
    const chipmunk = { ...useVoiceStore.getState().settingsA };

    expect(robot.pitchShift).not.toBe(chipmunk.pitchShift);
  });

  it('original preset has neutral settings', () => {
    const original = getPreset('original');
    expect(original.pitchShift).toBe(0);
    expect(original.masterGain).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// A/B slot independence
// ---------------------------------------------------------------------------

describe('Voice A/B slots', () => {
  it('loading preset on slot A does not change slot B', () => {
    const store = useVoiceStore.getState();
    const bBefore = { ...store.settingsB };

    store.setActiveSlot('A');
    store.loadPreset('demon');

    const after = useVoiceStore.getState();
    expect(after.settingsA.pitchShift).not.toBe(bBefore.pitchShift);
    expect(after.settingsB.pitchShift).toBe(bBefore.pitchShift);
  });

  it('setSettings on slot A does not affect slot B', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.setSettings({ pitchShift: 12 });

    const state = useVoiceStore.getState();
    expect(state.settingsA.pitchShift).toBe(12);
    expect(state.settingsB.pitchShift).toBe(0); // original default
  });

  it('switching slot and modifying only affects target', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.loadPreset('alien');
    const alienPitch = useVoiceStore.getState().settingsA.pitchShift;

    store.setActiveSlot('B');
    store.loadPreset('radio');

    const final = useVoiceStore.getState();
    expect(final.settingsA.pitchShift).toBe(alienPitch);
    expect(final.settingsB.pitchShift).not.toBe(alienPitch);
  });

  it('swapSlots exchanges A and B', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.setSettings({ pitchShift: 5 });
    store.setActiveSlot('B');
    store.setSettings({ pitchShift: -5 });

    store.swapSlots();

    const state = useVoiceStore.getState();
    expect(state.settingsA.pitchShift).toBe(-5);
    expect(state.settingsB.pitchShift).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Morph / effective settings
// ---------------------------------------------------------------------------

describe('Voice morph interpolation', () => {
  it('morphAmount=0 returns active slot settings', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.setSettings({ pitchShift: 10 });
    store.setMorphAmount(0);

    const eff = store.getEffectiveSettings();
    expect(eff.pitchShift).toBe(10);
  });

  it('morphAmount=0.5 interpolates between slots', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.setSettings({ pitchShift: 0, masterGain: 0.5 });
    store.setActiveSlot('B');
    store.setSettings({ pitchShift: 10, masterGain: 1.5 });

    store.setActiveSlot('A');
    store.setMorphAmount(0.5);

    const eff = store.getEffectiveSettings();
    expect(eff.pitchShift).toBeCloseTo(5, 1);
    expect(eff.masterGain).toBeCloseTo(1.0, 1);
  });

  it('morphAmount clamps to [0, 1]', () => {
    const store = useVoiceStore.getState();
    store.setMorphAmount(-0.5);
    expect(useVoiceStore.getState().morphAmount).toBe(0);

    store.setMorphAmount(1.5);
    expect(useVoiceStore.getState().morphAmount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Settings updates
// ---------------------------------------------------------------------------

describe('Voice settings updates', () => {
  it('setSettings merges partial updates', () => {
    const store = useVoiceStore.getState();
    const origGain = store.settingsA.masterGain;

    store.setSettings({ pitchShift: 7 });

    const state = useVoiceStore.getState();
    expect(state.settingsA.pitchShift).toBe(7);
    expect(state.settingsA.masterGain).toBe(origGain); // unchanged
  });

  it('all VoiceSettings fields are numeric', () => {
    const settings = getPreset('classicRobot');
    for (const value of Object.values(settings)) {
      expect(typeof value).toBe('number');
      expect(isFinite(value as number)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Effective settings slot routing
// ---------------------------------------------------------------------------

describe('Voice effective settings slot routing', () => {
  it('getEffectiveSettings returns slot B settings when B is active', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.setSettings({ pitchShift: 3 });

    store.setActiveSlot('B');
    store.setSettings({ pitchShift: -7 });

    // morphAmount=0, active=B → should return B's settings
    store.setMorphAmount(0);
    const eff = store.getEffectiveSettings();
    expect(eff.pitchShift).toBe(-7);
  });

  it('getEffectiveSettings morphs from B toward A when B is active', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.setSettings({ pitchShift: 10 });

    store.setActiveSlot('B');
    store.setSettings({ pitchShift: 0 });

    store.setMorphAmount(0.5);
    const eff = store.getEffectiveSettings();
    // B=0, A=10, morph 0.5 from B toward A → should be ~5
    expect(eff.pitchShift).toBeCloseTo(5, 1);
  });

  it('switching slot changes which settings are returned', () => {
    const store = useVoiceStore.getState();
    store.setActiveSlot('A');
    store.setSettings({ pitchShift: 12 });
    store.setActiveSlot('B');
    store.setSettings({ pitchShift: -12 });

    store.setMorphAmount(0);

    store.setActiveSlot('A');
    expect(store.getEffectiveSettings().pitchShift).toBe(12);

    store.setActiveSlot('B');
    expect(store.getEffectiveSettings().pitchShift).toBe(-12);
  });
});
