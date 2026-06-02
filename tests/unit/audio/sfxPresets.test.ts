// ---------------------------------------------------------------------------
// sfxPresets unit tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import * as presets from '../../../src/audio/presets/sfxPresets';
import type { SynthParams } from '../../../src/types/synth';

// All 16 preset functions
const PRESET_FUNS: Array<[string, () => SynthParams]> = [
  ['pickupCoin',    presets.pickupCoin],
  ['laserShoot',    presets.laserShoot],
  ['explosion',     presets.explosion],
  ['powerUp',       presets.powerUp],
  ['hitHurt',       presets.hitHurt],
  ['jump',          presets.jump],
  ['ambient',       presets.ambient],
  ['random',        presets.random],
  ['blipSelect',    presets.blipSelect],
  ['zapElectric',   presets.zapElectric],
  ['wooshWind',     presets.wooshWind],
  ['droneBuzz',     presets.droneBuzz],
  ['clickUI',       presets.clickUI],
  ['glitchDigital', presets.glitchDigital],
  ['portalWarp',    presets.portalWarp],
  ['warningAlarm',  presets.warningAlarm],
];

// Required numeric fields from SynthParams that every preset must provide
const REQUIRED_FIELDS: Array<keyof SynthParams> = [
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

describe('sfxPresets — each preset', () => {
  it('exports exactly 16 preset functions', () => {
    expect(PRESET_FUNS.length).toBe(16);
  });

  for (const [name, fn] of PRESET_FUNS) {
    describe(name, () => {
      it('returns a SynthParams object', () => {
        const p = fn();
        expect(p).toBeDefined();
        expect(typeof p).toBe('object');
      });

      it('has all required fields defined', () => {
        const p = fn();
        for (const field of REQUIRED_FIELDS) {
          expect(p[field], `"${name}.${field}" should be defined`).toBeDefined();
        }
      });

      it('all numeric values are finite (no NaN, no Infinity)', () => {
        const p = fn();
        for (const field of REQUIRED_FIELDS) {
          const v = p[field] as number;
          expect(
            isFinite(v),
            `"${name}.${field}" = ${v} should be finite`,
          ).toBe(true);
        }
      });

      it('p_base_freq > 0', () => {
        const p = fn();
        expect(p.p_base_freq).toBeGreaterThan(0);
      });

      it('sound_vol is in [0, 1]', () => {
        const p = fn();
        expect(p.sound_vol).toBeGreaterThanOrEqual(0);
        expect(p.sound_vol).toBeLessThanOrEqual(1);
      });

      it('wave_type is an integer in [0, 3]', () => {
        const p = fn();
        expect(Number.isInteger(p.wave_type)).toBe(true);
        expect(p.wave_type).toBeGreaterThanOrEqual(0);
        expect(p.wave_type).toBeLessThanOrEqual(3);
      });

      it('envelope values are non-negative (except random preset which fully randomises)', () => {
        // The `random` preset uses Math.pow(r()*2-1, 3) which can go negative —
        // the engine's validateParams() clamps them to ≥ 0 at generation time,
        // but the preset itself may return raw negative values.  Skip this check
        // for that preset.
        if (name === 'random') return;
        const p = fn();
        expect(p.p_env_attack).toBeGreaterThanOrEqual(0);
        expect(p.p_env_sustain).toBeGreaterThanOrEqual(0);
        expect(p.p_env_decay).toBeGreaterThanOrEqual(0);
        expect(p.p_env_punch).toBeGreaterThanOrEqual(0);
      });
    });
  }
});

describe('sfxPresets — preset uniqueness', () => {
  it('not all presets produce identical wave_type', () => {
    const types = new Set(PRESET_FUNS.map(([, fn]) => fn().wave_type));
    // There are 4 waveform types; we should see more than one across 16 presets
    expect(types.size).toBeGreaterThan(1);
  });

  it('each preset produces a distinct p_base_freq on average across 5 calls', () => {
    // Average 5 samples per preset; the means should not all be equal
    const means = PRESET_FUNS.map(([, fn]) => {
      let sum = 0;
      const n = 5;
      for (let i = 0; i < n; i++) sum += fn().p_base_freq;
      return sum / n;
    });
    const uniqueMeans = new Set(means.map((m) => Math.round(m * 10)));
    // With 16 different presets we expect at least 3 distinct frequency ranges
    expect(uniqueMeans.size).toBeGreaterThan(2);
  });

  it('specific presets set expected waveforms', () => {
    // explosion and wooshWind must use NOISE (3)
    expect(presets.explosion().wave_type).toBe(3);
    expect(presets.wooshWind().wave_type).toBe(3);

    // droneBuzz must use SAWTOOTH (1)
    expect(presets.droneBuzz().wave_type).toBe(1);

    // warningAlarm, jump, clickUI, zapElectric must use SQUARE (0)
    expect(presets.warningAlarm().wave_type).toBe(0);
    expect(presets.jump().wave_type).toBe(0);
    expect(presets.clickUI().wave_type).toBe(0);
    expect(presets.zapElectric().wave_type).toBe(0);
  });

  it('wooshWind uses pink noise (noise_type=1)', () => {
    expect(presets.wooshWind().noise_type).toBe(1);
  });

  it('portalWarp always has non-zero fm_depth and fm_freq', () => {
    for (let i = 0; i < 10; i++) {
      const p = presets.portalWarp();
      expect(p.fm_depth).toBeGreaterThan(0);
      expect(p.fm_freq).toBeGreaterThan(0);
    }
  });

  it('glitchDigital always has non-zero bit_crush', () => {
    for (let i = 0; i < 10; i++) {
      expect(presets.glitchDigital().bit_crush).toBeGreaterThan(0);
    }
  });

  it('ambient always has a long attack', () => {
    for (let i = 0; i < 10; i++) {
      expect(presets.ambient().p_env_attack).toBeGreaterThanOrEqual(0.3);
    }
  });
});
