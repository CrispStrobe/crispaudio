// ---------------------------------------------------------------------------
// CrispAudio — SynthEngine
// Ported from crispfxr-app/src/App.js — AudioSynthesizer class
//
// Design changes vs. the original:
//   • generateSamples() is a pure function — no AudioContext dependency.
//   • Distortion bug fixed: tanh soft-clip does NOT divide by drive after
//     the clamp (dividing by drive cancels the effect and introduces artefacts).
//   • All console.log calls removed.
//   • Full TypeScript types throughout.
// ---------------------------------------------------------------------------

import { type SynthParams, type PresetName } from '../../types/synth';
import { ALL_PRESET_NAMES } from '../../types/synth';
import * as presets from '../presets/sfxPresets';

// ---------------------------------------------------------------------------
// Waveform integer constants (kept internal — public API uses WaveformType)
// ---------------------------------------------------------------------------
const SQUARE = 0;
const SAWTOOTH = 1;
const SINE = 2;
const NOISE = 3;

// ---------------------------------------------------------------------------
// Default parameters factory
// ---------------------------------------------------------------------------

/** Return a SynthParams object populated with the default values. */
export function createDefaultParams(): SynthParams {
  return {
    wave_type: SQUARE,
    p_env_attack: 0,
    p_env_sustain: 0.3,
    p_env_punch: 0,
    p_env_decay: 0.4,
    p_base_freq: 0.3,
    p_freq_limit: 0,
    p_freq_ramp: 0,
    p_freq_dramp: 0,
    p_vib_strength: 0,
    p_vib_speed: 0,
    p_arp_mod: 0,
    p_arp_speed: 0,
    p_duty: 0,
    p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 1,
    p_lpf_ramp: 0,
    p_lpf_resonance: 0,
    p_hpf_freq: 0,
    p_hpf_ramp: 0,
    fm_freq: 0,
    fm_depth: 0,
    lfo_rate: 0,
    lfo_depth: 0,
    noise_type: 0,
    sub_bass: 0,
    distortion: 0,
    chorus_rate: 0,
    chorus_depth: 0,
    reverb_size: 0,
    reverb_decay: 0,
    delay_time: 0,
    delay_feedback: 0,
    ring_mod_freq: 0,
    ring_mod_depth: 0,
    bit_crush: 0,
    sample_reduction: 0,
    sound_vol: 0.5,
    sample_rate: 44100,
    sample_size: 16,
    flanger_rate: 0,
    flanger_depth: 0,
    flanger_delay: 0.5,
  };
}

// ---------------------------------------------------------------------------
// Parameter validation helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}

/** Clamp and sanitise all SynthParams fields, returning a validated copy. */
export function validateParams(p: SynthParams): SynthParams {
  const out: SynthParams = { ...p };

  // Validate every numeric field
  for (const key of Object.keys(out) as Array<keyof SynthParams>) {
    const v = out[key] as number;
    if (typeof v === 'number' && (!isFinite(v) || isNaN(v))) {
      (out as unknown as Record<string, number>)[key] = 0;
    }
  }

  out.wave_type = clampInt(out.wave_type, 0, 3);
  out.noise_type = clampInt(out.noise_type, 0, 2);
  out.p_env_attack = clamp(out.p_env_attack, 0, 3);
  out.p_env_sustain = clamp(out.p_env_sustain, 0, 3);
  out.p_env_decay = clamp(out.p_env_decay, 0, 3);
  out.p_env_punch = clamp(out.p_env_punch, 0, 3);
  out.p_base_freq = clamp(out.p_base_freq, 0.001, 2);
  out.p_freq_limit = clamp(out.p_freq_limit, 0, 1);
  out.p_freq_ramp = clamp(out.p_freq_ramp, -1, 1);
  out.p_freq_dramp = clamp(out.p_freq_dramp, -1, 1);
  out.p_vib_strength = clamp(out.p_vib_strength, 0, 1);
  out.p_vib_speed = clamp(out.p_vib_speed, 0, 1);
  out.p_arp_mod = clamp(out.p_arp_mod, -1, 1);
  out.p_arp_speed = clamp(out.p_arp_speed, 0, 1);
  out.p_duty = clamp(out.p_duty, -1, 1);
  out.p_duty_ramp = clamp(out.p_duty_ramp, -1, 1);
  out.p_repeat_speed = clamp(out.p_repeat_speed, 0, 1);
  out.p_pha_offset = clamp(out.p_pha_offset, -1, 1);
  out.p_pha_ramp = clamp(out.p_pha_ramp, -1, 1);
  out.p_lpf_freq = clamp(out.p_lpf_freq, 0, 1);
  out.p_lpf_ramp = clamp(out.p_lpf_ramp, -1, 1);
  out.p_lpf_resonance = clamp(out.p_lpf_resonance, 0, 1);
  out.p_hpf_freq = clamp(out.p_hpf_freq, 0, 1);
  out.p_hpf_ramp = clamp(out.p_hpf_ramp, -1, 1);
  out.fm_freq = clamp(out.fm_freq, 0, 1);
  out.fm_depth = clamp(out.fm_depth, 0, 1);
  out.lfo_rate = clamp(out.lfo_rate, 0, 1);
  out.lfo_depth = clamp(out.lfo_depth, 0, 1);
  out.sub_bass = clamp(out.sub_bass, 0, 1);
  out.distortion = clamp(out.distortion, 0, 1);
  out.chorus_rate = clamp(out.chorus_rate, 0, 1);
  out.chorus_depth = clamp(out.chorus_depth, 0, 1);
  out.reverb_size = clamp(out.reverb_size, 0, 1);
  out.reverb_decay = clamp(out.reverb_decay, 0, 1);
  out.delay_time = clamp(out.delay_time, 0, 1);
  out.delay_feedback = clamp(out.delay_feedback, 0, 1);
  out.ring_mod_freq = clamp(out.ring_mod_freq, 0, 1);
  out.ring_mod_depth = clamp(out.ring_mod_depth, 0, 1);
  out.bit_crush = clamp(out.bit_crush, 0, 1);
  out.sample_reduction = clamp(out.sample_reduction, 0, 1);
  out.sound_vol = clamp(out.sound_vol, 0, 1);
  out.flanger_rate = clamp(out.flanger_rate, 0, 1);
  out.flanger_depth = clamp(out.flanger_depth, 0, 1);
  out.flanger_delay = clamp(out.flanger_delay, 0.1, 1);

  return out;
}

// ---------------------------------------------------------------------------
// Morphing
// ---------------------------------------------------------------------------

/**
 * Linearly interpolate every numeric field of `a` toward `b` by `amount` (0..1).
 * Returns a new SynthParams without mutating the inputs.
 */
export function morphParams(a: SynthParams, b: SynthParams, amount: number): SynthParams {
  const result: SynthParams = { ...a };
  for (const key of Object.keys(result) as Array<keyof SynthParams>) {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'number' && typeof bv === 'number') {
      (result as unknown as Record<string, number>)[key] = av + (bv - av) * amount;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pure noise generators
// ---------------------------------------------------------------------------

function generateNoise(type: number, length: number): Float32Array {
  const noise = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b6 = 0;

  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    switch (type) {
      case 0: // White
        noise[i] = white;
        break;
      case 1: // Pink (Paul Kellet's filter)
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        noise[i] = b0 + b1 + b2 + white * 0.3104856;
        break;
      case 2: // Brown
        b6 = (b6 + white * 0.02) * 0.996;
        noise[i] = b6 * 3.5;
        break;
      default:
        noise[i] = white;
    }
  }
  return noise;
}

// ---------------------------------------------------------------------------
// Effect helpers
// ---------------------------------------------------------------------------

/**
 * Soft-clip distortion via tanh.
 *
 * BUG FIX: the original code divided by `drive` after tanh, which largely
 * cancels the effect and makes the output quieter than a clean signal at the
 * same amplitude. The correct behaviour is a straight tanh saturator — the
 * increased drive raises input amplitude before the non-linearity, then the
 * output is normalised back by 1/tanh(drive) to keep perceived loudness
 * consistent without losing the harmonic content.
 */
function applyDistortion(sample: number, amount: number): number {
  if (amount <= 0) return sample;
  const drive = 1 + amount * 10;
  // Normalise output level so unity-gain at drive=1 is preserved
  return Math.tanh(sample * drive) / Math.tanh(drive);
}

function applyBitCrush(sample: number, amount: number): number {
  if (amount <= 0) return sample;
  const bits = Math.floor(16 - amount * 15);
  const levels = Math.pow(2, bits);
  return Math.floor(sample * levels) / levels;
}

// ---------------------------------------------------------------------------
// Core synthesis — pure function
// ---------------------------------------------------------------------------

/**
 * Synthesise audio from a SynthParams descriptor.
 *
 * @param params   Synthesis parameters (will be validated internally).
 * @param sampleRate Output sample rate in Hz (default 44100).
 * @param duration Output duration in seconds (default 1.0, clamped 0.1–10).
 * @returns Float32Array of interleaved mono samples in the range [-1, 1].
 */
export function generateSamples(
  params: SynthParams,
  sampleRate = 44100,
  duration = 1.0,
): Float32Array {
  const p = validateParams(params);
  const safeDuration = clamp(duration, 0.1, 10);
  const length = Math.floor(sampleRate * safeDuration);
  const data = new Float32Array(length);

  // --- Pre-compute noise buffer if needed ---
  let noise: Float32Array | null = null;
  if (p.wave_type === NOISE) {
    noise = generateNoise(p.noise_type, length);
  }

  // --- Delay line ---
  const maxDelaySize = Math.floor(sampleRate * 0.5);
  const delayBuffer = new Float32Array(maxDelaySize);
  let delayIndex = 0;

  // --- Chorus delay line ---
  const maxChorusSize = Math.floor(sampleRate * 0.02);
  const chorusDelay = new Float32Array(maxChorusSize);
  let chorusIndex = 0;

  // --- Flanger delay line ---
  const maxFlangerSize = Math.floor(sampleRate * 0.02);
  const flangerBuffer = new Float32Array(maxFlangerSize);
  let flangerIndex = 0;

  // --- Envelope timing (samples) ---
  const attackSamples = Math.floor(p.p_env_attack * sampleRate);
  const sustainSamples = Math.floor(p.p_env_sustain * sampleRate);
  const decaySamples = Math.floor(p.p_env_decay * sampleRate);

  // --- State variables ---
  let phase = 0;
  let subPhase = 0;
  let fmPhase = 0;
  let frequency = p.p_base_freq * 440;
  let dutyCycle = clamp(0.5 - p.p_duty * 0.5, 0.01, 0.99);
  let arpTime = 0;
  let arpValue = 1;

  // --- Main sample loop ---
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;

    // ---- Envelope ----
    let envelope: number;
    if (i < attackSamples) {
      envelope = attackSamples > 0 ? i / attackSamples : 1;
    } else if (i < attackSamples + sustainSamples) {
      const sustainProgress = sustainSamples > 0
        ? (i - attackSamples) / sustainSamples
        : 0;
      envelope = 1 + (1 - sustainProgress) * 2 * p.p_env_punch;
    } else if (i < attackSamples + sustainSamples + decaySamples) {
      const decayProgress = decaySamples > 0
        ? (i - attackSamples - sustainSamples) / decaySamples
        : 1;
      envelope = Math.max(0, 1 - decayProgress);
    } else {
      envelope = 0;
    }

    // ---- Retrigger ----
    if (p.p_repeat_speed > 0) {
      const retriggerRate = p.p_repeat_speed * 20;
      const retriggerPeriod = sampleRate / retriggerRate;
      const retriggerPhase = (i % retriggerPeriod) / retriggerPeriod;
      if (retriggerPhase < 0.1) {
        envelope *= retriggerPhase / 0.1;
      }
    }

    // ---- Arpeggio ----
    if (p.p_arp_speed > 0) {
      arpTime += p.p_arp_speed * 50 / sampleRate;
      if (arpTime >= 1) {
        arpTime = 0;
        arpValue = 1 + p.p_arp_mod * (Math.random() * 2 - 1);
      }
    }

    // ---- Frequency ramp ----
    frequency += p.p_freq_ramp * 10;
    frequency = clamp(frequency, 20, 20000);

    let currentFreq = frequency * clamp(arpValue, 0.1, 10);

    // ---- FM ----
    if (p.fm_depth > 0 && p.fm_freq > 0) {
      fmPhase += (2 * Math.PI * p.fm_freq * 50) / sampleRate;
      if (fmPhase > 2 * Math.PI) fmPhase -= 2 * Math.PI;
      currentFreq += Math.sin(fmPhase) * p.fm_depth * 100;
    }

    // ---- LFO ----
    if (p.lfo_depth > 0 && p.lfo_rate > 0) {
      const lfo = Math.sin(2 * Math.PI * p.lfo_rate * 5 * t);
      currentFreq += lfo * p.lfo_depth * 50;
    }

    // ---- Vibrato ----
    if (p.p_vib_strength > 0 && p.p_vib_speed > 0) {
      const vibrato = Math.sin(2 * Math.PI * p.p_vib_speed * 50 * t);
      currentFreq += vibrato * p.p_vib_strength * currentFreq * 0.1;
    }

    // ---- Duty ramp ----
    if (p.p_duty_ramp !== 0) {
      dutyCycle += p.p_duty_ramp * 0.0001;
      dutyCycle = clamp(dutyCycle, 0.01, 0.99);
    }

    currentFreq = clamp(currentFreq, 20, 20000);
    phase += (2 * Math.PI * currentFreq) / sampleRate;
    if (phase > 2 * Math.PI) phase -= 2 * Math.PI;

    // ---- Oscillator ----
    let sample: number;
    switch (p.wave_type) {
      case SQUARE:
        sample = (phase / (2 * Math.PI)) < dutyCycle ? 1 : -1;
        break;
      case SAWTOOTH:
        sample = (phase / Math.PI) - 1;
        break;
      case SINE:
        sample = Math.sin(phase);
        break;
      case NOISE:
        sample = noise !== null ? noise[i] : (Math.random() * 2 - 1);
        break;
      default:
        sample = Math.sin(phase);
    }

    sample = clamp(sample, -1, 1);

    // ---- Sub-bass ----
    if (p.sub_bass > 0) {
      subPhase += (Math.PI * currentFreq) / sampleRate;
      if (subPhase > 2 * Math.PI) subPhase -= 2 * Math.PI;
      sample += Math.sin(subPhase) * p.sub_bass * 0.5;
    }

    // ---- Ring modulator ----
    if (p.ring_mod_depth > 0 && p.ring_mod_freq > 0) {
      const ringOsc = Math.sin(2 * Math.PI * p.ring_mod_freq * 200 * t);
      sample *= 1 - p.ring_mod_depth + p.ring_mod_depth * ringOsc;
    }

    // ---- Low-pass filter (1-pole IIR) ----
    if (p.p_lpf_freq < 1) {
      const cutoff = clamp(p.p_lpf_freq, 0, 1);
      const prevSample = i > 0 ? data[i - 1] : 0;
      sample = sample * cutoff + (1 - cutoff) * prevSample;
    }

    // ---- High-pass filter ----
    if (p.p_hpf_freq > 0) {
      const prevSample = i > 0 ? data[i - 1] : 0;
      sample = sample - prevSample * clamp(p.p_hpf_freq, 0, 1);
    }

    // ---- Distortion (bug-fixed) ----
    if (p.distortion > 0) {
      sample = applyDistortion(sample, p.distortion);
    }

    // ---- Bit crush ----
    if (p.bit_crush > 0) {
      sample = applyBitCrush(sample, p.bit_crush);
    }

    // ---- Chorus ----
    if (p.chorus_rate > 0 && p.chorus_depth > 0) {
      const chorusLfo = Math.sin(2 * Math.PI * p.chorus_rate * 5 * t);
      const chorusDelayTime = Math.floor(
        0.01 * sampleRate + chorusLfo * 0.005 * sampleRate,
      );
      const chorusDelayedIndex =
        (chorusIndex - clamp(chorusDelayTime, 1, maxChorusSize - 1) + maxChorusSize) %
        maxChorusSize;
      sample += (chorusDelay[chorusDelayedIndex] ?? 0) * p.chorus_depth * 0.3;
      chorusDelay[chorusIndex] = sample;
      chorusIndex = (chorusIndex + 1) % maxChorusSize;
    }

    // ---- Delay ----
    if (p.delay_time > 0) {
      const delayTimeInSamples = Math.floor(p.delay_time * sampleRate * 0.3);
      const delayedIndex =
        (delayIndex - clamp(delayTimeInSamples, 1, maxDelaySize - 1) + maxDelaySize) %
        maxDelaySize;
      sample += (delayBuffer[delayedIndex] ?? 0) * p.delay_feedback * 0.5;
      delayBuffer[delayIndex] = sample;
      delayIndex = (delayIndex + 1) % maxDelaySize;
    }

    // ---- Flanger ----
    if (p.flanger_rate > 0 && p.flanger_depth > 0) {
      const flangerLfo = Math.sin(2 * Math.PI * p.flanger_rate * t);
      const baseDelay = Math.floor(p.flanger_delay * 0.01 * sampleRate);
      const modDelay = Math.floor(flangerLfo * p.flanger_depth * 0.005 * sampleRate);
      const totalDelay = clamp(baseDelay + modDelay, 1, maxFlangerSize - 1);
      const flangerDelayedIndex = (flangerIndex - totalDelay + maxFlangerSize) % maxFlangerSize;
      sample += (flangerBuffer[flangerDelayedIndex] ?? 0) * 0.3;
      flangerBuffer[flangerIndex] = sample;
      flangerIndex = (flangerIndex + 1) % maxFlangerSize;
    }

    // ---- Final mix ----
    sample = clamp(sample, -1, 1);
    envelope = clamp(envelope, 0, 1);

    const finalSample = sample * envelope * p.sound_vol * 0.3;
    data[i] = clamp(isNaN(finalSample) ? 0 : finalSample, -1, 1);
  }

  return data;
}

// ---------------------------------------------------------------------------
// AudioContext-dependent playback helper
// ---------------------------------------------------------------------------

/**
 * Wrap a Float32Array of samples in an AudioBuffer.
 * Requires a live AudioContext (call from browser event handler).
 */
export function samplesToAudioBuffer(
  ctx: AudioContext,
  samples: Float32Array,
): AudioBuffer {
  const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  return buf;
}

/**
 * Play a Float32Array of samples through an AudioContext.
 * Returns the AudioBufferSourceNode so the caller can attach event handlers or
 * call .stop() if needed.
 */
export function playSamples(
  ctx: AudioContext,
  samples: Float32Array,
  destination: AudioNode = ctx.destination,
): AudioBufferSourceNode {
  const buf = samplesToAudioBuffer(ctx, samples);
  const source = ctx.createBufferSource();
  source.buffer = buf;
  source.connect(destination);
  source.start();
  return source;
}

// ---------------------------------------------------------------------------
// Preset dispatcher
// ---------------------------------------------------------------------------

/**
 * Load a named preset and return a fresh SynthParams object.
 * Equivalent to calling `new SynthParams().presetName()` in the original code.
 */
export function loadPreset(name: PresetName): SynthParams {
  const presetMap: Record<PresetName, () => SynthParams> = {
    pickupCoin: presets.pickupCoin,
    laserShoot: presets.laserShoot,
    explosion: presets.explosion,
    powerUp: presets.powerUp,
    hitHurt: presets.hitHurt,
    jump: presets.jump,
    ambient: presets.ambient,
    random: presets.random,
    blipSelect: presets.blipSelect,
    zapElectric: presets.zapElectric,
    wooshWind: presets.wooshWind,
    droneBuzz: presets.droneBuzz,
    clickUI: presets.clickUI,
    glitchDigital: presets.glitchDigital,
    portalWarp: presets.portalWarp,
    warningAlarm: presets.warningAlarm,
  };
  return presetMap[name]();
}

export { ALL_PRESET_NAMES };
