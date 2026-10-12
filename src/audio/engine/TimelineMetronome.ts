import { metronomeBeats, type MusicalSettings } from '../../lib/musicalTime';
/** Monitor-only clicks share the transport audio clock, never the export graph. */
export class TimelineMetronome {
    private nodes = new Map<OscillatorNode, GainNode>();
    private timer?: ReturnType<typeof setInterval>;
    private until = -Infinity;
    private lastBeat = -Infinity;
    private ctx: AudioContext;
    private destination: AudioNode;
    private music: MusicalSettings;
    private anchor: {
        frame: number;
        timeline: number;
    };
    private end: number;
    constructor(ctx: AudioContext, destination: AudioNode, music: MusicalSettings, anchor: {
        frame: number;
        timeline: number;
    }, end: number) { this.ctx = ctx; this.destination = destination; this.music = music; this.anchor = anchor; this.end = end; }
    start() { this.pump(); this.timer = setInterval(() => this.pump(), 25); }
    pump() {
        const ctx = this.ctx, origin = this.anchor.frame / ctx.sampleRate, now = ctx.currentTime, from = Math.max(this.until, origin, this.until === -Infinity && now - origin < .04 ? origin : now), to = Math.min(now + .15, origin + this.end - this.anchor.timeline);
        if (to < from)
            return;
        for (const beat of metronomeBeats(this.anchor.timeline + from - origin, this.anchor.timeline + to - origin, this.music)) {
            const scheduled = origin + beat.time - this.anchor.timeline, time = Math.max(now, scheduled);
            if (beat.index <= this.lastBeat || beat.time >= this.end - 1e-9)
                continue;
            const oscillator = ctx.createOscillator(), gain = ctx.createGain();
            oscillator.frequency.value = beat.accent ? 1200 : 800;
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(.08 * this.music.clickLevel, time + .002);
            gain.gain.exponentialRampToValueAtTime(.00001, time + .035);
            oscillator.connect(gain).connect(this.destination);
            this.nodes.set(oscillator, gain);
            oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
            oscillator.start(time);
            oscillator.stop(time + .04);
            this.lastBeat = beat.index;
        }
        this.until = to;
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
