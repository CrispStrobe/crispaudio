import { validMidiPattern, type MidiPattern } from './midiPattern';
import { validMusic, type MusicalSettings } from './musicalTime';
/** Standard MIDI File type 0, PPQ480. No device output or proprietary data. */
export function encodeMidiFile(pattern: MidiPattern, music: MusicalSettings): Uint8Array<ArrayBuffer> {
    if (!validMidiPattern(pattern) || !validMusic(music))
        throw new Error('Invalid MIDI pattern');
    const tick = (seconds: number) => Math.round(seconds * music.tempo / 60 * 480), tempo = Math.round(60000000 / music.tempo), events: {
        time: number;
        priority: number;
        bytes: number[];
    }[] = [];
    events.push({ time: 0, priority: -2, bytes: [255, 81, 3, tempo >> 16 & 255, tempo >> 8 & 255, tempo & 255] }, { time: 0, priority: -1, bytes: [255, 88, 4, music.numerator, Math.log2(music.denominator), 24, 8] });
    for (const n of pattern.notes) {
        const start = tick(n.start), end = Math.max(start + 1, tick(n.start + n.duration));
        events.push({ time: start, priority: 1, bytes: [0x90 | n.channel, n.pitch, Math.max(1, Math.round(n.velocity * 127))] }, { time: end, priority: 0, bytes: [0x80 | n.channel, n.pitch, 0] });
    }
    events.sort((a, b) => a.time - b.time || a.priority - b.priority);
    const track: number[] = [], varlen = (value: number) => { const bytes = [value & 127]; while ((value >>>= 7) > 0)
        bytes.unshift((value & 127) | 128); return bytes; };
    let previous = 0;
    for (const event of events) {
        track.push(...varlen(event.time - previous), ...event.bytes);
        previous = event.time;
    }
    track.push(...varlen(Math.max(previous, tick(pattern.length)) - previous), 255, 47, 0);
    return new Uint8Array([77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224, 77, 84, 114, 107, track.length >>> 24 & 255, track.length >>> 16 & 255, track.length >>> 8 & 255, track.length & 255, ...track]);
}
export async function saveMidiFile(bytes: Uint8Array<ArrayBuffer>) {
    if ('__TAURI_INTERNALS__' in window) {
        const { save } = await import('@tauri-apps/plugin-dialog'), { writeFile } = await import('@tauri-apps/plugin-fs'), path = await save({ defaultPath: 'pattern.mid', filters: [{ name: 'MIDI', extensions: ['mid'] }] });
        if (path)
            await writeFile(path, bytes);
        return;
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' })), a = document.createElement('a');
    a.href = url;
    a.download = 'pattern.mid';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
