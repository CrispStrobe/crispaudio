import { validVideoTransform } from './videoTransform';
import { validVideoColor } from './videoColor';
// ---------------------------------------------------------------------------
// projectFile — JSON projects with linked desktop media or portable embedded
// 32-bit PCM WAV. Linked interviews retain their original video and aligned WAVs.
// ---------------------------------------------------------------------------

import type { AudioSource, TimelineProject } from '../types/audio';
import {
  encodeAudioBufferToWav,
  computeWaveformPeaks,
} from '../audio/utils/audioBufferUtils';

const FORMAT = 'crispaudio-project';
const VERSION = 3;

interface SerializedSource {
  id: string;
  name: string;
  sampleRate: number;
  channels: number;
  duration: number;
  wav?: string; // portable project: base64-encoded 32-bit PCM WAV
  path?: string; // linked desktop project: unchanged aligned audio on disk
  provenance?: AudioSource['provenance'];
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

/** Serialize project structure with portable audio or linked media references. */
export function serializeProject(
  project: TimelineProject,
  sources: Map<string, AudioSource>,
  mode: 'portable' | 'linked' = 'portable',
): string {
  const serializedSources: SerializedSource[] = Array.from(
    sources.values(),
  ).map((src) => ({
    id: src.id,
    name: src.name,
    sampleRate: src.sampleRate,
    channels: src.channels,
    duration: src.duration,
    ...(mode === 'linked' && src.filePath
      ? { path: src.filePath }
      : { wav: arrayBufferToBase64(encodeAudioBufferToWav(src.buffer, 32)) }),
    provenance: src.provenance,
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
  locateMissing?: (path:string)=>Promise<string|null>,
): Promise<{ project: TimelineProject; sources: Map<string, AudioSource> }> {
  const doc = JSON.parse(json) as Partial<SerializedProject>;
  if (doc.format !== FORMAT || !doc.project || !Array.isArray(doc.sources)) {
    throw new Error('Not a valid CrispAudio project file');
  }
  if (doc.version !== 1 && doc.version !== 2 && doc.version !== VERSION) {
    throw new Error('Unsupported CrispAudio project version');
  }

  if (doc.project.video?.clips?.some(clip => !validVideoTransform(clip.transform))) throw new Error('Invalid picture orientation');
  if (doc.project.video?.clips?.some(clip => !validVideoColor(clip.colorCorrection))) throw new Error('Invalid video colour settings');

  const replacements=new Map<string,string>();
  if(locateMissing && doc.project.video && '__TAURI_INTERNALS__' in window){
    const {invoke}=await import('@tauri-apps/api/core');
    for(const source of [{path:doc.project.video.path},...(doc.project.video.sources??[])]){
      try{await invoke('prepare_video_preview',{path:source.path});}catch{
        const replacement=await locateMissing(source.path);if(!replacement)throw new Error(`Missing video: ${source.path}`);
        await invoke('prepare_video_preview',{path:replacement});replacements.set(source.path,replacement);source.path=replacement;
      }
    }
    const original=doc.project.video.path;doc.project.video.path=replacements.get(original)??original;
    doc.project.video.session={...doc.project.video.session,video:{...doc.project.video.session.video,path:doc.project.video.path}};
  }
  const sources = new Map<string, AudioSource>();
  for (const s of doc.sources) {
    try {
      let bytes: ArrayBuffer;
      if (s.path) {
        if (!('__TAURI_INTERNALS__' in window)) throw new Error('Linked projects require the desktop app');
        const { readFile } = await import('@tauri-apps/plugin-fs');
        s.path=replacements.get(s.path)??s.path;
        let file:Uint8Array;
        try{file=await readFile(replacements.get(s.path)??s.path);}catch(error){
          if(!locateMissing)throw error;const replacement=await locateMissing(s.path);if(!replacement)throw error;
          file=await readFile(replacement);replacements.set(s.path,replacement);s.path=replacement;
        }
        bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
      } else if (s.wav) {
        bytes = base64ToArrayBuffer(s.wav);
      } else {
        throw new Error('Missing source audio');
      }
      const decoder = ctx.sampleRate && ctx.sampleRate !== s.sampleRate && typeof OfflineAudioContext !== 'undefined'
        ? new OfflineAudioContext(s.channels, 1, s.sampleRate) : ctx;
      const buffer = await decoder.decodeAudioData(bytes);
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
        provenance: s.provenance,
        filePath: s.path,
      });
    } catch (err) {
      // Linked sources must not silently disappear: doing so could produce a
      // plausible but incomplete interview export.
      if (s.path) throw new Error(`Cannot load linked audio "${s.path}": ${String(err)}`, { cause: err });
      console.error(`Failed to decode audio source "${s.name}":`, err);
      // Skip corrupt sources instead of crashing the entire project load
    }
  }

  return { project: doc.project, sources };
}
