import type { MidiPattern } from '../../lib/midiPattern';
/** Input audition is monitor-only; committed clips use deterministic PCM. */
export class MidiAudition {
    private ctx: AudioContext;
    private destination: AudioNode;
    private pattern: MidiPattern;
    private voices = new Map<string, {
        oscillators: OscillatorNode[];
        gain: GainNode;
        partials: GainNode[];
        channel: number;
        released: boolean;
    }>();
    private sustain = new Set<number>();
    constructor(ctx: AudioContext, destination: AudioNode, pattern: MidiPattern) { this.ctx = ctx; this.destination = destination; this.pattern = pattern; }
    message(data: ArrayLike<number>) {
        if (data.length !== 3)
            return;
        const status = data[0], pitch = data[1], velocity = data[2];
        if (status < 128 || status > 239 || pitch < 0 || pitch > 127 || velocity < 0 || velocity > 127)
            return;
        const channel = status & 15, type = status & 240, key = `${channel}:${pitch}`;
        if (type === 0x90 && velocity > 0) {
            this.kill(key);
            if (this.voices.size >= 8)
                this.kill(this.voices.keys().next().value!);
            const gain = this.ctx.createGain(), now = this.ctx.currentTime;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(.08 * velocity / 127, now + .005);
            if (this.pattern.instrument === 'bell')
                gain.gain.setTargetAtTime(0, now + .005, .5);
            gain.connect(this.destination);
            const oscillators: OscillatorNode[] = [], partials: GainNode[] = [], frequency = 440 * 2 ** ((pitch - 69) / 12);
            for (const [multiple, level] of (this.pattern.instrument === 'bell' ? [[1, 1], [2, .35], [3, .12]] : [[1, 1]])) {
                if (frequency * multiple >= this.ctx.sampleRate / 2)
                    continue;
                const o = this.ctx.createOscillator(), partial = this.ctx.createGain();
                o.frequency.value = frequency * multiple;
                partial.gain.value = level;
                o.connect(partial).connect(gain);
                o.onended = () => { o.disconnect(); partial.disconnect(); };
                o.start(now);
                oscillators.push(o);
                partials.push(partial);
            }
            this.voices.set(key, { oscillators, gain, partials, channel, released: false });
        }
        else if (type === 0x80 || type === 0x90) {
            const v = this.voices.get(key);
            if (v) {
                if (this.sustain.has(channel))
                    v.released = true;
                else
                    this.release(key);
            }
        }
        else if (type === 0xb0 && pitch === 64) {
            if (velocity >= 64)
                this.sustain.add(channel);
            else {
                this.sustain.delete(channel);
                for (const [k, v] of this.voices)
                    if (v.channel === channel && v.released)
                        this.release(k);
            }
        }
        else if (type === 0xb0 && (pitch === 120 || pitch === 123))
            for (const [k, v] of this.voices)
                if (v.channel === channel)
                    this.kill(k);
    }
    private release(key: string) { const v = this.voices.get(key); if (!v)
        return; v.released = true; const now = this.ctx.currentTime; v.gain.gain.cancelAndHoldAtTime(now); v.gain.gain.linearRampToValueAtTime(0, now + this.pattern.release); for (const o of v.oscillators)
        o.stop(now + this.pattern.release); const first = v.oscillators[0]; if (first) {
        const previous = first.onended;
        first.onended = e => { previous?.call(first, e); v.gain.disconnect(); if (this.voices.get(key) === v)
            this.voices.delete(key); };
    } }
    private kill(key: string) { const v = this.voices.get(key); if (!v)
        return; this.voices.delete(key); v.gain.disconnect(); for (const gain of v.partials)
        gain.disconnect(); for (const o of v.oscillators) {
        try {
            o.stop();
        }
        catch { /* ended */ }
        o.disconnect();
        o.onended = null;
    } }
    stop() { for (const key of this.voices.keys())
        this.kill(key); this.sustain.clear(); }
}
