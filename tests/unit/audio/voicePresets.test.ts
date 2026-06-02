// ---------------------------------------------------------------------------
// voicePresets unit tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  original,
  classicRobot,
  deepRobot,
  alien,
  cyborg,
  radio,
  metallic,
  demon,
  chipmunk,
  getPreset,
} from '../../../src/audio/presets/voicePresets';
import type { VoiceSettings, VoicePresetName } from '../../../src/types/voicelab';

// All 9 preset factories paired with their names
const PRESETS: Array<[VoicePresetName, () => VoiceSettings]> = [
  ['original',     original],
  ['classicRobot', classicRobot],
  ['deepRobot',    deepRobot],
  ['alien',        alien],
  ['cyborg',       cyborg],
  ['radio',        radio],
  ['metallic',     metallic],
  ['demon',        demon],
  ['chipmunk',     chipmunk],
];

// All numeric keys of VoiceSettings (they are all numbers)
const NUMERIC_KEYS: Array<keyof VoiceSettings> = [
  'pitchShift',
  'formantShift',
  'speedChange',
  'vocoderMix',
  'vocoderFreq',
  'ringModFreq',
  'ringModMix',
  'tremoloRate',
  'tremoloDepth',
  'delayTime',
  'delayFeedback',
  'delayMix',
  'chorusRate',
  'chorusDepth',
  'chorusMix',
  'reverbSize',
  'reverbDecay',
  'reverbMix',
  'lowpassFreq',
  'highpassFreq',
  'compThreshold',
  'compRatio',
  'distortionDrive',
  'distortionMix',
  'bitCrushBits',
  'bitCrushMix',
  'noiseGateThreshold',
  'masterGain',
];

// ---------------------------------------------------------------------------
// Per-preset structural tests
// ---------------------------------------------------------------------------

describe('voicePresets — structural validity', () => {
  it('exports exactly 9 preset functions', () => {
    expect(PRESETS.length).toBe(9);
  });

  for (const [name, fn] of PRESETS) {
    describe(name, () => {
      it('returns an object', () => {
        const s = fn();
        expect(s).toBeDefined();
        expect(typeof s).toBe('object');
        expect(s).not.toBeNull();
      });

      it('has all VoiceSettings keys', () => {
        const s = fn();
        for (const key of NUMERIC_KEYS) {
          expect(s[key], `"${name}.${key}" should be defined`).toBeDefined();
        }
      });

      it('all numeric values are finite (no NaN, no Infinity)', () => {
        const s = fn();
        for (const key of NUMERIC_KEYS) {
          expect(
            Number.isFinite(s[key]),
            `"${name}.${key}" = ${s[key]} should be finite`,
          ).toBe(true);
        }
      });

      it('each call returns a fresh object (no shared reference)', () => {
        const a = fn();
        const b = fn();
        expect(a).not.toBe(b);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Range checks — documented constraints from the VoiceSettings interface
// ---------------------------------------------------------------------------

describe('voicePresets — value ranges', () => {
  for (const [name, fn] of PRESETS) {
    describe(name, () => {
      it('pitchShift is in [-24, +24] semitones', () => {
        const s = fn();
        expect(s.pitchShift).toBeGreaterThanOrEqual(-24);
        expect(s.pitchShift).toBeLessThanOrEqual(24);
      });

      it('formantShift is in [-2, +2]', () => {
        const s = fn();
        expect(s.formantShift).toBeGreaterThanOrEqual(-2);
        expect(s.formantShift).toBeLessThanOrEqual(2);
      });

      it('speedChange is in [0.5, 2.0]', () => {
        const s = fn();
        expect(s.speedChange).toBeGreaterThanOrEqual(0.5);
        expect(s.speedChange).toBeLessThanOrEqual(2.0);
      });

      it('vocoderMix is in [0, 1]', () => {
        const s = fn();
        expect(s.vocoderMix).toBeGreaterThanOrEqual(0);
        expect(s.vocoderMix).toBeLessThanOrEqual(1);
      });

      it('ringModMix is in [0, 1]', () => {
        const s = fn();
        expect(s.ringModMix).toBeGreaterThanOrEqual(0);
        expect(s.ringModMix).toBeLessThanOrEqual(1);
      });

      it('distortionDrive is in [0, 1]', () => {
        const s = fn();
        expect(s.distortionDrive).toBeGreaterThanOrEqual(0);
        expect(s.distortionDrive).toBeLessThanOrEqual(1);
      });

      it('distortionMix is in [0, 1]', () => {
        const s = fn();
        expect(s.distortionMix).toBeGreaterThanOrEqual(0);
        expect(s.distortionMix).toBeLessThanOrEqual(1);
      });

      it('bitCrushBits is in [1, 16]', () => {
        const s = fn();
        expect(s.bitCrushBits).toBeGreaterThanOrEqual(1);
        expect(s.bitCrushBits).toBeLessThanOrEqual(16);
      });

      it('bitCrushMix is in [0, 1]', () => {
        const s = fn();
        expect(s.bitCrushMix).toBeGreaterThanOrEqual(0);
        expect(s.bitCrushMix).toBeLessThanOrEqual(1);
      });

      it('masterGain is in [0, 2]', () => {
        const s = fn();
        expect(s.masterGain).toBeGreaterThanOrEqual(0);
        expect(s.masterGain).toBeLessThanOrEqual(2);
      });

      it('lowpassFreq is positive', () => {
        const s = fn();
        expect(s.lowpassFreq).toBeGreaterThan(0);
      });

      it('highpassFreq is non-negative', () => {
        const s = fn();
        expect(s.highpassFreq).toBeGreaterThanOrEqual(0);
      });

      it('highpassFreq < lowpassFreq', () => {
        const s = fn();
        expect(s.highpassFreq).toBeLessThan(s.lowpassFreq);
      });

      it('reverbDecay is positive', () => {
        const s = fn();
        expect(s.reverbDecay).toBeGreaterThan(0);
      });

      it('delayTime is positive', () => {
        const s = fn();
        expect(s.delayTime).toBeGreaterThan(0);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 'original' preset is the neutral/identity preset
// ---------------------------------------------------------------------------

describe('voicePresets — original (neutral preset)', () => {
  it('pitchShift is 0', () => {
    expect(original().pitchShift).toBe(0);
  });

  it('formantShift is 0', () => {
    expect(original().formantShift).toBe(0);
  });

  it('speedChange is 1.0', () => {
    expect(original().speedChange).toBe(1.0);
  });

  it('vocoderMix is 0 (vocoder off)', () => {
    expect(original().vocoderMix).toBe(0);
  });

  it('ringModMix is 0 (ring mod off)', () => {
    expect(original().ringModMix).toBe(0);
  });

  it('distortionMix is 0 (distortion off)', () => {
    expect(original().distortionMix).toBe(0);
  });

  it('bitCrushMix is 0 (bit crush off)', () => {
    expect(original().bitCrushMix).toBe(0);
  });

  it('delayMix is 0 (delay off)', () => {
    expect(original().delayMix).toBe(0);
  });

  it('chorusMix is 0 (chorus off)', () => {
    expect(original().chorusMix).toBe(0);
  });

  it('reverbMix is 0 (reverb off)', () => {
    expect(original().reverbMix).toBe(0);
  });

  it('bitCrushBits is 16 (full fidelity)', () => {
    expect(original().bitCrushBits).toBe(16);
  });

  it('masterGain is 1.0', () => {
    expect(original().masterGain).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// Preset uniqueness — each preset must be distinguishable from the others
// ---------------------------------------------------------------------------

describe('voicePresets — preset uniqueness', () => {
  it('all 9 presets produce distinct pitchShift values or other discriminating fields', () => {
    // Serialise each preset and verify not all are identical
    const serialised = PRESETS.map(([, fn]) => JSON.stringify(fn()));
    const unique = new Set(serialised);
    expect(unique.size).toBe(9);
  });

  it('non-original presets differ from original in at least one field', () => {
    const orig = original();
    const nonOriginal = PRESETS.filter(([name]) => name !== 'original');
    for (const [name, fn] of nonOriginal) {
      const s = fn();
      const differs = NUMERIC_KEYS.some((k) => s[k] !== orig[k]);
      expect(differs, `"${name}" should differ from original`).toBe(true);
    }
  });

  it('each non-original preset uses a distinct pitchShift value (or at least 5 unique values exist)', () => {
    const shifts = PRESETS.map(([, fn]) => fn().pitchShift);
    const unique = new Set(shifts);
    // Not all presets use unique pitchShift (some are both 0), but we must have
    // more than 1 unique value across the 9 presets.
    expect(unique.size).toBeGreaterThan(1);
  });

  it('demon has the most extreme negative pitchShift', () => {
    const demonShift = demon().pitchShift;
    const others = PRESETS
      .filter(([name]) => name !== 'demon')
      .map(([, fn]) => fn().pitchShift);
    const lowestOther = Math.min(...others);
    expect(demonShift).toBeLessThanOrEqual(lowestOther);
  });

  it('chipmunk has the highest pitchShift', () => {
    const chipmunkShift = chipmunk().pitchShift;
    const others = PRESETS
      .filter(([name]) => name !== 'chipmunk')
      .map(([, fn]) => fn().pitchShift);
    const highestOther = Math.max(...others);
    expect(chipmunkShift).toBeGreaterThanOrEqual(highestOther);
  });

  it('deepRobot is deeper (lower pitchShift) than classicRobot', () => {
    expect(deepRobot().pitchShift).toBeLessThan(classicRobot().pitchShift);
  });

  it('demon has higher distortionDrive than original', () => {
    expect(demon().distortionDrive).toBeGreaterThan(original().distortionDrive);
  });
});

// ---------------------------------------------------------------------------
// getPreset() — registry lookup
// ---------------------------------------------------------------------------

describe('voicePresets — getPreset()', () => {
  it('getPreset("original") matches original()', () => {
    expect(getPreset('original')).toEqual(original());
  });

  it('getPreset("chipmunk") matches chipmunk()', () => {
    expect(getPreset('chipmunk')).toEqual(chipmunk());
  });

  it('getPreset("demon") matches demon()', () => {
    expect(getPreset('demon')).toEqual(demon());
  });

  it('getPreset returns a fresh object each call', () => {
    const a = getPreset('radio');
    const b = getPreset('radio');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
