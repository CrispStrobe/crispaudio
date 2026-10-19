// Dedicated test page; the production frontend and its audio engines never load.
(() => {
  const invoke = (...args) => window.__TAURI_INTERNALS__.invoke(...args);
  const check = (value, message) => { if (!value) throw Error(message); };
  const rejects = async (fn, message) => { let rejected = false; try { await fn(); } catch { rejected = true; } check(rejected, message); };
  const metadata = {project: {sampleRate: 48000, duration: 1, qa: 'PCM · 日本語', masterVolume: 1, outputLimiter: {enabled: false}, tracks: [{id: 'qa-track', volume: 1, pan: 0, segments: [{id: 'qa-clip', sourceId: 'source', startTime: 0, sourceOffset: 0, duration: 2048 / 48000, gain: 1, effects: []}]}]}, descriptors: [{id: 'source', frames: 2048, channels: 2, sampleRate: 48000}]};
  function packet(snapshot, nan = false) {
    const header = new TextEncoder().encode(JSON.stringify({snapshot, source: 0, offset: 0, frames: 2048}));
    const bytes = new Uint8Array(8 + header.length + 2048 * 8);
    bytes.set(new TextEncoder().encode('CPS1')); const view = new DataView(bytes.buffer);
    view.setUint32(4, header.length, true); bytes.set(header, 8);
    for (let i = 0; i < 2048; i++) { view.setFloat32(8 + header.length + i * 4, i === 0 && nan ? NaN : .125, true); view.setFloat32(8 + header.length + (2048 + i) * 4, -.25, true); }
    return bytes;
  }
  async function until(fn, message) {
    const deadline = performance.now() + 15000;
    while (performance.now() < deadline) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
    throw Error(message);
  }
  window.qaPeer = async snapshot => {
    try {
      await rejects(() => invoke('native_snapshot_seal', {snapshot}), 'Cross-window seal accepted');
      await rejects(() => invoke('native_snapshot_write', packet(snapshot)), 'Cross-window write accepted');
      await rejects(() => invoke('native_snapshot_close', {snapshot}), 'Cross-window close accepted');
      const own = await invoke('native_snapshot_begin', metadata);
      await invoke('qa_peer_ready', {own});
    } catch (error) { await invoke('qa_finish', {success: false, error: String(error)}); }
  };
  if (window.QA_ROLE !== 'main') { void invoke('qa_peer_loaded'); return; }
  (async () => {
    await rejects(() => invoke('native_playback_start', {}), 'Playback command exposed');
    await rejects(() => invoke('native_recording_start', {}), 'Recording command exposed');
    const snapshot = await invoke('native_snapshot_begin', metadata);
    await rejects(() => invoke('native_snapshot_seal', {snapshot}), 'Incomplete upload sealed');
    await rejects(() => invoke('native_snapshot_write', {bytes: [1, 2, 3]}), 'JSON accepted as binary PCM');
    await rejects(() => invoke('native_snapshot_write', packet(snapshot, true)), 'Nonfinite PCM accepted');
    await invoke('native_snapshot_write', packet(snapshot));
    await invoke('native_snapshot_seal', {snapshot});
    const state = await invoke('qa_inspect', {snapshot});
    check(state.ready && state.pcmExact && state.entries === 1 && state.bytes === 32768, 'Sealed snapshot/byte budget mismatch');
    await until(async () => (await invoke('qa_state')).peerLoaded, 'Peer WebKit page did not load');
    await invoke('qa_ask_peer', {snapshot});
    await until(async () => (await invoke('qa_state')).peerReady, 'Peer did not finish its real IPC requests');
    check((await invoke('qa_state')).entries === 2, 'Peer upload was not retained');
    await invoke('qa_destroy_peer');
    await until(async () => (await invoke('qa_state')).destroyed, 'No actual Destroyed event');
    const retired = await invoke('qa_retired');
    check(retired.revoked && retired.entries === 1 && retired.bytes === 32768, 'Destroyed owner was not retired/released');
    await invoke('native_snapshot_close', {snapshot});
    const empty = await invoke('native_snapshot_status');
    check(empty.entries === 0 && empty.bytes === 0, 'Close retained snapshot memory');
    // Leave one sealed main-owner upload for the actual Exit callback to retire.
    const final = await invoke('native_snapshot_begin', metadata);
    await invoke('native_snapshot_write', packet(final)); await invoke('native_snapshot_seal', {snapshot: final});
    await invoke('qa_finish', {success: true, error: null});
  })().catch(error => invoke('qa_finish', {success: false, error: String(error)}));
})();
