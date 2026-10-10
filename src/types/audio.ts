// ---------------------------------------------------------------------------
// CrispAudio — Timeline data model types
// ---------------------------------------------------------------------------

export interface TimelineProject {
  groupEditingEnabled?: boolean;
  id: string;
  name: string;
  sampleRate: number;
  bitDepth?: number;
  tracks: TimelineTrack[];
  masterEffects: EffectConfig[];
  masterVolume?: number; // project output gain; independent of monitor volume
  duration: number; // computed from content and minimumDuration
  editRange?: { start: number; end: number };
  minimumDuration?: number; // explicit empty canvas/export tail, seconds
  markers?: TimelineMarker[];
  transcript?: TranscriptCue[];
  transcriptLayout?: (string|number)[][]; // ASR arrangement guard; moving/slipping audio requires realignment
  syncHistory?: SyncDecision[];
  frameRate?: number;
  snapGrid?: number; // seconds, 0 disables the time grid
  video?: {
    locked?: boolean;
    rippleEnabled?: boolean;
    sources?: VideoSource[];
    clips?: VideoClip[];
    path: string;
    duration: number;
    inPoint?: number;
    outPoint?: number;
    session: import('../lib/media').SyncSession;
  };
}

export interface TimelineTrack {
  locked?: boolean;
  rippleEnabled?: boolean;
  id: string;
  name: string;
  segments: AudioSegment[];
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  automation?: GainPoint[]; // absolute timeline seconds
  effects?: EffectConfig[];
  fadeInDuration?: number;
  fadeOutDuration?: number;
  fadeInCurve?: FadeCurve;
  fadeOutCurve?: FadeCurve;
}

export interface AudioSegment {
  editGroup?: {id:string;name:string};
  linkGroup?: string;
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
  | 'peaking'
  | 'lowshelf'
  | 'highshelf'
  | 'compressor';

export interface AudioSource {
  id: string;
  name: string;
  buffer: AudioBuffer;
  peaks: { min: Float32Array; max: Float32Array };
  duration: number;
  sampleRate: number;
  channels: number;
  provenance?: { path: string; offset: number; rate: number };
  filePath?: string;
}

export interface TimelineSelection {
  startTime: number;
  endTime: number;
  segmentIds: string[];
}

export interface ClipboardState {
  operation: 'cut' | 'copy' | null;
  segments: AudioSegment[];
  videos?: VideoClip[];
  sourceIds: string[];
}

export interface VideoTransform { rotation: 0 | 90 | 180 | 270; flipHorizontal: boolean; flipVertical: boolean }
export interface VideoColor { enabled: boolean; exposure: number; contrast: number; saturation: number }

export interface VideoClip {
  editGroup?: {id:string;name:string};
  colorCorrection?: VideoColor;
  transform?: VideoTransform;
  sourceId?: string;
  linkGroup?: string;
  id: string;
  startTime: number;
  duration: number;
  sourceOffset: number;
  fadeIn: number;
  fadeOut: number;
  transition: import('../lib/videoEditing').VideoTransition;
  transitionDuration: number;
}

export interface VideoSource { id: string; path: string; name: string; duration: number; frameRate?: number }
export interface TimelineMarker { id: string; time: number; name: string }
export interface TranscriptWord { id: string; start: number; end: number; text: string }
export interface TranscriptCue { id: string; start: number; end: number; text: string; words?: TranscriptWord[] }
export interface GainPoint { time: number; value: number }
export interface SyncDecision { at: string; reference: string; tracks: { id: string; alignment: import('../lib/media').Alignment }[] }
