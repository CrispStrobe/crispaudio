// ---------------------------------------------------------------------------
// projectFile — (de)serialize a CrispAudio timeline project to/from a portable
// JSON document. Audio sources are embedded as base64-encoded 16-bit WAV so a
// saved project is fully self-contained.
// ---------------------------------------------------------------------------

import type { AudioSource, TimelineProject } from '../types/audio';
import {
  encodeAudioBufferToWav,
  computeWaveformPeaks,
} from '../audio/utils/audioBufferUtils';

const FORMAT = 'crispaudio-project';
const VERSION = 1;

interface SerializedSource {
  id: string;
  name: string;
  sampleRate: number;
  channels: number;
  duration: number;
  wav: string; // base64-encoded 16-bit WAV
}

interface SerializedProject {
  format: typeof FORMAT;
  version: number;
  project: TimelineProject;
  sources: SerializedSource[];
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Serialize the project structure + embedded audio to a JSON string. */
export function serializeProject(
  project: TimelineProject,
  sources: Map<string, AudioSource>,
): string {
  const serializedSources: SerializedSource[] = Array.from(
    sources.values(),
  ).map((src) => ({
    id: src.id,
    name: src.name,
    sampleRate: src.sampleRate,
    channels: src.channels,
    duration: src.duration,
    wav: arrayBufferToBase64(encodeAudioBufferToWav(src.buffer, 16)),
  }));

  const doc: SerializedProject = {
    format: FORMAT,
    version: VERSION,
    project,
    sources: serializedSources,
  };
  return JSON.stringify(doc);
}

/**
 * Parse a project JSON string, decoding embedded audio back into AudioBuffers.
 * Throws if the document is not a recognised CrispAudio project.
 */
export async function deserializeProject(
  json: string,
  ctx: BaseAudioContext,
): Promise<{ project: TimelineProject; sources: Map<string, AudioSource> }> {
  const doc = JSON.parse(json) as Partial<SerializedProject>;
  if (doc.format !== FORMAT || !doc.project || !Array.isArray(doc.sources)) {
    throw new Error('Not a valid CrispAudio project file');
  }

  const sources = new Map<string, AudioSource>();
  for (const s of doc.sources) {
    try {
      const buffer = await ctx.decodeAudioData(base64ToArrayBuffer(s.wav));
      const mono = buffer.getChannelData(0);
      const bins = Math.max(1, Math.min(8000, Math.ceil(buffer.duration * 200)));
      sources.set(s.id, {
        id: s.id,
        name: s.name,
        buffer,
        peaks: computeWaveformPeaks(mono, bins),
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
      });
    } catch (err) {
      console.error(`Failed to decode audio source "${s.name}":`, err);
      // Skip corrupt sources instead of crashing the entire project load
    }
  }

  return { project: doc.project, sources };
}
