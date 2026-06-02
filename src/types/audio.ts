// ---------------------------------------------------------------------------
// CrispAudio — Timeline data model types
// ---------------------------------------------------------------------------

export interface TimelineProject {
  id: string;
  name: string;
  sampleRate: number;
  tracks: TimelineTrack[];
  masterEffects: EffectConfig[];
  duration: number; // computed from segments
}

export interface TimelineTrack {
  id: string;
  name: string;
  segments: AudioSegment[];
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
}

export interface AudioSegment {
  id: string;
  trackId: string;
  sourceId: string; // reference to AudioSource
  startTime: number; // position on timeline (seconds)
  duration: number; // visible duration
  sourceOffset: number; // trim start in source
  fadeInDuration: number;
  fadeOutDuration: number;
  fadeInCurve: FadeCurve;
  fadeOutCurve: FadeCurve;
  effects: EffectConfig[];
  gain: number;
  color: string;
  name: string;
}

export type FadeCurve = 'linear' | 'exponential' | 'scurve';

export interface EffectConfig {
  type: EffectType;
  enabled: boolean;
  params: Record<string, number>;
}

export type EffectType =
  | 'distortion'
  | 'chorus'
  | 'delay'
  | 'reverb'
  | 'ringmod'
  | 'bitcrush'
  | 'lowpass'
  | 'highpass'
  | 'compressor';

export interface AudioSource {
  id: string;
  name: string;
  buffer: AudioBuffer;
  peaks: { min: Float32Array; max: Float32Array };
  duration: number;
  sampleRate: number;
  channels: number;
}

export interface TimelineSelection {
  startTime: number;
  endTime: number;
  segmentIds: string[];
}

export interface ClipboardState {
  operation: 'cut' | 'copy' | null;
  segments: AudioSegment[];
  sourceIds: string[];
}
