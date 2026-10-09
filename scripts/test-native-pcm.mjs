// Optional real-WebKit/native integer PCM parity check; see MEDIA_WORKSPACE.md.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const cli = process.env.CRISPAUDIO_TEST_CLI;
assert.ok(cli, 'Set CRISPAUDIO_TEST_CLI to an independently built media CLI');
const { webkit } = await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE
  ? pathToFileURL(path.resolve(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE)).href : 'playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'crispaudio-native-pcm-'));
const frames = 4800;
const data = new Float32Array(frames * 2);
let seed = 12345;
for (let i = 0; i < data.length; i++) {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  data[i] = (seed / 2147483648) * 1.5;
}
data.set([0, 0, -0.5, 0.5, -1, 1, -2, 2, -1 / 65534, 1 / 65534]);
const header = Buffer.alloc(44);
header.write('RIFF'); header.writeUInt32LE(36 + data.byteLength, 4);
header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
header.writeUInt16LE(3, 20); header.writeUInt16LE(2, 22);
header.writeUInt32LE(48000, 24); header.writeUInt32LE(384000, 28);
header.writeUInt16LE(8, 32); header.writeUInt16LE(32, 34);
header.write('data', 36); header.writeUInt32LE(data.byteLength, 40);
const source = path.join(output, 'source.wav');
fs.writeFileSync(source, Buffer.concat([header, Buffer.from(data.buffer)]));
const project = { id: 'p', name: 'pcm-reference', sampleRate: 48000, duration: 0.1, masterEffects: [],
  tracks: [{ id: 't', volume: 1, pan: 0, muted: false, solo: false, effects: [],
    segments: [{ id: 'c', sourceId: 's', trackId: 't', startTime: 0, sourceOffset: 0,
      duration: 0.1, gain: 1, effects: [], fadeInDuration: 0, fadeOutDuration: 0 }] }] };
const request = path.join(output, 'project.crispaudio');
fs.writeFileSync(request, JSON.stringify({ format: 'crispaudio-project', version: 3, project,
  sources: [{ id: 's', path: source, duration: 0.1 }] }));
function pcm(bytes) {
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const length = bytes.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + length <= bytes.length, 'Truncated WAV chunk');
    if (bytes.toString('ascii', offset, offset + 4) === 'data') return bytes.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length + length % 2;
  }
  throw new Error('Missing PCM chunk');
}
const browser = await webkit.launch({ headless: true,
  ...(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE ? { executablePath: process.env.CRISPAUDIO_WEBKIT_EXECUTABLE } : {}) });
const results = [];
try {
  const page = await browser.newPage();
  await page.goto(process.env.CRISPAUDIO_TEST_URL || 'http://127.0.0.1:5190');
  await page.waitForLoadState('networkidle');
  for (const depth of [8, 16, 24, 32]) {
    const target = path.join(output, `native-${depth}.wav`);
    const native = spawnSync(cli, ['render-project', '--input', request, '--output', target,
      '--wav-bit-depth', String(depth), '--backend', 'apple'], { encoding: 'utf8',
      env: { ...process.env, CRISPAUDIO_FFMPEG: '/nonexistent', CRISPAUDIO_FFPROBE: '/nonexistent' } });
    assert.equal(native.status, 0, native.stderr);
    const reference = await page.evaluate(async ({ project, samples, depth }) => {
      const { TimelineEngine } = await import('/src/audio/engine/TimelineEngine.ts');
      const { encodeAudioBufferToWav } = await import('/src/audio/utils/audioBufferUtils.ts');
      const ctx = new AudioContext({ sampleRate: 48000 });
      try {
        const engine = new TimelineEngine(ctx);
        const buffer = ctx.createBuffer(2, 4800, 48000);
        for (let ch = 0; ch < 2; ch++) for (let i = 0; i < 4800; i++) buffer.getChannelData(ch)[i] = samples[i * 2 + ch];
        engine.setSources(new Map([['s', { id: 's', name: 'source', buffer, duration: 0.1,
          channels: 2, sampleRate: 48000, peaks: { min: new Float32Array(), max: new Float32Array() } }]]));
        return Array.from(new Uint8Array(encodeAudioBufferToWav(await engine.renderToBuffer(project), depth)));
      } finally { await ctx.close(); }
    }, { project, samples: Array.from(data), depth });
    const referenceBytes = Buffer.from(reference);
    fs.writeFileSync(path.join(output, `webkit-${depth}.wav`), referenceBytes);
    const actualPcm = pcm(fs.readFileSync(target));
    assert.equal(actualPcm.length, frames * 2 * depth / 8);
    assert.ok(actualPcm.equals(pcm(referenceBytes)), `PCM mismatch at ${depth} bits`);
    results.push({ depth, frames, bytes: actualPcm.length, exact: true });
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ output, results }, null, 2));
}
