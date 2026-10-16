import type {AudioSource, TimelineProject} from '../types/audio';
import {parseTranscript} from './transcript';
import {validSourceTranscripts} from './sourceTranscript';
import {speechLayout} from './spokenEdits';

/** Attach real imported timestamps. Cue-only formats never acquire word timing. */
export function withTimelineTranscript(project: TimelineProject, text: string, offset = 0): TimelineProject {
  const cues = parseTranscript(text, offset);
  if (cues.some(c => c.end > project.duration + .02)) throw new Error('spoken.bounds');
  return {...project, transcript: cues,
    transcriptLayout: cues.some(c => c.words?.length) ? speechLayout(project) : undefined};
}
export function withSourceTranscript(project: TimelineProject, source: AudioSource, text: string): TimelineProject {
  const cues = parseTranscript(text);
  if (cues.some(c => c.end > source.duration + .02)) throw new Error('sourceSpeech.bounds');
  const next = {...project, sourceTranscripts: [...(project.sourceTranscripts ?? []).filter(r => r.sourceId !== source.id),
    {id: crypto.randomUUID(), sourceId: source.id, name: source.name, cues}]};
  if (!validSourceTranscripts(next, new Set(next.sourceTranscripts.map(r => r.sourceId)))) throw new Error('Invalid word timestamps');
  return next;
}
