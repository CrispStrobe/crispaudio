import { expect, it } from 'vitest';
import { MidiTransportCapture } from '../../../src/lib/midiTransportCapture';

const clock = (time: number, generation = 3) => ({ time, generation, start: 10 });
it('places a pass at the audio-clock playhead and stores source-relative notes', () => {
    const pass = new MidiTransportCapture(clock(10.125), 4);
    pass.message([0x92, 69, 100], clock(10.375));
    pass.message([0x82, 69, 0], clock(11.125));
    expect(pass.position).toBe(10.125);
    expect(pass.stop(clock(11.5))[0]).toMatchObject({ start: .25, duration: .75, channel: 2, pitch: 69, velocity: 100 / 127 });
});
it('ends at a loop or seek generation without accepting notes from the new pass', () => {
    const pass = new MidiTransportCapture(clock(10), 4);
    pass.message([0x90, 60, 100], clock(10.1));
    expect(pass.message([0x90, 62, 100], clock(2, 4))).toBe(false);
    const notes = pass.stop(clock(2, 4), .75);
    expect(notes).toHaveLength(1);
    expect(notes[0].duration).toBeCloseTo(.65);
    expect(pass.message([0x90, 64, 100], clock(11))).toBe(false);
});
it('closes held sustain at the exact audio-clock stop even between UI polls', () => {
    const pass = new MidiTransportCapture(clock(10), 4);
    pass.message([0x90, 60, 100], clock(10.1));
    pass.message([0xb0, 64, 127], clock(10.2));
    pass.message([0x80, 60, 0], clock(10.3));
    expect(pass.stop(undefined, .317)[0].duration).toBeCloseTo(.217);
});
it('caps held notes at the pattern or programme boundary after a late poll', () => {
    const pass = new MidiTransportCapture(clock(10), .5);
    pass.message([0x90, 60, 100], clock(10.125));
    expect(pass.tick(clock(11))).toBe(false);
    expect(pass.stop(undefined, 2)[0]).toMatchObject({ start: .125, duration: .375 });
});
it('rejects a backwards clock in the same generation and invalid capture bounds', () => {
    const pass = new MidiTransportCapture(clock(10), 1);
    pass.tick(clock(10.5));
    expect(pass.tick(clock(10.4))).toBe(false);
    for (const length of [0, 121, NaN]) expect(() => new MidiTransportCapture(clock(10), length)).toThrow();
    expect(() => new MidiTransportCapture(clock(NaN), 1)).toThrow();
});
