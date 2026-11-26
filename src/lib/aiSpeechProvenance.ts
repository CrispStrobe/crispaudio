import type {AudioSegment, AudioSource, Retime, SourceEditOperation, TimelineProject} from '../types/audio';
import {audibleTracks, timelineDuration} from './timelineView';
import {gainAt, normalizeGainPoints} from './mixAutomation';

/** A successful local speech-regeneration operation, not an inference about
 * the recording's origin. No source path, transcript or person is recorded. */
export interface SpeechGeneration {
  operation: 'speech-regeneration';
  engine: 'CrispASR';
  provider: 'local';
  basis: 'observed-operation' | 'imported-unsigned-declaration';
  model: string;
  generatedAtUnixMs: number;
}
export interface AiSpeechRegion extends SpeechGeneration {start: number; end: number}
export interface AiAudioReceipt {
  schema: 'urn:crispaudio:ai-audio-provenance:1';
  generator: 'CrispAudio';
  contentType: 'audio-derived-from-regenerated-speech';
  scope: 'contributing-source-lineage';
  originalSourceOrigin: 'not-asserted';
  signature: 'unsigned';
  regions: AiSpeechRegion[];
}
// Only a published catalog filename is safe to carry. A user-chosen filename
// may itself contain a person's name, credential or other private information.
const publicModels = new Set(['sidon-v0.1-q8_0.gguf']);
const modelName = (path: string) => {
  const name = path.split(/[\\/]/).pop()!;
  return publicModels.has(name) ? name : 'configured-local-speech-model';
};
export function speechGeneration(model: string, now = new Date()): SpeechGeneration {
  return {operation: 'speech-regeneration', engine: 'CrispASR', provider: 'local', basis: 'observed-operation',
    model: modelName(model), generatedAtUnixMs: now.getTime()};
}
function generation(value: unknown): SpeechGeneration | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as SpeechGeneration;
  if (v.operation !== 'speech-regeneration' || v.engine !== 'CrispASR' || v.provider !== 'local' ||
      !['observed-operation', 'imported-unsigned-declaration'].includes(v.basis) ||
      typeof v.model !== 'string' || !v.model || !Number.isFinite(v.generatedAtUnixMs) || v.generatedAtUnixMs < 0) return;
  return {operation: v.operation, engine: v.engine, provider: v.provider, basis: v.basis,
    model: modelName(v.model), generatedAtUnixMs: v.generatedAtUnixMs};
}
export function speechRegions(value: unknown): AiSpeechRegion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(v => {
    const g = generation(v);
    return g && Number.isFinite(v.start) && Number.isFinite(v.end) && v.start >= 0 && v.end > v.start
      ? [{...g, start: v.start, end: v.end}] : [];
  });
}
function crop(regions: AiSpeechRegion[], start: number, end: number): AiSpeechRegion[] {
  return regions.flatMap(r => r.end > start && r.start < end
    ? [{...r, start: Math.max(start, r.start) - start, end: Math.min(end, r.end) - start}] : []);
}
/** Source edits retain existing attribution through crops and DSP; only an
 * observed speech-generation receipt adds attribution. Silence removes it. */
export function editedSpeechRegions(source: AudioSource, offset: number, duration: number,
  operation?: SourceEditOperation): AiSpeechRegion[] {
  let regions = crop(speechRegions(source.aiSpeech), offset, offset + duration);
  if (operation?.type === 'silence' && (operation.channel === -1 || source.channels === 1)) {
    for (const range of operation!.ranges) {
      const a = range.start / source.sampleRate, b = range.end / source.sampleRate;
      regions = regions.flatMap(r => r.end <= a || r.start >= b ? [r] : [
        ...(r.start < a ? [{...r, end: a}] : []), ...(r.end > b ? [{...r, start: b}] : []),
      ]);
    }
  }
  const g = operation?.type === 'speech' ? generation(operation.aiSpeech) : undefined;
  if (g) for (const range of operation!.ranges) {
    const start = Math.max(0, range.start / source.sampleRate), end = Math.min(duration, range.end / source.sampleRate);
    if (end > start) regions.push({...g, start, end});
  }
  return regions;
}
type SourceMarks = Pick<AudioSource, 'aiSpeech'>;
/** Resolve attribution in the derivative's buffer coordinates, before clip
 * gain or trimming. Also supports retained retimes made before this field. */
export function retimedSpeechRegions(regions: AiSpeechRegion[], r: Retime): AiSpeechRegion[] {
  const duration = r.renderDuration ?? r.original.duration / r.rate;
  const scale = duration / r.original.duration;
  return crop(regions, r.original.offset, r.original.offset + r.original.duration)
    .map(g => ({...g, start: Math.max(0, Math.min(duration, r.reverse ? duration - g.end * scale : g.start * scale)),
      end: Math.max(0, Math.min(duration, r.reverse ? duration - g.start * scale : g.end * scale))}));
}
export function sourceSpeechRegions(clip: AudioSegment, sources: Map<string, SourceMarks>): AiSpeechRegion[] {
  const direct = speechRegions(sources.get(clip.sourceId)?.aiSpeech);
  if (!direct.length && clip.retime?.original.sourceId) {
    return retimedSpeechRegions(speechRegions(sources.get(clip.retime.original.sourceId)?.aiSpeech), clip.retime);
  }
  return direct;
}
export function clipSpeechRegions(clip: AudioSegment, sources: Map<string, SourceMarks>): AiSpeechRegion[] {
  if (clip.gain === 0) return [];
  return crop(sourceSpeechRegions(clip, sources), clip.sourceOffset, clip.sourceOffset + clip.duration)
    .map(r => ({...r, start: r.start + clip.startTime, end: r.end + clip.startTime}));
}
export function audioReceipt(regions: AiSpeechRegion[]): AiAudioReceipt | undefined {
  const safe = speechRegions(regions);
  return safe.length ? {schema: 'urn:crispaudio:ai-audio-provenance:1', generator: 'CrispAudio',
    contentType: 'audio-derived-from-regenerated-speech', scope: 'contributing-source-lineage', originalSourceOrigin: 'not-asserted',
    signature: 'unsigned', regions: safe} : undefined;
}
/** Only contributing clips within this export's range. Times are relative to
 * the exported audio. A frozen track retains its original clip provenance. */
export function projectAudioReceipt(project: TimelineProject, sources: Map<string, SourceMarks>,
  range = {start: 0, end: timelineDuration(project)}): AiAudioReceipt | undefined {
  if (project.masterVolume === 0) return;
  const audible = new Map(audibleTracks(project.tracks).map(t => [t.id, t]));
  const automation = (track: TimelineProject['tracks'][number]) => track.freeze?.original.automation ?? track.automation;
  // Split at gain breakpoints so wholly silent intervals are not attributed.
  // Nonnegative linear/step automation cannot cross zero inside an interval.
  const points = [...new Set([...audible.values()].flatMap(t => normalizeGainPoints(automation(t)).map(p => p.time)))];
  const reachesMaster = (id: string, time: number, seen = new Set<string>()): boolean => {
    if (id === 'master') return true;
    const track = audible.get(id);
    if (!track || seen.has(id) || gainAt(automation(track), time) === 0) return false;
    const next = new Set(seen).add(id);
    return (track.volume !== 0 && reachesMaster(track.output ?? 'master', time, next)) ||
      !!track.sends?.some(s => s.gain > 0 && (s.preFader || track.volume !== 0) && reachesMaster(s.target, time, next));
  };
  const regions = [...audible.values()].flatMap(track => {
    const clips = track.freeze && !speechRegions(sources.get(track.freeze.sourceId)?.aiSpeech).length
      ? track.freeze.original.segments : track.segments;
    return clips.flatMap(c => clipSpeechRegions(c, sources)).flatMap(r => {
      const start = Math.max(range.start, r.start), end = Math.min(range.end, r.end);
      if (end <= start) return [];
      const bounds = [start, ...points.filter(t => t > start && t < end).sort((a, b) => a - b), end];
      return bounds.slice(1).flatMap((b, i) => reachesMaster(track.id, (bounds[i] + b) / 2)
        ? [{...r, start: bounds[i], end: b}] : []);
    });
  });
  return audioReceipt(crop(regions, range.start, range.end));
}
export const receiptText = (receipt: AiAudioReceipt) => JSON.stringify(receipt, null, 2);

/** Read only our own unsigned WAV carrier, before decodeAudioData detaches the
 * bytes. Imported declarations never become observed or authenticated events.
 * Malformed/oversized metadata is ignored without blocking playable audio. */
export function importedSpeechWavRegions(bytes: Uint8Array): AiSpeechRegion[] {
  try {
    const text = (a: number, b: number) => new TextDecoder().decode(bytes.subarray(a, b));
    if (bytes.length < 12 || text(0, 4) !== 'RIFF' || text(8, 12) !== 'WAVE') return [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(4, true) + 8 !== bytes.length) return [];
    let receipt: AiAudioReceipt | undefined;
    for (let at = 12; at < bytes.length;) {
      if (at + 8 > bytes.length) return [];
      const size = view.getUint32(at + 4, true), end = at + 8 + size;
      if (end > bytes.length) return [];
      if (text(at, at + 4) === 'capr') {
        if (receipt || size > 1024 * 1024) return [];
        receipt = JSON.parse(text(at + 8, end)) as AiAudioReceipt;
      }
      at = end === bytes.length ? end : end + size % 2;
    }
    if (receipt?.schema !== 'urn:crispaudio:ai-audio-provenance:1' || receipt.generator !== 'CrispAudio' ||
        receipt.signature !== 'unsigned' || receipt.contentType !== 'audio-derived-from-regenerated-speech' ||
        receipt.scope !== 'contributing-source-lineage' || receipt.originalSourceOrigin !== 'not-asserted' ||
        !Array.isArray(receipt.regions) || receipt.regions.length > 4096) return [];
    const regions = speechRegions(receipt.regions.map(r => ({...r, basis: 'imported-unsigned-declaration'})));
    return regions.length === receipt.regions.length ? regions : [];
  } catch { return []; }
}

/** Duration changes preserve source ancestry; deterministic voice effects do
 * not add generation events. The source bounds exclude unrelated intervals. */
export function scaledSpeechRegions(regions: AiSpeechRegion[], sourceDuration: number, outputDuration: number): AiSpeechRegion[] {
  if (!(sourceDuration > 0) || !(outputDuration > 0)) return [];
  const scale = outputDuration / sourceDuration;
  return crop(speechRegions(regions), 0, sourceDuration).map(r => ({...r,
    start: Math.max(0, Math.min(outputDuration, r.start * scale)), end: Math.max(0, Math.min(outputDuration, r.end * scale))}));
}

function chunk(id: string, bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(8 + bytes.length + (bytes.length % 2));
  out.set(new TextEncoder().encode(id));
  new DataView(out.buffer).setUint32(4, bytes.length, true); out.set(bytes, 8); return out;
}
/** This only appends unsigned application metadata. It never claims C2PA
 * authentication, and refuses to change a WAV carrying a native C2PA chunk. */
export function markSpeechWav(bytes: Uint8Array, receipt?: AiAudioReceipt): Uint8Array<ArrayBuffer> {
  if (!receipt) return Uint8Array.from(bytes);
  const text = (a: number, b: number) => new TextDecoder().decode(bytes.subarray(a, b));
  if (bytes.length < 12 || text(0, 4) !== 'RIFF' || text(8, 12) !== 'WAVE') throw new Error('Expected WAV audio');
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (data.getUint32(4, true) + 8 !== bytes.length) throw new Error('Invalid WAV size');
  for (let at = 12; at < bytes.length;) {
    if (at + 8 > bytes.length) throw new Error('Truncated WAV chunk');
    const size = data.getUint32(at + 4, true);
    const end = at + 8 + size;
    if (end > bytes.length) throw new Error('Truncated WAV chunk');
    if (text(at, at + 4) === 'c2pa') throw new Error('Preserve the existing signed WAV; use a provenance sidecar');
    // Existing PCM encoders omit a final odd data chunk's alignment byte.
    // It is safe to add that byte before appending the next chunk.
    at = end === bytes.length ? end : end + (size % 2);
  }
  const encode = (s: string) => new TextEncoder().encode(s);
  const comment = chunk('ICMT', encode('Audio derived from AI-regenerated speech; see unsigned capr metadata.\0'));
  const info = new Uint8Array(4 + comment.length); info.set(encode('INFO')); info.set(comment, 4);
  const list = chunk('LIST', info), claim = chunk('capr', encode(receiptText(receipt)));
  const aligned = bytes.length + (bytes.length % 2);
  const out = new Uint8Array(aligned + list.length + claim.length);
  out.set(bytes); out.set(list, aligned); out.set(claim, aligned + list.length);
  new DataView(out.buffer).setUint32(4, out.length - 8, true); return out;
}
export async function markSpeechBlob(blob: Blob, receipt?: AiAudioReceipt): Promise<Blob> {
  return receipt ? new Blob([markSpeechWav(new Uint8Array(await blob.arrayBuffer()), receipt)], {type: blob.type}) : blob;
}
