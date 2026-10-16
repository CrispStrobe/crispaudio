import { metronomeBeats, type MusicalSettings } from '../../lib/musicalTime';
/** Monitor-only clicks share the transport audio clock, never the export graph. */
export class TimelineMetronome {
    private nodes = new Map<OscillatorNode, GainNode>();
    private timer?: ReturnType<typeof setInterval>;
    private until = -Infinity;
    private ctx: AudioContext;
    private destination: AudioNode;
    private music: MusicalSettings;
    private anchor: {
        frame: number;
        timeline: number;
    };
    private end: number;
    private loop?: { start: number; end: number };
    constructor(ctx: AudioContext, destination: AudioNode, music: MusicalSettings, anchor: {
        frame: number;
        timeline: number;
    }, end: number, loop?: { start: number; end: number }) {
        if (loop && (!Number.isFinite(loop.start) || !Number.isFinite(loop.end) || loop.start < 0 || loop.end <= loop.start || anchor.timeline < loop.start || anchor.timeline >= loop.end))
            throw new Error('Invalid metronome loop');
        this.loop = loop; this.ctx = ctx; this.destination = destination; this.music = music; this.anchor = anchor; this.end = end; }
    start() { if (this.timer !== undefined) return; this.pump(); this.timer = setInterval(() => this.pump(), 25); }
    pump() {
        const ctx = this.ctx, origin = this.anchor.frame / ctx.sampleRate, now = ctx.currentTime;
        const from = Math.max(this.until, origin, this.until === -Infinity && now - origin < .04 ? origin : now);
        const to = Math.min(now + .15, this.loop ? Infinity : origin + this.end - this.anchor.timeline);
        if (to <= from) return;
        // Split the audio-clock window at source-loop boundaries. Half-open windows
        // give each onset one owner, even when a beat falls exactly on a boundary.
        // Bound node creation for pathological loops shorter than a click.
        let cursor = from, events = 0;
        for (let windows = 0; cursor < to && windows < 256 && events < 128; windows++) {
            const elapsed = this.anchor.timeline + cursor - origin, loop = this.loop;
            const length = loop ? loop.end - loop.start : 0;
            const cycle = loop ? Math.max(0, Math.floor((elapsed - loop.start) / length + 1e-9)) : 0;
            const timeline = elapsed - cycle * length;
            const boundary = origin + (loop ? loop.end + cycle * length : this.end) - this.anchor.timeline;
            const limit = Math.min(to, boundary);
            if (limit <= cursor) break;
            for (const beat of metronomeBeats(timeline, timeline + limit - cursor, this.music)) {
                const scheduled = cursor + beat.time - timeline;
                if (scheduled < cursor - 1e-9 || scheduled >= limit - 1e-9) continue;
                if (events++ >= 128) break;
                const time = Math.max(now, scheduled);
                this.schedule(time, beat.accent, Math.min(.04, boundary - time));
            }
            cursor = limit;
        }
        this.until = to;
    }
    private schedule(time: number, accent: boolean, duration: number) {
        const oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
        oscillator.frequency.value = accent ? 1200 : 800;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(.08 * this.music.clickLevel, time + .002);
        gain.gain.exponentialRampToValueAtTime(.00001, time + .035);
        oscillator.connect(gain).connect(this.destination);
        this.nodes.set(oscillator, gain);
        oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(time);
        oscillator.stop(time + Math.max(0, duration));
    }
    stop() { if (this.timer)
        clearInterval(this.timer); this.timer = undefined; for (const [node, gain] of this.nodes) {
        try {
            node.stop();
        }
        catch { /* already ended */ }
        node.disconnect();
        gain.disconnect();
        node.onended = null;
    } this.nodes.clear(); }
}
