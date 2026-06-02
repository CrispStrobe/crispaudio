// ---------------------------------------------------------------------------
// CrispAudio — SFX presets
// Ported from crispfxr-app/src/App.js — SynthParams preset methods
//
// Every function returns a brand-new SynthParams object seeded from the
// default values, then randomised according to the original algorithm.
// The names are mapped to the PresetName union in types/synth.ts:
//   pickupCoin   → pickupCoin()
//   laserShoot   → laserShoot()
//   explosion    → explosion()
//   powerUp      → powerUp()
//   hitHurt      → hitHurt()
//   jump         → jump()
//   ambient      → ambient()
//   random       → random()
//   blipSelect   → blipSelect()    (original: blip)
//   zapElectric  → zapElectric()   (original: zap)
//   wooshWind    → wooshWind()     (original: woosh)
//   droneBuzz    → droneBuzz()     (original: drone)
//   clickUI      → clickUI()       (original: click)
//   glitchDigital→ glitchDigital() (original: glitch)
//   portalWarp   → portalWarp()    (original: portal)
//   warningAlarm → warningAlarm()  (original: warning)
// ---------------------------------------------------------------------------

import { type SynthParams } from '../../types/synth';
import { createDefaultParams } from '../engine/SynthEngine';

// Waveform integer constants (match original SQUARE/SAWTOOTH/SINE/NOISE)
const SQUARE = 0;
const SAWTOOTH = 1;
const SINE = 2;
const NOISE = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function r(): number {
  return Math.random();
}

function base(): SynthParams {
  return createDefaultParams();
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/** Coin pickup / treasure collect sound. */
export function pickupCoin(): SynthParams {
  const p = base();
  p.wave_type = SAWTOOTH;
  p.p_base_freq = 0.4 + r() * 0.5;
  p.p_env_attack = 0;
  p.p_env_sustain = r() * 0.1;
  p.p_env_decay = 0.1 + r() * 0.4;
  p.p_env_punch = 0.3 + r() * 0.3;
  if (r() > 0.5) {
    p.p_arp_speed = 0.5 + r() * 0.2;
    p.p_arp_mod = 0.2 + r() * 0.4;
  }
  return p;
}

/** Sci-fi laser / phaser shot. */
export function laserShoot(): SynthParams {
  const p = base();
  p.wave_type = Math.floor(r() * 3);
  p.p_base_freq = 0.3 + r() * 0.6;
  p.p_freq_ramp = -0.35 - r() * 0.3;
  p.p_env_attack = 0;
  p.p_env_sustain = 0.1 + r() * 0.2;
  p.p_env_decay = r() * 0.4;
  p.p_hpf_freq = r() * 0.3;
  p.distortion = r() * 0.3;
  return p;
}

/** Explosion / boom / impact. */
export function explosion(): SynthParams {
  const p = base();
  p.wave_type = NOISE;
  p.noise_type = 0;
  p.p_base_freq = Math.pow(0.1 + r() * 0.4, 2);
  p.p_freq_ramp = -0.1 + r() * 0.4;
  p.p_env_attack = 0;
  p.p_env_sustain = 0.1 + r() * 0.3;
  p.p_env_decay = r() * 0.5;
  p.p_env_punch = 0.2 + r() * 0.6;
  p.distortion = 0.2 + r() * 0.5;
  p.reverb_size = r() * 0.4;
  if (r() > 0.5) {
    p.p_pha_offset = -0.3 + r() * 0.9;
    p.p_pha_ramp = -r() * 0.3;
  }
  return p;
}

/** Power-up / level-up fanfare. */
export function powerUp(): SynthParams {
  const p = base();
  p.wave_type = r() > 0.5 ? SAWTOOTH : SQUARE;
  p.p_base_freq = 0.2 + r() * 0.3;
  p.p_freq_ramp = 0.1 + r() * 0.4;
  p.p_env_attack = 0;
  p.p_env_sustain = r() * 0.4;
  p.p_env_decay = 0.1 + r() * 0.4;
  p.chorus_rate = r() * 0.3;
  p.chorus_depth = r() * 0.2;
  return p;
}

/** Hit / hurt / damage. */
export function hitHurt(): SynthParams {
  const p = base();
  p.wave_type = Math.floor(r() * 3);
  if (p.wave_type === SINE) p.wave_type = NOISE;
  p.p_base_freq = 0.2 + r() * 0.6;
  p.p_freq_ramp = -0.3 - r() * 0.4;
  p.p_env_attack = 0;
  p.p_env_sustain = r() * 0.1;
  p.p_env_decay = 0.1 + r() * 0.2;
  if (r() > 0.5) p.p_hpf_freq = r() * 0.3;
  p.distortion = r() * 0.4;
  return p;
}

/** Character jump. */
export function jump(): SynthParams {
  const p = base();
  p.wave_type = SQUARE;
  p.p_duty = r() * 0.6;
  p.p_base_freq = 0.3 + r() * 0.3;
  p.p_freq_ramp = 0.1 + r() * 0.2;
  p.p_env_attack = 0;
  p.p_env_sustain = 0.1 + r() * 0.3;
  p.p_env_decay = 0.1 + r() * 0.2;
  if (r() > 0.5) p.p_hpf_freq = r() * 0.3;
  if (r() > 0.5) p.p_lpf_freq = 1 - r() * 0.6;
  return p;
}

/** Ambient / atmospheric drone. */
export function ambient(): SynthParams {
  const p = base();
  p.wave_type = SINE;
  p.p_base_freq = 0.1 + r() * 0.3;
  p.p_env_attack = 0.3 + r() * 0.5;
  p.p_env_sustain = 0.5 + r() * 0.5;
  p.p_env_decay = 0.3 + r() * 0.7;
  p.fm_freq = r() * 0.3;
  p.fm_depth = r() * 0.4;
  p.reverb_size = 0.6 + r() * 0.4;
  p.reverb_decay = 0.5 + r() * 0.5;
  p.p_lpf_freq = 0.3 + r() * 0.4;
  return p;
}

/** Fully random sound (every parameter randomised). */
export function random(): SynthParams {
  const p = base();
  p.wave_type = Math.floor(r() * 4);
  p.p_base_freq = Math.pow(r(), 2);
  p.p_freq_ramp = Math.pow(r() * 2 - 1, 5);
  p.p_env_attack = Math.pow(r() * 2 - 1, 3);
  p.p_env_sustain = Math.pow(r() * 2 - 1, 2);
  p.p_env_decay = r() * 2 - 1;
  p.p_env_punch = Math.pow(r() * 0.8, 2);
  p.p_duty = r() * 2 - 1;
  p.p_duty_ramp = Math.pow(r() * 2 - 1, 3);
  p.p_vib_strength = Math.pow(r() * 2 - 1, 3);
  p.p_vib_speed = r() * 2 - 1;
  p.p_arp_mod = r() * 2 - 1;
  p.p_arp_speed = r() * 2 - 1;
  p.p_lpf_freq = 1 - Math.pow(r(), 3);
  p.p_lpf_ramp = Math.pow(r() * 2 - 1, 3);
  p.p_hpf_freq = Math.pow(r(), 5);
  p.p_hpf_ramp = Math.pow(r() * 2 - 1, 5);
  p.distortion = r() * 0.4;
  p.reverb_size = r() * 0.5;
  return p;
}

/** Short blip / menu selection / UI confirm. */
export function blipSelect(): SynthParams {
  const p = base();
  p.wave_type = SINE;
  p.p_base_freq = 0.5 + r() * 0.3;
  p.p_env_attack = 0;
  p.p_env_sustain = 0.01 + r() * 0.05;
  p.p_env_decay = 0.1 + r() * 0.2;
  p.p_freq_ramp = 0.1 + r() * 0.3;
  return p;
}

/** Electric zap / spark / taser. */
export function zapElectric(): SynthParams {
  const p = base();
  p.wave_type = SQUARE;
  p.p_base_freq = 0.6 + r() * 0.4;
  p.p_freq_ramp = -0.5 - r() * 0.3;
  p.p_env_attack = 0;
  p.p_env_sustain = 0.05 + r() * 0.1;
  p.p_env_decay = 0.1 + r() * 0.2;
  p.p_duty = -0.2 + r() * 0.4;
  p.distortion = 0.1 + r() * 0.3;
  return p;
}

/** Wind woosh / swipe / air movement. */
export function wooshWind(): SynthParams {
  const p = base();
  p.wave_type = NOISE;
  p.noise_type = 1; // pink
  p.p_base_freq = 0.1 + r() * 0.2;
  p.p_env_attack = 0.1 + r() * 0.3;
  p.p_env_sustain = 0.2 + r() * 0.4;
  p.p_env_decay = 0.3 + r() * 0.5;
  p.p_lpf_freq = 0.3 + r() * 0.4;
  p.p_lpf_ramp = -0.2 - r() * 0.3;
  p.reverb_size = 0.3 + r() * 0.4;
  return p;
}

/** Continuous drone / buzz / engine hum. */
export function droneBuzz(): SynthParams {
  const p = base();
  p.wave_type = SAWTOOTH;
  p.p_base_freq = 0.05 + r() * 0.15;
  p.p_env_attack = 0.5 + r() * 1.0;
  p.p_env_sustain = 2.0 + r() * 2.0;
  p.p_env_decay = 1.0 + r() * 2.0;
  p.p_vib_speed = 0.1 + r() * 0.2;
  p.p_vib_strength = 0.05 + r() * 0.1;
  p.chorus_rate = 0.1 + r() * 0.2;
  p.chorus_depth = 0.2 + r() * 0.3;
  p.p_lpf_freq = 0.4 + r() * 0.3;
  return p;
}

/** Crisp click / button press / UI tap. */
export function clickUI(): SynthParams {
  const p = base();
  p.wave_type = SQUARE;
  p.p_base_freq = 0.8 + r() * 0.2;
  p.p_env_attack = 0;
  p.p_env_sustain = 0.01;
  p.p_env_decay = 0.02 + r() * 0.03;
  p.p_duty = 0.1 + r() * 0.2;
  p.p_hpf_freq = 0.2 + r() * 0.3;
  return p;
}

/** Digital glitch / corruption / error. */
export function glitchDigital(): SynthParams {
  const p = base();
  p.wave_type = Math.floor(r() * 3);
  p.p_base_freq = 0.2 + r() * 0.6;
  p.p_env_attack = 0;
  p.p_env_sustain = 0.05 + r() * 0.1;
  p.p_env_decay = 0.1 + r() * 0.3;
  p.p_arp_speed = 0.8 + r() * 0.2;
  p.p_arp_mod = -0.5 + r() * 1.0;
  p.bit_crush = 0.3 + r() * 0.5;
  p.distortion = 0.2 + r() * 0.4;
  p.p_repeat_speed = 0.3 + r() * 0.4;
  return p;
}

/** Portal / wormhole / teleport shimmer. */
export function portalWarp(): SynthParams {
  const p = base();
  p.wave_type = SINE;
  p.p_base_freq = 0.3 + r() * 0.3;
  p.p_env_attack = 0.2 + r() * 0.3;
  p.p_env_sustain = 0.5 + r() * 0.5;
  p.p_env_decay = 0.8 + r() * 1.0;
  p.fm_freq = 0.3 + r() * 0.4;
  p.fm_depth = 0.4 + r() * 0.6;
  p.ring_mod_freq = 0.1 + r() * 0.3;
  p.ring_mod_depth = 0.2 + r() * 0.3;
  p.reverb_size = 0.6 + r() * 0.4;
  p.delay_time = 0.2 + r() * 0.3;
  p.delay_feedback = 0.3 + r() * 0.4;
  return p;
}

/** Warning / alarm / alert beep. */
export function warningAlarm(): SynthParams {
  const p = base();
  p.wave_type = SQUARE;
  p.p_base_freq = 0.15 + r() * 0.1;
  p.p_env_attack = 0;
  p.p_env_sustain = 0.3 + r() * 0.2;
  p.p_env_decay = 0.1 + r() * 0.2;
  p.p_duty = -0.3 + r() * 0.2;
  p.p_repeat_speed = 0.5 + r() * 0.3;
  p.distortion = 0.1 + r() * 0.2;
  p.p_lpf_freq = 0.6 + r() * 0.3;
  return p;
}
