// Optional real-WebKit/native FLAC sample/checksum parity check; see MEDIA_WORKSPACE.md.
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
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'crispaudio-native-flac-'));
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
function decode(file) {
  const result = spawnSync(process.env.CRISPAUDIO_REFERENCE_FFMPEG || 'ffmpeg',
    ['-v', 'error', '-i', file, '-f', 's24le', 'pipe:1'], { maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, String(result.stderr));
  return result.stdout;
}
function info(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 4), 'fLaC');
  assert.equal(bytes[4] & 127, 0);
  assert.equal(bytes.readUIntBE(5, 3), 34);
  const packed = bytes.readBigUInt64BE(18);
  assert.equal(Number(packed >> 44n), 48000);
  assert.equal(Number(packed >> 41n & 7n) + 1, 2);
  assert.equal(Number(packed >> 36n & 31n) + 1, 24);
  assert.equal(Number(packed & ((1n << 36n) - 1n)), frames);
  return bytes.subarray(26, 42).toString('hex');
}
const browser = await webkit.launch({ headless: true,
  ...(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE ? { executablePath: process.env.CRISPAUDIO_WEBKIT_EXECUTABLE } : {}) });
const results = [];
try {
  const page = await browser.newPage();
  await page.goto(process.env.CRISPAUDIO_TEST_URL || 'http://127.0.0.1:5190');
  await page.waitForLoadState('networkidle');
  for (const depth of [24]) {
    const target = path.join(output, `native-${depth}.flac`);
    const native = spawnSync(cli, ['render-project', '--input', request, '--output', target,
      '--backend', 'apple'], { encoding: 'utf8',
      env: { ...process.env, CRISPAUDIO_FFMPEG: '/nonexistent', CRISPAUDIO_FFPROBE: '/nonexistent' } });
    assert.equal(native.status, 0, native.stderr);
    const reference = await page.evaluate(async ({ project, samples }) => {
      const { TimelineEngine } = await import('/src/audio/engine/TimelineEngine.ts');
      const { encodeAudioBuffer } = await import('/src/lib/codecs.ts');
      const ctx = new AudioContext({ sampleRate: 48000 });
      try {
        const engine = new TimelineEngine(ctx);
        const buffer = ctx.createBuffer(2, 4800, 48000);
        for (let ch = 0; ch < 2; ch++) for (let i = 0; i < 4800; i++) buffer.getChannelData(ch)[i] = samples[i * 2 + ch];
        engine.setSources(new Map([['s', { id: 's', name: 'source', buffer, duration: 0.1,
          channels: 2, sampleRate: 48000, peaks: { min: new Float32Array(), max: new Float32Array() } }]]));
        const encoded = await encodeAudioBuffer(await engine.renderToBuffer(project), 'flac');
        return Array.from(new Uint8Array(await encoded.arrayBuffer()));
      } finally { await ctx.close(); }
    }, { project, samples: Array.from(data) });
    const referenceFile = path.join(output, 'webkit.flac');
    fs.writeFileSync(referenceFile, Buffer.from(reference));
    const actualPcm = decode(target);
    assert.equal(actualPcm.length, frames * 2 * 3);
    assert.ok(actualPcm.equals(decode(referenceFile)), 'Decoded PCM mismatch');
    const { createHash } = await import('node:crypto');
    const md5 = createHash('md5').update(actualPcm).digest('hex');
    assert.equal(info(target), md5);
    assert.equal(info(referenceFile), md5);
    results.push({ depth, frames, pcmBytes: actualPcm.length, exact: true, md5 });
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ output, results }, null, 2));
}
