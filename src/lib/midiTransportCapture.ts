import { MidiCapture, type MidiNote } from './midiPattern';

export interface MidiTransportClock { time: number; start: number; generation: number }

/** One source-clock pass. A seek, loop or graph restart ends the pass; it never
 * folds notes from another transport generation into the same source window. */
export class MidiTransportCapture {
    readonly position: number;
    private recorder: MidiCapture;
    private generation: number;
    private elapsed = 0;
    private ended = false;
    private length: number;
    get count(): number { return this.recorder.notes.length; }
    constructor(clock: MidiTransportClock, length: number) {
        if (!Number.isFinite(clock.time) || clock.time < 0 || !Number.isInteger(clock.generation) || !Number.isFinite(length) || length < .01 || length > 120)
            throw new Error('Invalid MIDI transport capture');
        this.position = clock.time;
        this.length = length;
        this.generation = clock.generation;
        this.recorder = new MidiCapture(length);
    }
    tick(clock: MidiTransportClock | undefined): boolean {
        if (this.ended) return false;
        if (!clock || clock.generation !== this.generation || !Number.isFinite(clock.time) || clock.time < this.position + this.elapsed - 1e-8) {
            this.ended = true;
            return false;
        }
        this.elapsed = Math.min(this.length, Math.max(0, clock.time - this.position));
        if (this.elapsed >= this.length) this.ended = true;
        return !this.ended;
    }
    message(data: ArrayLike<number>, clock: MidiTransportClock | undefined): boolean {
        if (!this.tick(clock)) return false;
        this.recorder.message(data, this.elapsed);
        return true;
    }
    stop(clock?: MidiTransportClock, elapsedAtStop?: number): MidiNote[] {
        if ((!clock || clock.generation !== this.generation) && Number.isFinite(elapsedAtStop))
            this.elapsed = Math.min(this.length, Math.max(this.elapsed, elapsedAtStop!));
        this.tick(clock);
        this.ended = true;
        return this.recorder.stop(this.elapsed);
    }
}
