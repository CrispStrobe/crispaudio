import type { TimelineProject } from '../types/audio';
export interface MusicalSettings {
    tempo: number;
    numerator: number;
    denominator: 1 | 2 | 4 | 8 | 16;
    origin: number;
    ruler: 'seconds' | 'beats';
    grid: 'off' | 'bar' | 'quarter' | 'eighth' | 'sixteenth' | 'triplet';
    metronome: boolean;
    clickLevel: number;
}
export const DEFAULT_MUSIC: MusicalSettings = { tempo: 120, numerator: 4, denominator: 4, origin: 0, ruler: 'seconds', grid: 'off', metronome: false, clickLevel: .5 };
export function validMusic(value: unknown): value is MusicalSettings { if (!value || typeof value !== 'object')
    return false; const m = value as MusicalSettings; return Number.isFinite(m.tempo) && m.tempo >= 20 && m.tempo <= 300 && Number.isInteger(m.numerator) && m.numerator >= 1 && m.numerator <= 32 && [1, 2, 4, 8, 16].includes(m.denominator) && Number.isFinite(m.origin) && m.origin >= 0 && m.origin <= 86400 && ['seconds', 'beats'].includes(m.ruler) && ['off', 'bar', 'quarter', 'eighth', 'sixteenth', 'triplet'].includes(m.grid) && typeof m.metronome === 'boolean' && Number.isFinite(m.clickLevel) && m.clickLevel >= 0 && m.clickLevel <= 1; }
export function beatSeconds(m: MusicalSettings) { return 60 / m.tempo * 4 / m.denominator; }
export function barSeconds(m: MusicalSettings) { return beatSeconds(m) * m.numerator; }
export function musicalPosition(seconds: number, m: MusicalSettings) { const beats = (seconds - m.origin) / beatSeconds(m), bar = Math.floor((beats + 1e-9) / m.numerator), beat = beats - bar * m.numerator; return { bar: bar + 1, beat: Math.floor(beat + 1e-9) + 1, fraction: beat - Math.floor(beat + 1e-9) }; }
export function barTime(bar: number, m: MusicalSettings) { return m.origin + (bar - 1) * barSeconds(m); }
export function musicalLabel(seconds: number, m: MusicalSettings) { const p = musicalPosition(seconds, m); return `${p.bar}.${p.beat}`; }
export function gridSeconds(m: MusicalSettings) { const q = 60 / m.tempo; return m.grid === 'bar' ? barSeconds(m) : m.grid === 'quarter' ? q : m.grid === 'eighth' ? q / 2 : m.grid === 'sixteenth' ? q / 4 : m.grid === 'triplet' ? q / 3 : 0; }
export function snapProjectTime(time: number, project: TimelineProject) { const m = project.music, grid = m && m.grid !== 'off' ? gridSeconds(m) : project.snapGrid ?? .1, origin = m && m.grid !== 'off' ? m.origin : 0; return Math.max(0, grid ? origin + Math.round((time - origin) / grid) * grid : time); }
export function musicalTicks(start: number, end: number, zoom: number, m: MusicalSettings) { const beat = beatSeconds(m), bar = beat * m.numerator, barStride = 2 ** Math.max(0, Math.ceil(Math.log2(80 / (bar * zoom)))), major = bar * barStride, minor = beat * zoom >= 12 ? beat : major; const ticks: {
    time: number;
    label?: string;
}[] = []; let i = Math.ceil((start - m.origin) / minor - 1e-9); for (; ticks.length < 2048; i++) {
    const time = m.origin + i * minor;
    if (time > end + 1e-9)
        break;
    if (time < 0)
        continue;
    const majorIndex = (time - m.origin) / major, isMajor = Math.abs(majorIndex - Math.round(majorIndex)) < 1e-7;
    ticks.push({ time, ...(isMajor ? { label: musicalLabel(time, m) } : {}) });
} return ticks; }
/** Arithmetic beat enumeration skips stale events and never accumulates timer drift. */
export function metronomeBeats(start: number, end: number, m: MusicalSettings) { const seconds = beatSeconds(m), first = Math.ceil((start - m.origin) / seconds - 1e-9), last = Math.floor((end - m.origin) / seconds + 1e-9), events: {
    time: number;
    accent: boolean;
    index: number;
}[] = []; for (let i = first; i <= last && events.length < 256; i++)
    events.push({ time: m.origin + i * seconds, accent: ((i % m.numerator) + m.numerator) % m.numerator === 0, index: i }); return events; }
