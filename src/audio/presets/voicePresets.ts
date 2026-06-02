import type { VoiceSettings, VoicePresetName } from '../../types/voicelab';

function defaultSettings(): VoiceSettings {
  return {
    pitchShift: 0,
    formantShift: 0,
    speedChange: 1.0,
    vocoderMix: 0,
    vocoderFreq: 440,
    ringModFreq: 30,
    ringModMix: 0,
    tremoloRate: 0,
    tremoloDepth: 0,
    delayTime: 0.25,
    delayFeedback: 0.3,
    delayMix: 0,
    chorusRate: 0.5,
    chorusDepth: 0.3,
    chorusMix: 0,
    reverbSize: 0,
    reverbDecay: 2.0,
    reverbMix: 0,
    lowpassFreq: 22000,
    highpassFreq: 0,
    compThreshold: -24,
    compRatio: 4,
    distortionDrive: 0,
    distortionMix: 0,
    bitCrushBits: 16,
    bitCrushMix: 0,
    noiseGateThreshold: -80,
    masterGain: 1.0,
  };
}

export function original(): VoiceSettings {
  return defaultSettings();
}

export function classicRobot(): VoiceSettings {
  return {
    ...defaultSettings(),
    vocoderMix: 0.70,
    vocoderFreq: 220,
    ringModFreq: 45,
    ringModMix: 0.25,
    pitchShift: -2,
    formantShift: -0.2,       // formantShift 0.8 → shift of -0.2 from neutral
    lowpassFreq: 8000,
    highpassFreq: 200,
    bitCrushBits: 8,
    bitCrushMix: 1,
    distortionDrive: 0.20,
    distortionMix: 1,
    noiseGateThreshold: -50,
  };
}

export function deepRobot(): VoiceSettings {
  return {
    ...defaultSettings(),
    vocoderMix: 0.80,
    vocoderFreq: 110,
    ringModFreq: 25,
    ringModMix: 0.15,
    pitchShift: -5,
    formantShift: -0.4,       // formantShift 0.6 → -0.4 from neutral
    lowpassFreq: 6000,
    highpassFreq: 100,
    bitCrushBits: 6,
    bitCrushMix: 1,
    distortionDrive: 0.35,
    distortionMix: 1,
    noiseGateThreshold: -48,
  };
}

export function alien(): VoiceSettings {
  return {
    ...defaultSettings(),
    vocoderMix: 0.60,
    vocoderFreq: 660,
    ringModFreq: 80,
    ringModMix: 0.40,
    pitchShift: 7,
    formantShift: 0.8,        // formantShift 1.8 → +0.8 from neutral
    lowpassFreq: 12000,
    highpassFreq: 500,
    bitCrushBits: 10,
    bitCrushMix: 1,
    distortionDrive: 0.25,
    distortionMix: 1,
    noiseGateThreshold: -58,
  };
}

export function cyborg(): VoiceSettings {
  return {
    ...defaultSettings(),
    vocoderMix: 0.50,
    vocoderFreq: 330,
    ringModFreq: 60,
    ringModMix: 0.35,
    pitchShift: 2,
    formantShift: 0.1,        // formantShift 1.1 → +0.1 from neutral
    lowpassFreq: 10000,
    highpassFreq: 300,
    bitCrushBits: 4,
    bitCrushMix: 1,
    distortionDrive: 0.40,
    distortionMix: 1,
    noiseGateThreshold: -46,
  };
}

export function radio(): VoiceSettings {
  return {
    ...defaultSettings(),
    vocoderMix: 0.40,
    vocoderFreq: 800,
    ringModFreq: 120,
    ringModMix: 0.60,
    pitchShift: 0,
    formantShift: 0.2,        // formantShift 1.2 → +0.2
    lowpassFreq: 4000,
    highpassFreq: 800,
    bitCrushBits: 12,
    bitCrushMix: 1,
    distortionDrive: 0.15,
    distortionMix: 1,
    noiseGateThreshold: -44,
  };
}

export function metallic(): VoiceSettings {
  return {
    ...defaultSettings(),
    vocoderMix: 0.55,
    vocoderFreq: 550,
    ringModFreq: 150,
    ringModMix: 0.70,
    pitchShift: 0,
    formantShift: 0.3,        // formantShift 1.3 → +0.3
    lowpassFreq: 8000,
    highpassFreq: 400,
    bitCrushBits: 8,
    bitCrushMix: 1,
    distortionDrive: 0.50,
    distortionMix: 1,
    noiseGateThreshold: -48,
  };
}

export function demon(): VoiceSettings {
  return {
    ...defaultSettings(),
    vocoderMix: 0.85,
    vocoderFreq: 66,
    ringModFreq: 13,
    ringModMix: 0.45,
    pitchShift: -12,
    formantShift: -0.6,       // formantShift 0.4 → -0.6 from neutral
    lowpassFreq: 3000,
    highpassFreq: 50,
    bitCrushBits: 4,
    bitCrushMix: 1,
    distortionDrive: 0.80,
    distortionMix: 1,
    noiseGateThreshold: -44,
  };
}

export function chipmunk(): VoiceSettings {
  return {
    ...defaultSettings(),
    vocoderMix: 0.20,
    vocoderFreq: 1200,
    ringModFreq: 200,
    ringModMix: 0.10,
    pitchShift: 12,
    formantShift: 1.5,        // formantShift 2.5 → +1.5 from neutral
    lowpassFreq: 16000,
    highpassFreq: 1000,
    bitCrushBits: 12,
    bitCrushMix: 1,
    distortionDrive: 0.05,
    distortionMix: 1,
    noiseGateThreshold: -68,
  };
}

const presetMap: Record<VoicePresetName, () => VoiceSettings> = {
  original,
  classicRobot,
  deepRobot,
  alien,
  cyborg,
  radio,
  metallic,
  demon,
  chipmunk,
};

export function getPreset(name: VoicePresetName): VoiceSettings {
  return presetMap[name]();
}
