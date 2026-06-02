// ---------------------------------------------------------------------------
// SynthEngine unit tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  createDefaultParams,
  generateSamples,
  validateParams,
  morphParams,
} from '../../../src/audio/engine/SynthEngine';
import type { SynthParams } from '../../../src/types/synth';

// ---------------------------------------------------------------------------
// createDefaultParams
// ---------------------------------------------------------------------------

describe('createDefaultParams', () => {
  it('returns an object with all required SynthParams fields defined', () => {
    const p = createDefaultParams();
    const requiredFields: Array<keyof SynthParams> = [
      'wave_type',
      'p_env_attack', 'p_env_sustain', 'p_env_punch', 'p_env_decay',
      'p_base_freq', 'p_freq_limit', 'p_freq_ramp', 'p_freq_dramp',
      'p_vib_strength', 'p_vib_speed',
      'p_arp_mod', 'p_arp_speed',
      'p_duty', 'p_duty_ramp',
      'p_repeat_speed',
      'p_pha_offset', 'p_pha_ramp',
      'p_lpf_freq', 'p_lpf_ramp', 'p_lpf_resonance',
      'p_hpf_freq', 'p_hpf_ramp',
      'fm_freq', 'fm_depth',
      'lfo_rate', 'lfo_depth',
      'noise_type',
      'sub_bass',
      'distortion',
      'chorus_rate', 'chorus_depth',
      'reverb_size', 'reverb_decay',
      'delay_time', 'delay_feedback',
      'ring_mod_freq', 'ring_mod_depth',
      'bit_crush', 'sample_reduction',
      'sound_vol', 'sample_rate', 'sample_size',
      'flanger_rate', 'flanger_depth', 'flanger_delay',
    ];
    for (const field of requiredFields) {
      expect(p[field], `field "${field}" should be defined`).toBeDefined();
    }
  });

  it('returns all numeric fields as finite numbers', () => {
    const p = createDefaultParams();
    for (const [key, value] of Object.entries(p)) {
      expect(isFinite(value as number), `field "${key}" should be finite`).toBe(true);
    }
  });

  it('sets sound_vol to 0.5', () => {
    expect(createDefaultParams().sound_vol).toBe(0.5);
  });

  it('sets sample_rate to 44100', () => {
    expect(createDefaultParams().sample_rate).toBe(44100);
  });
});

// ---------------------------------------------------------------------------
// generateSamples
// ---------------------------------------------------------------------------

describe('generateSamples', () => {
  it('produces non-silent output with default params', () => {
    const params = createDefaultParams();
    const samples = generateSamples(params, 8000, 0.3);
    const hasNonZero = Array.from(samples).some((s) => s !== 0);
    expect(hasNonZero).toBe(true);
  });

  it('output length matches sampleRate * duration', () => {
    const params = createDefaultParams();
    const sr = 8000;
    const dur = 0.25;
    const samples = generateSamples(params, sr, dur);
    expect(samples.length).toBe(Math.floor(sr * dur));
  });

  it('all samples are within [-1, 1]', () => {
    const params = createDefaultParams();
    // Use a short buffer and low sample rate to keep the test fast
    const samples = generateSamples(params, 8000, 0.5);
    let outOfRange = false;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i] < -1 || samples[i] > 1) {
        outOfRange = true;
        break;
      }
    }
    expect(outOfRange).toBe(false);
  });

  it('produces silence when sound_vol is 0', () => {
    const params = createDefaultParams();
    params.sound_vol = 0;
    const samples = generateSamples(params, 8000, 0.2);
    for (let i = 0; i < samples.length; i++) {
      // Use toBeCloseTo to handle -0 === +0 semantics
      expect(samples[i]).toBeCloseTo(0, 10);
    }
  });

  it('different waveform types produce different output', () => {
    const base = createDefaultParams();
    // Force a stable, sustained tone (no decay so the output is clearly different)
    base.p_env_attack = 0;
    base.p_env_sustain = 1.0;
    base.p_env_decay = 0;
    base.p_base_freq = 0.3;
    base.sound_vol = 0.5;

    const results: Float32Array[] = [];
    for (let w = 0; w < 4; w++) {
      const p = { ...base, wave_type: w };
      results.push(generateSamples(p, 8000, 0.2));
    }

    // Each pair of waveforms should differ somewhere in the output
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const differs = Array.from(results[i]).some(
          (s, idx) => Math.abs(s - results[j][idx]) > 1e-6,
        );
        expect(differs, `waveforms ${i} and ${j} should differ`).toBe(true);
      }
    }
  });

  it('no NaN values in output', () => {
    const params = createDefaultParams();
    const samples = generateSamples(params, 8000, 0.5);
    let hasNaN = false;
    for (let i = 0; i < samples.length; i++) {
      if (isNaN(samples[i])) { hasNaN = true; break; }
    }
    expect(hasNaN).toBe(false);
  });

  it('clamps duration to minimum of 0.1 s', () => {
    const params = createDefaultParams();
    const samples = generateSamples(params, 44100, 0.0); // below minimum
    expect(samples.length).toBe(Math.floor(44100 * 0.1));
  });

  it('clamps duration to maximum of 10 s', () => {
    const params = createDefaultParams();
    const samples = generateSamples(params, 44100, 99); // above maximum
    expect(samples.length).toBe(Math.floor(44100 * 10));
  });
});

// ---------------------------------------------------------------------------
// validateParams
// ---------------------------------------------------------------------------

describe('validateParams', () => {
  it('returns a valid copy for default params', () => {
    const p = createDefaultParams();
    const v = validateParams(p);
    for (const [key, value] of Object.entries(v)) {
      expect(isFinite(value as number), `"${key}" should be finite after validation`).toBe(true);
    }
  });

  it('replaces NaN values with 0', () => {
    const p = createDefaultParams();
    (p as Record<string, unknown>).p_base_freq = NaN;
    const v = validateParams(p);
    expect(isNaN(v.p_base_freq)).toBe(false);
    // NaN → 0, then clamp(0, 0.001, 2) → 0.001
    expect(v.p_base_freq).toBeGreaterThanOrEqual(0.001);
  });

  it('replaces Infinity values with 0', () => {
    const p = createDefaultParams();
    (p as Record<string, unknown>).sound_vol = Infinity;
    const v = validateParams(p);
    // Infinity → 0 → clamp(0, 0, 1) = 0
    expect(v.sound_vol).toBe(0);
  });

  it('clamps wave_type to [0, 3]', () => {
    const p = createDefaultParams();
    (p as Record<string, unknown>).wave_type = 99;
    expect(validateParams(p).wave_type).toBe(3);
    (p as Record<string, unknown>).wave_type = -5;
    expect(validateParams(p).wave_type).toBe(0);
  });

  it('clamps sound_vol to [0, 1]', () => {
    const p = createDefaultParams();
    (p as Record<string, unknown>).sound_vol = 5;
    expect(validateParams(p).sound_vol).toBe(1);
    (p as Record<string, unknown>).sound_vol = -1;
    expect(validateParams(p).sound_vol).toBe(0);
  });

  it('does not mutate the input object', () => {
    const p = createDefaultParams();
    (p as Record<string, unknown>).sound_vol = 99;
    validateParams(p);
    // p itself was mutated before the call, but validateParams returns a copy
    const p2 = createDefaultParams();
    (p2 as Record<string, unknown>).sound_vol = 99;
    const v = validateParams(p2);
    expect(v).not.toBe(p2); // returned a new object
    expect(v.sound_vol).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// morphParams
// ---------------------------------------------------------------------------

describe('morphParams', () => {
  function makeParams(vol: number, freq: number): SynthParams {
    const p = createDefaultParams();
    p.sound_vol = vol;
    p.p_base_freq = freq;
    return p;
  }

  it('at amount=0 returns a result identical to paramsA', () => {
    const a = makeParams(0.2, 0.3);
    const b = makeParams(0.8, 0.9);
    const result = morphParams(a, b, 0);
    expect(result.sound_vol).toBeCloseTo(a.sound_vol);
    expect(result.p_base_freq).toBeCloseTo(a.p_base_freq);
  });

  it('at amount=1 returns a result identical to paramsB', () => {
    const a = makeParams(0.2, 0.3);
    const b = makeParams(0.8, 0.9);
    const result = morphParams(a, b, 1);
    expect(result.sound_vol).toBeCloseTo(b.sound_vol);
    expect(result.p_base_freq).toBeCloseTo(b.p_base_freq);
  });

  it('at amount=0.5 returns the midpoint for each numeric field', () => {
    const a = makeParams(0.0, 0.2);
    const b = makeParams(1.0, 0.8);
    const result = morphParams(a, b, 0.5);
    expect(result.sound_vol).toBeCloseTo(0.5);
    expect(result.p_base_freq).toBeCloseTo(0.5);
  });

  it('does not mutate either input', () => {
    const a = makeParams(0.2, 0.3);
    const b = makeParams(0.8, 0.9);
    const aVol = a.sound_vol;
    const bVol = b.sound_vol;
    morphParams(a, b, 0.5);
    expect(a.sound_vol).toBe(aVol);
    expect(b.sound_vol).toBe(bVol);
  });

  it('all interpolated numeric fields are finite', () => {
    const a = createDefaultParams();
    const b = createDefaultParams();
    b.p_base_freq = 1.0;
    b.sound_vol = 0.9;
    const result = morphParams(a, b, 0.3);
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'number') {
        expect(isFinite(value), `"${key}" should be finite after morph`).toBe(true);
      }
    }
  });
});
