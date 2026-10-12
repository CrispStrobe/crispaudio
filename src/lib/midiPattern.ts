import type { AudioSegment, AudioSource, TimelineProject } from '../types/audio';
import { computeWaveformPeaks } from '../audio/utils/audioBufferUtils';
import { timelineDuration } from './timelineView';
export interface MidiNote {
    id: string;
    pitch: number;
    start: number;
    duration: number;
    velocity: number;
    channel: number;
}
/** Notes use original source seconds, so existing clip trims/splits need no note retiming. */
export interface MidiPattern {
    version: 1;
    length: number;
    instrument: 'sine' | 'bell';
    release: number;
    notes: MidiNote[];
}
export const EMPTY_MIDI: MidiPattern = { version: 1, length: 4, instrument: 'sine', release: .08, notes: [] };
export function validMidiPattern(value: unknown): value is MidiPattern {
    if (!value || typeof value !== 'object')
        return false;
    const m = value as MidiPattern;
    if (m.version !== 1 || !Number.isFinite(m.length) || m.length < .01 || m.length > 120 || !['sine', 'bell'].includes(m.instrument) || !Number.isFinite(m.release) || m.release < .005 || m.release > 1 || !Array.isArray(m.notes) || m.notes.length > 2048)
        return false;
    const ids = new Set<string>();
    let voiceSeconds = 0;
    for (const n of m.notes) {
        if (!n || typeof n.id !== 'string' || !n.id || n.id.length > 128 || ids.has(n.id) || !Number.isInteger(n.pitch) || n.pitch < 0 || n.pitch > 127 || !Number.isInteger(n.channel) || n.channel < 0 || n.channel > 15 || !Number.isFinite(n.start) || n.start < 0 || !Number.isFinite(n.duration) || n.duration < .001 || n.start + n.duration > m.length + 1e-8 || !Number.isFinite(n.velocity) || n.velocity <= 0 || n.velocity > 1)
            return false;
        ids.add(n.id);
        voiceSeconds += n.duration + m.release;
    }
    return voiceSeconds <= 600;
}
export function validProjectMidi(project: TimelineProject) { return project.tracks.every(t => (t.segments ?? []).every(c => c.midi === undefined || validMidiPattern(c.midi))); }
export function renderMidiPCM(pattern: MidiPattern, sampleRate: number): Float32Array<ArrayBuffer> {
    if (!validMidiPattern(pattern) || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000)
        throw new Error('Invalid MIDI pattern or sample rate');
    const pcm = new Float32Array(Math.ceil((pattern.length + pattern.release) * sampleRate));
    for (const n of pattern.notes) {
        const frequency = 440 * 2 ** ((n.pitch - 69) / 12), first = Math.ceil(n.start * sampleRate), last = Math.min(pcm.length, Math.ceil((n.start + n.duration + pattern.release) * sampleRate));
        if (frequency >= sampleRate / 2)
            throw new Error('Note pitch exceeds this project sample rate');
        for (let i = first; i < last; i++) {
            const time = i / sampleRate - n.start, release = Math.max(0, 1 - Math.max(0, time - n.duration) / pattern.release), attack = Math.min(1, time / .005), phase = 2 * Math.PI * frequency * time;
            const wave = pattern.instrument === 'sine' ? Math.sin(phase) : Math.exp(-time * 2) * (Math.sin(phase) + (frequency * 2 < sampleRate / 2 ? .35 * Math.sin(phase * 2) : 0) + (frequency * 3 < sampleRate / 2 ? .12 * Math.sin(phase * 3) : 0));
            if (frequency < sampleRate / 2)
                pcm[i] += .15 * n.velocity * attack * release * wave;
        }
    }
    let peak = 0;
    for (const sample of pcm)
        peak = Math.max(peak, Math.abs(sample));
    if (peak > .9)
        for (let i = 0; i < pcm.length; i++)
            pcm[i] *= .9 / peak;
    return pcm;
}
export function quantizeMidi(pattern: MidiPattern, seconds: number): MidiPattern {
    if (!Number.isFinite(seconds) || seconds <= 0)
        return pattern;
    return { ...pattern, notes: pattern.notes.map(n => { const start = Math.min(pattern.length - .001, Math.max(0, Math.round(n.start / seconds) * seconds)); return { ...n, start, duration: Math.min(n.duration, pattern.length - start) }; }) };
}
/** Publication rechecks the editor snapshot and locks after preparing the PCM. */
export function prepareMidiClip(project: TimelineProject, sources: Map<string, AudioSource>, pattern: MidiPattern, trackId: string, position: number, replaceId?: string) {
    if (!validMidiPattern(pattern) || !Number.isFinite(position) || position < 0 || (!replaceId && position > 86400))
        throw new Error('Invalid MIDI pattern');
    if (trackId === 'new' && !replaceId) {
        trackId = crypto.randomUUID();
        project = { ...project, tracks: [...project.tracks, { id: trackId, name: 'MIDI', segments: [], muted: false, solo: false, volume: 1, pan: 0 }] };
    }
    const track = project.tracks.find(t => t.id === trackId), old = track?.segments.find(c => c.id === replaceId);
    if (!track || track.locked || track.kind === 'bus' || (replaceId && !old))
        throw new Error('Choose an unlocked audio track');
    if (old && (old.linkGroup || old.retime))
        throw new Error('Detach linked or retimed clips before changing their notes');
    const pcm = renderMidiPCM(pattern, project.sampleRate), buffer = new AudioBuffer({ length: pcm.length, numberOfChannels: 1, sampleRate: project.sampleRate });
    buffer.copyToChannel(pcm, 0);
    const sourceId = crypto.randomUUID(), source: AudioSource = { id: sourceId, name: 'MIDI', buffer, duration: buffer.duration, sampleRate: buffer.sampleRate, channels: 1, peaks: computeWaveformPeaks(pcm, Math.min(8000, Math.ceil(buffer.duration * 200))) };
    if (old && old.sourceOffset + old.duration > buffer.duration + 1 / project.sampleRate)
        throw new Error('Pattern is shorter than the trimmed clip window');
    const clip: AudioSegment = old ? { ...old, midi: structuredClone(pattern), sourceId } : { id: crypto.randomUUID(), trackId, sourceId, startTime: position, duration: buffer.duration, sourceOffset: 0, fadeInDuration: 0, fadeOutDuration: 0, fadeInCurve: 'linear', fadeOutCurve: 'linear', effects: [], gain: 1, color: '#a78bfa', name: 'MIDI', midi: structuredClone(pattern) };
    const next = { ...project, tracks: project.tracks.map(t => t.id === trackId ? { ...t, segments: old ? t.segments.map(c => c.id === old.id ? clip : c) : [...t.segments, clip] } : t) }, nextSources = new Map(sources);
    nextSources.set(sourceId, source);
    return { project: { ...next, duration: timelineDuration(next) }, sources: nextSources, clip };
}
/** A minimal note/sustain recorder; repeated notes close the preceding voice. */
export class MidiCapture {
    notes: MidiNote[] = [];
    private held = new Map<string, {
        pitch: number;
        channel: number;
        velocity: number;
        start: number;
        released: boolean;
    }>();
    private sustain = new Set<number>();
    private length: number;
    constructor(length: number) { this.length = length; }
    message(data: ArrayLike<number>, time: number) {
        const status = data[0], pitch = data[1], velocity = data[2];
        if (data.length !== 3 || !Number.isInteger(status) || status < 128 || status > 239 || !Number.isInteger(pitch) || pitch < 0 || pitch > 127 || !Number.isInteger(velocity) || velocity < 0 || velocity > 127 || !Number.isFinite(time))
            return;
        time = Math.max(0, Math.min(this.length, time));
        const channel = status & 15, type = status & 240, key = `${channel}:${pitch}`;
        if (type === 0x90 && velocity > 0) {
            this.finish(key, time);
            this.held.set(key, { pitch, channel, velocity: velocity / 127, start: time, released: false });
        }
        else if (type === 0x80 || type === 0x90) {
            const n = this.held.get(key);
            if (n) {
                if (this.sustain.has(channel))
                    n.released = true;
                else
                    this.finish(key, time);
            }
        }
        else if (type === 0xb0 && pitch === 64) {
            if (velocity >= 64)
                this.sustain.add(channel);
            else {
                this.sustain.delete(channel);
                for (const [k, n] of this.held)
                    if (n.channel === channel && n.released)
                        this.finish(k, time);
            }
        }
        else if (type === 0xb0 && (pitch === 120 || pitch === 123)) {
            this.sustain.delete(channel);
            for (const [k, n] of this.held)
                if (n.channel === channel)
                    this.finish(k, time);
        }
    }
    private finish(key: string, time: number) { const n = this.held.get(key); if (!n)
        return; this.held.delete(key); const duration = time - n.start; if (duration >= .001 && this.notes.length < 2048)
        this.notes.push({ id: crypto.randomUUID(), pitch: n.pitch, channel: n.channel, velocity: n.velocity, start: n.start, duration }); }
    stop(time: number) { for (const key of this.held.keys())
        this.finish(key, Math.max(0, Math.min(this.length, time))); this.sustain.clear(); return this.notes; }
}
