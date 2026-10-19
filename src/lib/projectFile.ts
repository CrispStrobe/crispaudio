import {validProjectSourceJournals,validateSourceJournalAudio} from './sourceEditJournal';
import {validProjectSourceChains} from './sourceChainRecipe';
import {validTrackFreezes,retainedFreezeProject} from './trackFreeze';
import {validNativeRecordingImports} from './nativeRecordingImports';
import {restoreProjectResources} from './resourceAccess';
import {hasNativeEffects,hasStoredNativeEffects,validProjectNativeEffects} from './nativeEffects';
import {validMixVersions} from './mixVersions';
import {validTrackFolders} from './trackFolders';
import {validProjectMidi} from './midiPattern';
import {validMusic} from './musicalTime';
import {validSourceTranscripts} from './sourceTranscript';
import {validMulticam} from './multicam';
import {validRetime} from './clipRetime';
import {validRecording} from './recordingTakes';
import {validGraphics} from './graphics';
import {validPictureTracks,validPicture} from './pictureComposition';
import {routingOrder} from './audioRouting';
import {validAutomationCurve} from './mixAutomation';
import {validEffectAutomation} from './effectAutomation';
import {validOutputLimiter} from '../audio/dsp/samplePeakLimiter';
import { validVideoTransform } from './videoTransform';
import { validVideoColor } from './videoColor';
// ---------------------------------------------------------------------------
// projectFile — JSON projects with linked desktop media or portable embedded
// 32-bit PCM WAV. Linked interviews retain their original video and aligned WAVs.
// ---------------------------------------------------------------------------

import { audibleTracks, timelineDuration } from './timelineView';
import type { AudioSource, TimelineProject } from '../types/audio';
import {
  encodeAudioBufferToWav,
  computeWaveformPeaks,
} from '../audio/utils/audioBufferUtils';

const FORMAT = 'crispaudio-project';
const VERSION = 4;
const FREEZE_VERSION = 5;

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
  if(!validProjectSourceChains(project))throw new Error('Invalid source effect chain');
  if(!validNativeRecordingImports(project))throw new Error('Invalid native recording import receipts');
  if(!validProjectNativeEffects(project))throw new Error('Invalid native effect rack');
  validateFrozenProjectAudio(project,sources);
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
      : { wav: arrayBufferToBase64(encodeAudioBufferToWav(src.buffer, 32,true)) }),
    provenance: src.provenance,
  }));

  const doc: SerializedProject = {
    format: FORMAT,
    version: project.tracks.some(t=>t.freeze)?FREEZE_VERSION:hasStoredNativeEffects(project)?VERSION:3,
    project,
    sources: serializedSources,
  };
  return JSON.stringify(doc);
}

/** Disk-only snapshot for the native 48 kHz mixer. Never encodes an AudioBuffer.
 * In-memory audible sources and other render rates keep the Web Audio path.
 * Muted/unreferenced sources need no files; solo overrides stored mute state.
 */
export function linkedRenderDocument(project: TimelineProject, sources: Map<string, AudioSource>): SerializedProject | null {
  if(!validProjectSourceChains(project))throw new Error('Invalid source effect chain');
  if (hasNativeEffects(project)||project.tracks.some(t=>t.freeze)||project.sampleRate !== 48000) return null;
  const ids = new Set(audibleTracks(project.tracks).flatMap(track => track.segments.map(clip => clip.sourceId)));
  const linked: SerializedSource[] = [];
  for (const id of ids) {
    const source = sources.get(id);
    if (!source?.filePath || source.channels < 1 || source.channels > 2) return null;
    linked.push({ id, name: source.name, path: source.filePath, duration: source.duration,
      channels: source.channels, sampleRate: source.sampleRate, provenance: source.provenance });
  }
  return { format: FORMAT, version: hasStoredNativeEffects(project)?VERSION:3,
    project: { ...project, duration: Math.max(project.duration, timelineDuration(project)) }, sources: linked };
}

function validateProjectMetadata(project:TimelineProject,serializedSources:SerializedSource[],version:number){
  if(!validProjectSourceJournals(project))throw new Error('Invalid source edit journal');
  if(!validProjectSourceChains(project))throw new Error('Invalid source effect chain');
  if(!validNativeRecordingImports(project))throw new Error('Invalid native recording import receipts');
  if(!validMixVersions(project))throw new Error('Invalid mix versions');
  if(!validProjectNativeEffects(project))throw new Error('Invalid native effect rack');
  if(version<VERSION&&hasStoredNativeEffects(project))throw new Error('Native effect racks require project version 4');
  if(!validTrackFolders(project))throw new Error('Invalid track folders');
  if(!validProjectMidi(project))throw new Error('Invalid MIDI pattern');
  if(project.music!==undefined&&!validMusic(project.music))throw new Error('Invalid musical clock');
  if(project.video&&(!validPictureTracks(project.video)||project.video.clips?.some(c=>!validPicture(c.composition))))throw new Error('Invalid picture tracks or composition');
  if (project.video?.clips?.some(clip => !validVideoTransform(clip.transform))) throw new Error('Invalid picture orientation');
  if (project.video?.clips?.some(clip => !validVideoColor(clip.colorCorrection))) throw new Error('Invalid video colour settings');

  if(!validGraphics(project.video))throw new Error('Invalid graphics or captions');
  if(!validSourceTranscripts(project,new Set(serializedSources.map(s=>s.id))))throw new Error('Invalid source transcript or sections');
  if(!validMulticam(project))throw new Error('Invalid multicam groups');
  if(!validRetime(project,new Set(serializedSources.map(s=>s.id))))throw new Error('Invalid retime settings or original source');
  if(project.tracks.some(t=>(t.segments??[]).some(c=>c.sourceEdit&&(!serializedSources.some(s=>s.id===c.sourceEdit!.sourceId)||!Number.isFinite(c.sourceEdit.offset)||c.sourceEdit.offset<0||!Array.isArray(c.sourceEdit.operations)||c.sourceEdit.operations.length>64))))throw new Error('Invalid retained source edit');
  if(!validRecording(project,new Set(serializedSources.map(s=>s.id))))throw new Error('Invalid recording takes or inputs');
  routingOrder(project.tracks);

  if (project.masterVolume !== undefined && (!Number.isFinite(project.masterVolume) || project.masterVolume < 0)) throw new Error('Invalid master volume');

  if(project.tracks.some(track=>track.automation!==undefined&&(!Array.isArray(track.automation)||track.automation.some(p=>!p||!validAutomationCurve(p)||!Number.isFinite(p.time)||p.time<0||!Number.isFinite(p.value)||p.value<0))))throw new Error('Invalid gain automation');

  if(project.tracks.some(track=>track.panAutomation!==undefined&&(!Array.isArray(track.panAutomation)||track.panAutomation.some(p=>!p||!validAutomationCurve(p)||!Number.isFinite(p.time)||p.time<0||!Number.isFinite(p.value)||p.value< -1||p.value>1))))throw new Error('Invalid pan automation');

  if([...(project.masterEffects??[]),...project.tracks.flatMap(t=>[...(t.effects??[]),...t.segments.flatMap(c=>c.effects??[])])].some(e=>!validEffectAutomation(e)))throw new Error('Invalid effect automation');

  if(!validOutputLimiter(project.outputLimiter))throw new Error('Invalid output limiter');

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
  const doc = JSON.parse(await restoreProjectResources(json)) as Partial<SerializedProject>;
  if (doc.format !== FORMAT || !doc.project || !Array.isArray(doc.sources)) {
    throw new Error('Not a valid CrispAudio project file');
  }
  if (doc.version !== 1 && doc.version !== 2 && doc.version !== 3 && doc.version !== VERSION && doc.version !== FREEZE_VERSION) {
    throw new Error('Unsupported CrispAudio project version');
  }

  if(doc.project.tracks.some(t=>t.freeze)&&doc.version!==FREEZE_VERSION)throw new Error('Frozen tracks require project version 5');
  if(!validTrackFreezes(doc.project,new Set(doc.sources.map(s=>s.id))))throw new Error('Invalid frozen track');
  validateProjectMetadata(doc.project,doc.sources,doc.version!);
  if(doc.project.tracks.some(t=>t.freeze))validateProjectMetadata(retainedFreezeProject(doc.project),doc.sources,doc.version!);

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

  validateFrozenProjectAudio(doc.project,sources);
  return { project: doc.project, sources };
}

/** Shared load/cache checks for source recipes and retained frozen originals. */
export function validateFrozenProjectAudio(project:TimelineProject,sources:Map<string,AudioSource>){
 validateSourceJournalAudio(project,sources);
 if(!validProjectSourceChains(project))throw new Error('Invalid source effect chain');
 if(!validTrackFreezes(project,new Set(sources.keys())))throw new Error('Invalid frozen track');
 if(!project.tracks.some(t=>t.freeze))return;
 const metadata=[...sources.values()].map(source=>({id:source.id,name:source.name,sampleRate:source.sampleRate,channels:source.channels,duration:source.duration}));
 validateProjectMetadata(project,metadata,FREEZE_VERSION);
 validateProjectMetadata(retainedFreezeProject(project),metadata,FREEZE_VERSION);
 if([...projectSourceIds(project)].some(id=>!sources.has(id)))throw new Error('Missing retained freeze audio');
 for(const track of project.tracks){const f=track.freeze;if(f){const buffer=sources.get(f.sourceId)!.buffer;if(buffer.length!==f.frames||buffer.sampleRate!==f.sampleRate||buffer.numberOfChannels!==2)throw new Error('Invalid frozen audio format');for(const clip of f.original.segments){const original=sources.get(clip.sourceId)!.buffer;if(Math.round((clip.sourceOffset+clip.duration)*original.sampleRate)>original.length)throw new Error('Missing retained freeze audio');}}}
}

/** Include alternate takes and originals, without importing another project's source map. */
export function projectSourceIds(project:TimelineProject):Set<string>{
 const ids=new Set<string>();
 for(const track of project.tracks){for(const clip of [...track.segments,...(track.compBaseSegments??[]),...(track.freeze?.original.segments??[])]){ids.add(clip.sourceId);if(clip.sourceEdit){ids.add(clip.sourceEdit.sourceId);if(clip.sourceEdit.retime?.original.sourceId)ids.add(clip.sourceEdit.retime.original.sourceId);}if(clip.retime?.original.sourceId)ids.add(clip.retime.original.sourceId);}for(const take of track.takes??[])ids.add(take.sourceId);}
 for(const record of project.sourceTranscripts??[])ids.add(record.sourceId);return ids;
}
