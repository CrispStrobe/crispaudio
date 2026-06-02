// ---------------------------------------------------------------------------
// CrispAudio — synth parameter types
// Extracted from crispfxr-app/src/App.js
// ---------------------------------------------------------------------------

/** Oscillator waveform shapes. Numeric values match the original SQUARE/SAWTOOTH/SINE/NOISE constants. */
export type WaveformType = 'square' | 'sawtooth' | 'sine' | 'noise';

/** Map from WaveformType string to the integer the engine uses internally. */
export const WAVEFORM_INDEX: Record<WaveformType, number> = {
  square: 0,
  sawtooth: 1,
  sine: 2,
  noise: 3,
};

export const WAVEFORM_FROM_INDEX: Record<number, WaveformType> = {
  0: 'square',
  1: 'sawtooth',
  2: 'sine',
  3: 'noise',
};

/** Noise colour algorithm. Numeric values match noise_type field (0/1/2). */
export type NoiseType = 'white' | 'pink' | 'brown';

export const NOISE_INDEX: Record<NoiseType, number> = {
  white: 0,
  pink: 1,
  brown: 2,
};

export const NOISE_FROM_INDEX: Record<number, NoiseType> = {
  0: 'white',
  1: 'pink',
  2: 'brown',
};

// ---------------------------------------------------------------------------
// Core parameter bag
// ---------------------------------------------------------------------------

/**
 * All synthesis parameters for a single sound.
 * Every numeric field is a 32-bit float stored in normalised or semi-normalised
 * ranges as documented in the inline comments.
 */
export interface SynthParams {
  // --- Oscillator ---
  /** 0=square 1=sawtooth 2=sine 3=noise (use WaveformType helpers) */
  wave_type: number;

  // --- Envelope (seconds unless noted) ---
  /** Attack time [0..3 s] */
  p_env_attack: number;
  /** Sustain time [0..3 s] */
  p_env_sustain: number;
  /** Sustain punch (amplitude boost during sustain) [0..3] */
  p_env_punch: number;
  /** Decay time [0..3 s] */
  p_env_decay: number;

  // --- Pitch ---
  /** Base frequency, normalised [0.001..2], maps to ×440 Hz */
  p_base_freq: number;
  /** Frequency upper limit [0..1] */
  p_freq_limit: number;
  /** Frequency ramp per sample (slide) [-1..1] */
  p_freq_ramp: number;
  /** Delta ramp (slide acceleration) [-1..1] */
  p_freq_dramp: number;

  // --- Vibrato ---
  /** Vibrato depth [0..1] */
  p_vib_strength: number;
  /** Vibrato rate [0..1] */
  p_vib_speed: number;

  // --- Arpeggio ---
  /** Arpeggio pitch multiplier offset [-1..1] */
  p_arp_mod: number;
  /** Arpeggio retrigger rate [0..1] */
  p_arp_speed: number;

  // --- Pulse width (square wave) ---
  /** Pulse duty cycle offset [-1..1] (maps to 0.01..0.99) */
  p_duty: number;
  /** Duty cycle ramp per sample [-1..1] */
  p_duty_ramp: number;

  // --- Retrigger ---
  /** Repeat / retrigger speed [0..1] */
  p_repeat_speed: number;

  // --- Phaser ---
  /** Phaser offset [-1..1] */
  p_pha_offset: number;
  /** Phaser ramp [-1..1] */
  p_pha_ramp: number;

  // --- Low-pass filter ---
  /** LPF cutoff [0..1] (1 = fully open) */
  p_lpf_freq: number;
  /** LPF cutoff ramp [-1..1] */
  p_lpf_ramp: number;
  /** LPF resonance [0..1] */
  p_lpf_resonance: number;

  // --- High-pass filter ---
  /** HPF cutoff [0..1] */
  p_hpf_freq: number;
  /** HPF cutoff ramp [-1..1] */
  p_hpf_ramp: number;

  // --- FM synthesis ---
  /** FM modulator frequency [0..1], maps to ×50 Hz */
  fm_freq: number;
  /** FM modulation depth [0..1] */
  fm_depth: number;

  // --- LFO ---
  /** LFO rate [0..1], maps to ×5 Hz */
  lfo_rate: number;
  /** LFO pitch modulation depth [0..1] */
  lfo_depth: number;

  // --- Noise ---
  /** Noise colour: 0=white 1=pink 2=brown */
  noise_type: number;

  // --- Sub-bass oscillator ---
  /** Sub-bass level (sine at half-frequency) [0..1] */
  sub_bass: number;

  // --- Effects ---
  /** Soft-clip distortion amount [0..1] */
  distortion: number;
  /** Chorus LFO rate [0..1] */
  chorus_rate: number;
  /** Chorus wet mix depth [0..1] */
  chorus_depth: number;
  /** Reverb room size [0..1] */
  reverb_size: number;
  /** Reverb decay time [0..1] */
  reverb_decay: number;
  /** Delay time [0..1], maps to ×0.3 s */
  delay_time: number;
  /** Delay feedback [0..1] */
  delay_feedback: number;
  /** Ring-modulator frequency [0..1], maps to ×200 Hz */
  ring_mod_freq: number;
  /** Ring-modulator wet depth [0..1] */
  ring_mod_depth: number;
  /** Bit-crush amount [0..1] (1 = 1-bit) */
  bit_crush: number;
  /** Sample-rate reduction amount [0..1] */
  sample_reduction: number;
  /** Flanger LFO rate [0..1] */
  flanger_rate: number;
  /** Flanger modulation depth [0..1] */
  flanger_depth: number;
  /** Flanger base delay [0.1..1] */
  flanger_delay: number;

  // --- Output ---
  /** Master volume [0..1] */
  sound_vol: number;
  /** Export sample rate (Hz) — informational, does not affect generateSamples */
  sample_rate: number;
  /** Export bit depth — informational, does not affect generateSamples */
  sample_size: number;
}

// ---------------------------------------------------------------------------
// Export / render settings
// ---------------------------------------------------------------------------

export interface ExportSettings {
  /** Output sample rate in Hz (e.g. 44100, 22050, 8000) */
  sampleRate: number;
  /** PCM bit depth (8, 16, 24, or 32) */
  bitDepth: number;
}

// ---------------------------------------------------------------------------
// Preset names
// ---------------------------------------------------------------------------

export type PresetName =
  | 'pickupCoin'
  | 'laserShoot'
  | 'explosion'
  | 'powerUp'
  | 'hitHurt'
  | 'jump'
  | 'ambient'
  | 'random'
  | 'blipSelect'
  | 'zapElectric'
  | 'wooshWind'
  | 'droneBuzz'
  | 'clickUI'
  | 'glitchDigital'
  | 'portalWarp'
  | 'warningAlarm';

export const ALL_PRESET_NAMES: PresetName[] = [
  'pickupCoin',
  'laserShoot',
  'explosion',
  'powerUp',
  'hitHurt',
  'jump',
  'ambient',
  'random',
  'blipSelect',
  'zapElectric',
  'wooshWind',
  'droneBuzz',
  'clickUI',
  'glitchDigital',
  'portalWarp',
  'warningAlarm',
];
