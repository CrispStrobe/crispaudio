export interface VoiceSettings {
  pitchShift: number;           // semitones, -24 to +24
  formantShift: number;         // -1 to +1
  speedChange: number;          // 0.5 to 2.0
  vocoderMix: number;           // 0 to 1
  vocoderFreq: number;          // Hz
  ringModFreq: number;          // Hz
  ringModMix: number;           // 0 to 1
  tremoloRate: number;          // Hz
  tremoloDepth: number;         // 0 to 1
  delayTime: number;            // seconds
  delayFeedback: number;        // 0 to 1
  delayMix: number;             // 0 to 1
  chorusRate: number;           // Hz
  chorusDepth: number;          // 0 to 1
  chorusMix: number;            // 0 to 1
  reverbSize: number;           // 0 to 1
  reverbDecay: number;          // seconds
  reverbMix: number;            // 0 to 1
  lowpassFreq: number;          // Hz
  highpassFreq: number;         // Hz
  compThreshold: number;        // dB
  compRatio: number;            // ratio
  distortionDrive: number;      // 0 to 1
  distortionMix: number;        // 0 to 1
  bitCrushBits: number;         // 1 to 16
  bitCrushMix: number;          // 0 to 1
  noiseGateThreshold: number;   // dB
  masterGain: number;           // 0 to 2
}

export type VoicePresetName =
  | 'original'
  | 'classicRobot'
  | 'deepRobot'
  | 'alien'
  | 'cyborg'
  | 'radio'
  | 'metallic'
  | 'demon'
  | 'chipmunk';
