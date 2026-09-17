// Run in a visible Vite tab with benchmarkTimeline(await import('/src/audio/engine/TimelineEngine.ts')).
export async function benchmarkTimeline({ TimelineEngine }, { runs = 3, reverbCases = [false, true] } = {}) {
  const ctx = new AudioContext({ sampleRate: 48000 });
  const source = ctx.createBuffer(1, 48000 * 5, 48000);
  const samples = source.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = 0.1 * Math.sin(2 * Math.PI * 440 * i / 48000);
  const engine = new TimelineEngine(ctx);
  engine.setSources(new Map([['tone', { id: 'tone', name: 'tone', buffer: source,
    peaks: { min: new Float32Array(), max: new Float32Array() }, duration: 5, sampleRate: 48000, channels: 1 }]]));
  const results = [];
  try {
    for (const reverb of reverbCases) {
      const project = { id: 'bench', name: 'bench', duration: 60, sampleRate: 48000, masterEffects: [],
        tracks: Array.from({ length: 4 }, (_, t) => ({ id: `${t}`, name: `${t}`, muted: false, solo: false, volume: 0.25, pan: 0,
          segments: Array.from({ length: 12 }, (_, s) => ({ id: `${t}-${s}`, trackId: `${t}`, sourceId: 'tone',
            name: 'tone', color: '', startTime: s * 5, duration: 5, sourceOffset: 0, gain: 1,
            fadeInDuration: 0, fadeOutDuration: 0, fadeInCurve: 'linear', fadeOutCurve: 'linear',
            effects: reverb ? [{ type: 'reverb', enabled: true, params: { size: 0.5, decay: 1.5, mix: 0.3 } }] : [] })) })) };
      for (let run = 0; run < runs; run++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const gaps = [];
        let last = performance.now();
        const timer = setInterval(() => { const now = performance.now(); gaps.push(now - last); last = now; }, 16);
        try {
          const start = performance.now();
          const pending = engine.renderToBuffer(project);
          const setupMs = performance.now() - start;
          const buffer = await pending;
          const elapsedMs = performance.now() - start;
          await new Promise(resolve => setTimeout(resolve, 50));
          results.push({ reverb, run, setupMs, elapsedMs, maxHeartbeatGapMs: Math.max(...gaps), frames: buffer.length,
            finite: buffer.getChannelData(0).every(Number.isFinite) });
        } finally { clearInterval(timer); }
      }
    }
  } finally { engine.stop(); await ctx.close(); }
  return { userAgent: navigator.userAgent, results };
}
