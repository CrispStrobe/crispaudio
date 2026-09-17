// Run in a visible browser tab: await benchmarkCodecs(await import('/src/lib/codecs.ts'))
// Input generation and SHA hashing are deliberately outside the timed interval.
export async function benchmarkCodecs(codecs, { seconds = 60, format = 'mp3', runs = 3 } = {}) {
  const sampleRate = 48000;
  const pcm = new Float32Array(sampleRate * seconds * 2);
  for (let i = 0; i < pcm.length / 2; i++) {
    pcm[2 * i] = Math.sin(2 * Math.PI * 220 * i / sampleRate) * 0.5;
    pcm[2 * i + 1] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5;
  }
  const results = [];
  for (let run = 0; run < runs; run++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const tasks = [];
    const supportsLongTasks = typeof PerformanceObserver !== 'undefined'
      && PerformanceObserver.supportedEntryTypes.includes('longtask');
    const observer = supportsLongTasks ? new PerformanceObserver(list => tasks.push(...list.getEntries())) : null;
    observer?.observe({ type: 'longtask' });
    const gaps = [];
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      gaps.push(now - last);
      last = now;
    }, 16);
    const started = performance.now();
    let blob;
    let ended;
    try {
      blob = await codecs.encodeCompressed(pcm, 2, sampleRate, format, 192);
      ended = performance.now();
      // Deliver the observer entry and delayed heartbeat from the encoding task.
      await new Promise(resolve => setTimeout(resolve, 100));
      if (observer) tasks.push(...observer.takeRecords());
    } finally {
      clearInterval(timer);
      observer?.disconnect();
    }
    const relevant = tasks.filter(task => task.startTime < ended && task.startTime + task.duration > started);
    const bytes = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    results.push({
      run, format, seconds, sampleRate, channels: 2,
      elapsedMs: Math.round(ended - started),
      maxHeartbeatGapMs: Math.round(Math.max(0, ...gaps)),
      longTasks: supportsLongTasks ? relevant.length : null,
      blockedOver50ms: supportsLongTasks ? Math.round(relevant.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0)) : null,
      maxTaskMs: supportsLongTasks ? Math.round(Math.max(0, ...relevant.map(task => task.duration))) : null,
      blobSize: blob.size,
      inputBytesAfter: pcm.byteLength,
      sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
    });
  }
  return { userAgent: navigator.userAgent, visibility: document.visibilityState, results };
}
