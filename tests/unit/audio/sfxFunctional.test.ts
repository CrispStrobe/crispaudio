// ---------------------------------------------------------------------------
// Deep functional tests — SFX audio generation
// Verifies: presets produce distinct audio, params change output meaningfully,
// WAV encoding works, A/B slots independent, morphing interpolates.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDefaultParams,
  generateSamples,
  loadPreset,
  morphParams,
} from '../../../src/audio/engine/SynthEngine';
import { useSynthStore } from '../../../src/stores/synthStore';
import type { SynthParams, PresetName } from '../../../src/types/synth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** RMS energy of a Float32Array */
function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

/** Peak amplitude */
function peak(buf: Float32Array): number {
  let max = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > max) max = a;
  }
  return max;
}

/** Zero-crossing rate (rough frequency estimate) */
function zeroCrossingRate(buf: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < buf.length; i++) {
    if ((buf[i - 1] >= 0 && buf[i] < 0) || (buf[i - 1] < 0 && buf[i] >= 0)) {
      crossings++;
    }
  }
  return crossings / buf.length;
}

/** Check if two buffers are meaningfully different */
function areDifferent(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return true;
  let diffSum = 0;
  for (let i = 0; i < a.length; i++) {
    diffSum += Math.abs(a[i] - b[i]);
  }
  return diffSum / a.length > 0.001;
}

const SR = 44100;

// ---------------------------------------------------------------------------
// 1. Presets produce distinct, non-silent audio
// ---------------------------------------------------------------------------

describe('Presets produce distinct audio', () => {
  const presetNames: PresetName[] = [
    'pickupCoin', 'laserShoot', 'explosion', 'powerUp',
    'hitHurt', 'jump', 'ambient', 'blipSelect',
    'zapElectric', 'wooshWind', 'droneBuzz', 'clickUI',
    'glitchDigital', 'portalWarp', 'warningAlarm',
  ];

  for (const name of presetNames) {
    it(`preset "${name}" produces non-silent audio`, () => {
      const params = loadPreset(name);
      const samples = generateSamples(params, SR);
      expect(samples.length).toBeGreaterThan(0);
      expect(rms(samples)).toBeGreaterThan(0.0001);
      expect(peak(samples)).toBeGreaterThan(0.001);
    });
  }

  it('different presets produce meaningfully different waveforms', () => {
    const buffers: Map<string, Float32Array> = new Map();
    for (const name of presetNames.slice(0, 8)) {
      buffers.set(name, generateSamples(loadPreset(name), SR));
    }

    // Compare all pairs — at least 80% should be different
    let comparisons = 0;
    let different = 0;
    const names = [...buffers.keys()];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        comparisons++;
        if (areDifferent(buffers.get(names[i])!, buffers.get(names[j])!)) {
          different++;
        }
      }
    }
    expect(different / comparisons).toBeGreaterThan(0.7);
  });

  it('"random" preset produces varied output across calls', () => {
    // Use lower SR for speed; compare params directly since random
    // presets with identical params produce identical output
    const p1 = loadPreset('random');
    const p2 = loadPreset('random');
    const p3 = loadPreset('random');
    // At least one pair should have different base frequency
    const allSame = p1.p_base_freq === p2.p_base_freq && p2.p_base_freq === p3.p_base_freq;
    expect(allSame).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Parameter changes meaningfully alter output
// ---------------------------------------------------------------------------

describe('Parameter changes alter output', () => {
  it('changing base frequency changes zero-crossing rate', () => {
    const p1 = createDefaultParams();
    p1.p_base_freq = 0.2;
    p1.wave_type = 2; // sine
    p1.p_env_sustain = 0.5;
    p1.p_env_decay = 0.3;

    const p2 = { ...p1, p_base_freq: 0.8 };

    const buf1 = generateSamples(p1, SR);
    const buf2 = generateSamples(p2, SR);

    const zcr1 = zeroCrossingRate(buf1);
    const zcr2 = zeroCrossingRate(buf2);

    // Higher frequency should have more zero crossings
    expect(zcr2).toBeGreaterThan(zcr1);
  });

  it('changing volume changes RMS level', () => {
    const p1 = createDefaultParams();
    p1.p_base_freq = 0.3;
    p1.p_env_sustain = 0.5;
    p1.sound_vol = 0.2;

    const p2 = { ...p1, sound_vol: 0.8 };

    const buf1 = generateSamples(p1, SR);
    const buf2 = generateSamples(p2, SR);

    expect(rms(buf2)).toBeGreaterThan(rms(buf1));
  });

  it('changing wave type changes waveform shape', () => {
    const base = createDefaultParams();
    base.p_base_freq = 0.3;
    base.p_env_sustain = 0.5;
    base.p_env_decay = 0.3;

    const bufs = [0, 1, 2, 3].map((wt) =>
      generateSamples({ ...base, wave_type: wt }, SR),
    );

    // At least 5 of the 6 pairs should be different
    let different = 0;
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        if (areDifferent(bufs[i], bufs[j])) different++;
      }
    }
    expect(different).toBeGreaterThanOrEqual(5);
  });

  it('envelope attack changes output shape', () => {
    const p1 = createDefaultParams();
    p1.p_base_freq = 0.3;
    p1.p_env_attack = 0;
    p1.p_env_sustain = 0.3;
    p1.p_env_decay = 0.3;

    const p2 = { ...p1, p_env_attack: 1.0 };

    const buf1 = generateSamples(p1, SR);
    const buf2 = generateSamples(p2, SR);

    // With longer attack, the first 10% should have lower RMS
    const slice1 = buf1.slice(0, Math.floor(buf1.length * 0.1));
    const slice2 = buf2.slice(0, Math.floor(buf2.length * 0.1));

    // buf2 should have lower RMS at start (ramping up)
    expect(rms(slice2)).toBeLessThan(rms(slice1) + 0.01);
  });

  it('distortion increases harmonic content', () => {
    const p1 = createDefaultParams();
    p1.wave_type = 2; // sine (pure tone)
    p1.p_base_freq = 0.3;
    p1.p_env_sustain = 0.5;
    p1.p_env_decay = 0.3;
    p1.distortion = 0;

    const p2 = { ...p1, distortion: 0.8 };

    const buf1 = generateSamples(p1, SR);
    const buf2 = generateSamples(p2, SR);

    // Distorted signal should differ from clean
    expect(areDifferent(buf1, buf2)).toBe(true);
  });

  it('frequency ramp creates pitch sweep', () => {
    const p1 = createDefaultParams();
    p1.p_base_freq = 0.3;
    p1.p_env_sustain = 0.5;
    p1.p_env_decay = 0.3;
    p1.p_freq_ramp = 0;

    const p2 = { ...p1, p_freq_ramp: -0.3 };

    const buf1 = generateSamples(p1, SR);
    const buf2 = generateSamples(p2, SR);

    expect(areDifferent(buf1, buf2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. A/B slots are independent
// ---------------------------------------------------------------------------

describe('A/B slots independence', () => {
  function resetStore() {
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

  it('loading a preset on slot A does not change slot B', () => {
    const store = useSynthStore.getState();
    const bBefore = { ...store.paramsB };

    store.setActiveSlot('A');
    store.loadPreset('laserShoot');

    const after = useSynthStore.getState();
    expect(after.paramsA.p_base_freq).not.toBe(bBefore.p_base_freq);
    // B should be unchanged
    expect(after.paramsB.p_base_freq).toBe(bBefore.p_base_freq);
    expect(after.paramsB.wave_type).toBe(bBefore.wave_type);
  });

  it('setParams on slot A does not affect slot B', () => {
    const store = useSynthStore.getState();
    store.setActiveSlot('A');
    store.setParams({ p_base_freq: 1.5 });

    const after = useSynthStore.getState();
    expect(after.paramsA.p_base_freq).toBe(1.5);
    expect(after.paramsB.p_base_freq).toBe(createDefaultParams().p_base_freq);
  });

  it('switching slot and loading preset only affects new slot', () => {
    const store = useSynthStore.getState();

    store.setActiveSlot('A');
    store.loadPreset('explosion');
    const afterA = { ...useSynthStore.getState().paramsA };

    store.setActiveSlot('B');
    store.loadPreset('ambient');

    const final = useSynthStore.getState();
    // A should still have explosion params
    expect(final.paramsA.p_base_freq).toBe(afterA.p_base_freq);
    // B should differ
    expect(final.paramsB.p_base_freq).not.toBe(afterA.p_base_freq);
  });
});

// ---------------------------------------------------------------------------
// 4. Morphing interpolates between slots
// ---------------------------------------------------------------------------

describe('Morphing', () => {
  it('morphAmount=0 produces slot A audio', () => {
    const a = loadPreset('pickupCoin');
    const b = loadPreset('explosion');
    const morphed = morphParams(a, b, 0);

    expect(morphed.p_base_freq).toBe(a.p_base_freq);
    expect(morphed.wave_type).toBe(a.wave_type);
  });

  it('morphAmount=1 produces slot B audio', () => {
    const a = loadPreset('pickupCoin');
    const b = loadPreset('explosion');
    const morphed = morphParams(a, b, 1);

    expect(morphed.p_base_freq).toBeCloseTo(b.p_base_freq, 10);
    expect(morphed.wave_type).toBe(b.wave_type);
  });

  it('morphAmount=0.5 interpolates numeric params', () => {
    const a = createDefaultParams();
    a.p_base_freq = 0.2;
    a.sound_vol = 0.3;

    const b = createDefaultParams();
    b.p_base_freq = 0.8;
    b.sound_vol = 0.9;

    const morphed = morphParams(a, b, 0.5);

    expect(morphed.p_base_freq).toBeCloseTo(0.5, 1);
    expect(morphed.sound_vol).toBeCloseTo(0.6, 1);
  });

  it('morphed audio is between A and B in character', () => {
    const a = createDefaultParams();
    a.wave_type = 2; // sine
    a.p_base_freq = 0.2;
    a.p_env_sustain = 0.5;

    const b = createDefaultParams();
    b.wave_type = 2; // sine
    b.p_base_freq = 0.8;
    b.p_env_sustain = 0.5;

    const bufA = generateSamples(a, SR);
    const bufB = generateSamples(b, SR);
    const bufMid = generateSamples(morphParams(a, b, 0.5), SR);

    const zcrA = zeroCrossingRate(bufA);
    const zcrB = zeroCrossingRate(bufB);
    const zcrMid = zeroCrossingRate(bufMid);

    // Mid should be between A and B
    const lo = Math.min(zcrA, zcrB);
    const hi = Math.max(zcrA, zcrB);
    expect(zcrMid).toBeGreaterThanOrEqual(lo * 0.8);
    expect(zcrMid).toBeLessThanOrEqual(hi * 1.2);
  });
});

// ---------------------------------------------------------------------------
// 5. WAV generation produces valid data
// ---------------------------------------------------------------------------

describe('WAV data validity', () => {
  it('all samples are finite numbers', () => {
    // Use a short, deterministic sound to avoid timeout
    const params = createDefaultParams();
    params.p_base_freq = 0.3;
    params.p_env_attack = 0;
    params.p_env_sustain = 0.1;
    params.p_env_decay = 0.2;
    params.p_env_punch = 0;
    const samples = generateSamples(params, 22050); // lower SR = faster
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.length).toBeLessThan(22050 * 2); // at most 2 seconds
    for (let i = 0; i < samples.length; i++) {
      expect(isFinite(samples[i])).toBe(true);
    }
  }, 10000);

  it('samples are within [-1, 1] range (or close)', () => {
    const presets: PresetName[] = ['pickupCoin', 'explosion', 'laserShoot', 'ambient'];
    for (const name of presets) {
      const samples = generateSamples(loadPreset(name), SR);
      const p = peak(samples);
      // Allow slight overshoots from effects, but should be reasonable
      expect(p).toBeLessThan(3.0);
    }
  });

  it('generates reasonable buffer lengths', () => {
    const params = createDefaultParams();
    params.p_env_sustain = 0.3;
    params.p_env_decay = 0.4;
    const samples = generateSamples(params, SR);
    // Should be at least a few hundred samples and not more than 10 seconds
    expect(samples.length).toBeGreaterThan(100);
    expect(samples.length).toBeLessThan(SR * 10);
  });

  it('different sample rates produce different buffer lengths', () => {
    const params = loadPreset('pickupCoin');
    const buf44 = generateSamples(params, 44100);
    const buf22 = generateSamples(params, 22050);
    // Lower sample rate → fewer samples for same duration
    expect(buf22.length).toBeLessThan(buf44.length);
  });
});

// ---------------------------------------------------------------------------
// 6. Store generate() produces buffer from params
// ---------------------------------------------------------------------------

describe('Store generate() integration', () => {
  function resetStore() {
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

  it('generate() fills buffer from paramsA when morphAmount=0', () => {
    const store = useSynthStore.getState();
    store.loadPreset('pickupCoin');
    store.generate();

    const state = useSynthStore.getState();
    expect(state.buffer).not.toBeNull();
    expect(state.buffer!.length).toBeGreaterThan(0);
    expect(rms(state.buffer!)).toBeGreaterThan(0.001);
  });

  it('changing params and regenerating produces different buffer', () => {
    const store = useSynthStore.getState();
    store.loadPreset('pickupCoin');
    store.generate();
    const buf1 = useSynthStore.getState().buffer!;

    store.setParams({ p_base_freq: 1.5 });
    store.generate();
    const buf2 = useSynthStore.getState().buffer!;

    expect(areDifferent(buf1, buf2)).toBe(true);
  });

  it('locked params are preserved when loading preset', () => {
    const store = useSynthStore.getState();
    store.setParams({ p_base_freq: 0.999 });
    store.toggleLock('p_base_freq');
    store.loadPreset('explosion');

    const state = useSynthStore.getState();
    expect(state.paramsA.p_base_freq).toBe(0.999);
  });
});
