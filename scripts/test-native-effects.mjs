// Requires a running Vite server, an independently built CLI and optional Playwright.
// See docs/MEDIA_WORKSPACE.md. All fixtures and outputs belong to a fresh temp folder.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const cli = process.env.CRISPAUDIO_TEST_CLI;
assert.ok(cli, 'Set CRISPAUDIO_TEST_CLI to the independently built media CLI');
const { webkit } = await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE
  ? pathToFileURL(path.resolve(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE)).href : 'playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'crispaudio-native-effects-'));
const sampleRate = 48000;
const stereo = new Float32Array(sampleRate * 2);
for (let i = 0; i < sampleRate; i++) {
  stereo[i * 2] = 0.12 * Math.sin(2 * Math.PI * 500 * i / sampleRate);
  stereo[i * 2 + 1] = 0.08 * Math.sin(2 * Math.PI * 2200 * i / sampleRate);
}
function wav(data, channels) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + data.byteLength, 4);
  header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * channels * 4, 28);
  header.writeUInt16LE(channels * 4, 32); header.writeUInt16LE(32, 34);
  header.write('data', 36); header.writeUInt32LE(data.byteLength, 40);
  return Buffer.concat([header, Buffer.from(data.buffer, data.byteOffset, data.byteLength)]);
}
function readFloatWav(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  let pcm;
  let format;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + length <= bytes.length, 'Truncated WAV chunk');
    if (id === 'fmt ') {
      let code = bytes.readUInt16LE(offset + 8);
      if (code === 65534) {
        assert.ok(length >= 40, 'Truncated extensible format');
        assert.equal(bytes.subarray(offset + 32, offset + 48).toString('hex'), '0300000000001000800000aa00389b71');
        code = 3;
      }
      format = [code, bytes.readUInt16LE(offset + 10),
        bytes.readUInt32LE(offset + 12), bytes.readUInt16LE(offset + 22)];
    }
    if (id === 'data') pcm = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length + (length % 2);
  }
  assert.deepEqual(format, [3, 2, sampleRate, 32]);
  assert.ok(pcm && pcm.length % 4 === 0, 'Missing float PCM');
  return Float32Array.from({ length: pcm.length / 4 }, (_, i) => pcm.readFloatLE(i * 4));
}
const cases = [];
for (const time of [0, 0.0001, 0.01337, 0.3, 2]) {
  for (const feedback of [0, 0.65]) cases.push({ type: 'delay', params: { time, feedback, mix: 0.4 } });
}
for (const depth of [0, 0.5, 1]) {
  for (const rate of [0, 1.5, 7.3]) cases.push({ type: 'chorus', params: { rate, depth, mix: 0.4 } });
}
for (const type of ['bitcrush', 'ringmod']) {
  for (const mix of [0, 0.35, 1]) cases.push({ type, params: { bits: 4, freq: 137.25, mix } });
}
for (const type of ['delay', 'chorus']) {
  cases.push({ type, mono: true, params: type === 'delay'
    ? { time: 0.01337, feedback: 0.65, mix: 1 }
    : { rate: 1.5, depth: 1, mix: 1 } });
}
const browser = await webkit.launch({ headless: true,
  ...(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE ? { executablePath: process.env.CRISPAUDIO_WEBKIT_EXECUTABLE } : {}) });
const results = [];
try {
  const page = await browser.newPage();
  await page.goto(process.env.CRISPAUDIO_TEST_URL || 'http://127.0.0.1:5190');
  await page.waitForLoadState('networkidle');
  for (const [index, test] of cases.entries()) {
    const channels = test.mono ? 1 : 2;
    const data = test.mono ? Float32Array.from({ length: sampleRate }, (_, i) => stereo[i * 2]) : stereo;
    const source = path.join(output, `source-${index}.wav`);
    fs.writeFileSync(source, wav(data, channels));
    const fx = { type: test.type, enabled: true, params: test.params };
    const filter = (type, freq, q) => ({ type, enabled: true, params: { freq, q } });
    const segment = (id, startTime, sourceOffset, duration, gain) => ({ id, sourceId: 's', trackId: 't',
      startTime, sourceOffset, duration, gain, fadeInDuration: 0.12, fadeOutDuration: 0.14,
      fadeInCurve: 'scurve', fadeOutCurve: 'exponential', effects: [fx, filter('lowpass', 5000, 1)] });
    const project = { id: 'p', name: 'native-reference', sampleRate,
      duration: test.params.time === 2 ? 3.2 : 1.2,
      tracks: [{ id: 't', volume: 0.8, pan: 0.35, muted: false, solo: true,
        fadeInDuration: 0.08, fadeOutDuration: 0.1, fadeInCurve: 'exponential', fadeOutCurve: 'scurve',
        automation: [{ time: 0, value: 0.2 }, { time: 0.2, value: 0.9 }, { time: 0.5, value: 0.5 }],
        effects: [filter('highpass', 250, 1), fx],
        segments: [segment('a', 0.037, 0.1, 0.3, 1), segment('b', 0.2, 0.6, 0.3, 0.7)] }],
      masterEffects: [fx, filter('lowpass', 3500, 2)] };
    const request = path.join(output, `${index}.crispaudio`);
    const target = path.join(output, `${index}.wav`);
    fs.writeFileSync(request, JSON.stringify({ format: 'crispaudio-project', version: 3, project,
      sources: [{ id: 's', path: source, duration: 1 }] }));
    const native = spawnSync(cli, ['render-project', '--input', request, '--output', target, '--backend', 'apple'],
      { encoding: 'utf8', env: { ...process.env, CRISPAUDIO_FFMPEG: '/nonexistent', CRISPAUDIO_FFPROBE: '/nonexistent' } });
    assert.equal(native.status, 0, native.stderr);
    const reference = await page.evaluate(async ({ project, data, channels }) => {
      const { TimelineEngine } = await import('/src/audio/engine/TimelineEngine.ts');
      const ctx = new AudioContext({ sampleRate: 48000 });
      try {
        const engine = new TimelineEngine(ctx);
        const buffer = ctx.createBuffer(channels, 48000, 48000);
        for (let ch = 0; ch < channels; ch++) {
          const samples = buffer.getChannelData(ch);
          for (let i = 0; i < 48000; i++) samples[i] = data[i * channels + ch];
        }
        engine.setSources(new Map([['s', { id: 's', name: 'source', buffer, duration: 1,
          sampleRate: 48000, channels, peaks: { min: new Float32Array(), max: new Float32Array() } }]]));
        const audio = await engine.renderToBuffer(project);
        const result = new Float32Array(audio.length * 2);
        for (let i = 0; i < audio.length; i++) {
          result[i * 2] = audio.getChannelData(0)[i];
          result[i * 2 + 1] = audio.getChannelData(1)[i];
        }
        return Array.from(result);
      } finally { await ctx.close(); }
    }, { project, data: Array.from(data), channels });
    fs.writeFileSync(path.join(output, `${index}-webkit.f32`), Buffer.from(new Float32Array(reference).buffer));
    const actual = readFloatWav(target);
    assert.equal(actual.length, reference.length);
    let max = 0;
    let sum = 0;
    for (let i = 0; i < actual.length; i++) {
      const error = Math.abs(actual[i] - reference[i]);
      max = Math.max(max, error); sum += error * error;
    }
    const result = { ...test, max, rms: Math.sqrt(sum / actual.length) };
    results.push(result);
    assert.ok(result.max < 0.0001 && result.rms < 0.00001, JSON.stringify(result));
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ output, results }, null, 2));
}
