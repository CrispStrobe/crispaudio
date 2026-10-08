import type { AudioSource, TimelineProject, TimelineTrack } from '../types/audio';
import { computeWaveformPeaks } from '../audio/utils/audioBufferUtils';

export interface MediaInfo {
  path: string; duration: number; channels: number; sample_rate: number; has_video: boolean;
}
export interface Alignment {
  offset: number; rate: number; confidence: number; residual_ms: number;
  reliable: boolean; manual: boolean;
  anchors: { video_time: number; source_time: number; correlation: number }[];
}
export interface Levels { peak_db: number; rms_db: number; activity_db: number; suggested_gain_db: number }
export interface SyncSession {
  format: string; version: number; video: MediaInfo;
  tracks: { source: MediaInfo; alignment: Alignment; aligned_path?: string | null; levels?: Levels | null }[];
  camera_path?: string | null;
  camera_levels?: Levels | null;
}

export function canAlign(session: SyncSession): boolean {
  return session.video.has_video && session.video.duration > 0 && session.tracks.every(({ alignment: a }) =>
    Number.isFinite(a.offset) && Number.isFinite(a.rate) && a.rate >= 0.99 && a.rate <= 1.01 && (a.reliable || a.manual));
}

/** Build the whole import before touching the active project. No destructive mixdown. */
export async function projectFromSession(
  session: SyncSession,
  decode: (path: string) => Promise<AudioBuffer>,
  matchLevels = false,
): Promise<{ project: TimelineProject; sources: Map<string, AudioSource> }> {
  const sources = new Map<string, AudioSource>();
  const tracks: TimelineTrack[] = [];
  const inputs = session.tracks.map((track) => ({
    path: track.aligned_path,
    name: track.source.path.split(/[\\/]/).pop() || 'Audio',
    provenance: { path: track.source.path, offset: track.alignment.offset, rate: track.alignment.rate },
    gain: matchLevels && track.levels ? 10 ** (track.levels.suggested_gain_db / 20) : 1,
  }));
  if (session.camera_path) inputs.push({ path: session.camera_path, name: 'Camera',
    provenance: { path: session.video.path, offset: 0, rate: 1 },
    gain: matchLevels && session.camera_levels ? 10 ** (session.camera_levels.suggested_gain_db / 20) : 1 });
  for (const [i, input] of inputs.entries()) {
    if (!input.path) throw new Error('Audio has not been aligned');
    const buffer = await decode(input.path);
    const sourceId = crypto.randomUUID();
    const trackId = crypto.randomUUID();
    sources.set(sourceId, {
      id: sourceId, name: input.name, buffer, filePath: input.path,
      peaks: computeWaveformPeaks(buffer.getChannelData(0), Math.min(8000, Math.ceil(buffer.duration * 200))),
      duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels,
      provenance: input.provenance,
    });
    tracks.push({
      id: trackId, name: input.name, muted: i > 0, solo: false, volume: input.gain, pan: 0,
      segments: [{ id: crypto.randomUUID(), trackId, sourceId, startTime: 0, sourceOffset: 0,
        duration: Math.min(buffer.duration, session.video.duration), gain: 1,
        fadeInDuration: 0, fadeOutDuration: 0, fadeInCurve: 'linear', fadeOutCurve: 'linear',
        effects: [], color: ['#818cf8', '#34d399', '#fbbf24'][i % 3], name: input.name }],
    });
  }
  return { sources, project: { id: crypto.randomUUID(),
    name: session.video.path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'Interview',
    sampleRate: 48000, bitDepth: 24, duration: session.video.duration, tracks, masterEffects: [],
    video: { path: session.video.path, duration: session.video.duration, session },
  } };
}
