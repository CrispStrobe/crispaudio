// ---------------------------------------------------------------------------
// CrispAudio — Timeline data model types
// ---------------------------------------------------------------------------

export interface TrackFolder {id:string;name:string;trackIds:string[];collapsed:boolean}

export interface TimelineProject {
  trackFolders?:TrackFolder[];
  mixVersions?:Partial<Record<import('../lib/mixVersions').MixSlot,import('../lib/mixVersions').MixVersion>>;
  music?: import('../lib/musicalTime').MusicalSettings;
  groupEditingEnabled?: boolean;
  id: string;
  name: string;
  sampleRate: number;
  bitDepth?: number;
  tracks: TimelineTrack[];
  masterEffects: EffectConfig[];
  outputLimiter?: import('../audio/dsp/samplePeakLimiter').OutputLimiterConfig;
  masterVolume?: number; // project output gain; independent of monitor volume
  duration: number; // computed from content and minimumDuration
  editRange?: { start: number; end: number };
  minimumDuration?: number; // explicit empty canvas/export tail, seconds
  markers?: TimelineMarker[];
  transcript?: TranscriptCue[];
  sourceTranscripts?:SourceTranscript[];
  sections?:{id:string;name:string;start:number;end:number}[];
  transcriptLayout?: (string|number)[][]; // ASR arrangement guard; moving/slipping audio requires realignment
  syncHistory?: SyncDecision[];
  frameRate?: number;
  snapGrid?: number; // seconds, 0 disables the time grid
  video?: {
    multicamGroups?:MulticamGroup[];
    titlePresets?:TitlePreset[];
    graphics?: GraphicTrack[];
    captions?: CaptionTrack;
    tracks?: VideoTrack[]; // ordered top to bottom; absent is the legacy picture lane
    width?: number;
    height?: number;
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
  recordArmed?:boolean;
  recordingInput?:RecordingInput;
  takes?:RecordingTake[];
  compRegions?:CompRegion[];
  compVersions?:{id:string;name:string;regions:CompRegion[]}[];
  compBaseSegments?:AudioSegment[];
  kind?: 'audio' | 'bus';
  output?: string; // absent or 'master' preserves legacy direct routing
  sends?: AudioSend[];
  ducking?: DuckingConfig;
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
  panAutomation?: GainPoint[]; // absolute pan −1..1; empty uses static pan
  effects?: EffectConfig[];
  fadeInDuration?: number;
  fadeOutDuration?: number;
  fadeInCurve?: FadeCurve;
  fadeOutCurve?: FadeCurve;
}

export interface AudioSend { id: string; target: string; gain: number; preFader: boolean }
export interface DuckingConfig { source: string; threshold: number; ratio: number; attack: number; release: number; maximum: number }

export interface Retime {renderDuration?:number;rate:number;reverse:boolean;preservePitch:boolean;semitones:number;original:{sourceId?:string;path?:string;offset:number;duration:number}}

export interface AudioSegment {
  midi?:import('../lib/midiPattern').MidiPattern;
  retime?:Retime;
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
  automation?: {mix?: GainPoint[];feedback?: GainPoint[];time?: GainPoint[];depth?: GainPoint[];rate?: GainPoint[];freq?:GainPoint[]}; // absolute timeline seconds; delay mix/feedback/time, chorus depth/rate, ringmod freq, or ringmod/bitcrush/distortion/chorus/reverb mix
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

export interface MulticamGroup {id:string;name:string;start:number;end:number;syncHistoryIndex:number;angles:{id:string;name:string;clip:VideoClip;sourceOffset:number}[]}
export interface SourceTranscript {id:string;sourceId:string;name:string;cues:TranscriptCue[]}
export interface VideoClip {
  multicam?:{groupId:string;angleId:string;clockOffset:number};
  retime?:Retime;
  videoTrackId?: string;
  composition?: PictureComposition;
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

export interface VideoTrack { id:string; name:string; visible:boolean; locked:boolean; rippleEnabled:boolean }
export interface PictureKeyframe {easing?:'linear'|'step'|'ease-in'|'ease-out'|'ease-in-out';time:number;x:number;y:number;scale:number;rotation:number;opacity:number}
export interface PictureComposition {
  x:number;y:number;scale:number;rotation:number;opacity:number;
  crop:{left:number;top:number;right:number;bottom:number};
  keyframes?:PictureKeyframe[];
  keyframeOffset?:number;
}

export interface VideoSource { id: string; path: string; name: string; duration: number; frameRate?: number }
export interface TimelineMarker { id: string; time: number; name: string }
export interface TranscriptWord { id: string; start: number; end: number; text: string }
export interface TranscriptCue { speaker?:string; id: string; start: number; end: number; text: string; words?: TranscriptWord[] }
export interface GainPoint { time: number; value: number; curve?: 'linear'|'step'; shapeReview?: {shape:'ease-in'|'ease-out'|'s-curve'|'custom';intervals:number;controls?:{x1:number;y1:number;x2:number;y2:number}} }
export interface SyncDecision { at: string; reference: string; tracks: { id: string; alignment: import('../lib/media').Alignment }[] }

export interface TitleStyle {
  font:string;size:number;align:'left'|'center'|'right';color:string;
  background:string;backgroundOpacity:number;boxWidth:number;lineHeight:number;
}
export interface GraphicClip {
  id:string;type:'title'|'image';name:string;startTime:number;duration:number;
  text?:string;path?:string;style?:TitleStyle;composition:PictureComposition;
}
export interface GraphicTrack extends VideoTrack {clips:GraphicClip[]}
export interface CaptionTrack extends VideoTrack {burnIn:boolean;style:TitleStyle;cues:TranscriptCue[]}

export interface TitlePreset {id:string;name:string;text:string;duration:number;style:TitleStyle;composition:PictureComposition}

export interface RecordingInput {deviceId:string;channel:'mono'|'right'|'stereo';monitor:boolean;countIn:number;latencyMs:number}
export interface RecordingTake {inactive?:boolean;originalPlacement?:{startTime:number;sourceOffset:number;duration:number};id:string;name:string;sourceId:string;sourceOffset:number;startTime:number;duration:number;pass:number;capturedAt:string;droppedFrames:number;notes:string[];latencyMs:number}
export interface CompRegion {id:string;takeId:string;start:number;end:number;crossfade:number}
