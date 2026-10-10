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
const { webkit,chromium } = await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE
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
if(process.env.CRISPAUDIO_TEST_SOURCE)stereo.set(readFloatWav(process.env.CRISPAUDIO_TEST_SOURCE).subarray(0,stereo.length));
const cases = [];
for (const time of [0, 0.0001, 0.01337, 0.3, 2]) {
  for (const feedback of [0, 0.65]) cases.push({ type: 'delay', params: { time, feedback, mix: 0.4 } });
}
for (const depth of [0, 0.5, 1]) {
  for (const rate of [0, 1.5, 7.3]) cases.push({ type: 'chorus', params: { rate, depth, mix: 0.4 } });
}
for (const size of [0, 0.25, 0.5]) {
  cases.push({ type: 'reverb', params: { size, decay: 1.5, mix: 0.3 } });
}
cases.push({ type: 'reverb', rack: 'master', params: { size: 1, decay: 3, mix: 1 } });
cases.push({ type: 'reverb', mono: true, params: { size: 0.25, decay: 0.8, mix: 0.5 } });
for (const mix of [0, 1]) cases.push({ type: 'reverb', mono: true, params: { size: 0, decay: 0.01, mix } });
cases.push({ type: 'reverb', rack: 'master', impulse: true, params: { size: 1, decay: 0.01, mix: 1 } });
for (const drive of [0, 0.5, 1]) {
  for (const mix of [0, 0.4, 1]) cases.push({ type: 'distortion', params: { drive, mix } });
}
cases.push({ type: 'distortion', mono: true, params: { drive: 1, mix: 1 } });
cases.push({ type: 'distortion', rack: 'master', impulse: true, unfiltered: true, params: { drive: 0.5, mix: 1 } });
cases.push({ type: 'distortion', rack: 'master', highFrequency: true, unfiltered: true, params: { drive: 1, mix: 1 } });
for (const type of ['bitcrush', 'ringmod']) {
  for (const mix of [0, 0.35, 1]) cases.push({ type, params: { bits: 4, freq: 137.25, mix } });
}
for (const type of ['delay', 'chorus']) {
  cases.push({ type, mono: true, params: type === 'delay'
    ? { time: 0.01337, feedback: 0.65, mix: 1 }
    : { rate: 1.5, depth: 1, mix: 1 } });
}
for (const params of [
  {}, { ratio: 1 }, { threshold: -40, knee: 0, ratio: 20, attack: 0, release: 0 },
  { threshold: -30, knee: 40, ratio: 12, attack: 0.1, release: 1 },
  { threshold: 0, knee: 0, ratio: 4, attack: 0.003, release: 0.25 },
]) cases.push({ type: 'compressor', params });
cases.push({ type: 'compressor', mono: true, params: {} });
cases.push({ type: 'compressor', rack: 'master', unfiltered: true, burst: true, params: { threshold: -30, ratio: 8, knee: 10, attack: 0.01, release: 0.3 } });
cases.push({ type: 'compressor', unfiltered: true, burst: true, params: { threshold: -18, ratio: 4, knee: 5, attack: 0.1, release: 0.01 } });
cases.push({ type: 'compressor', rack: 'master', unfiltered: true, impulse: true, params: {} });
for (const type of ['peaking','lowshelf','highshelf']) {
  for (const freq of [20,1000,22000]) for (const gain of [-24,0,24]) {
    cases.push({type,unfiltered:true,impulse:true,params:{freq,gain,q:freq===20?.1:20}});
  }
  for(const rack of ['master','track'])cases.push({type,rack,mono:true,unfiltered:true,params:{freq:1000,gain:6,q:1}});
}
const browser = process.env.CRISPAUDIO_CHROME_EXECUTABLE ? await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE}) : await webkit.launch({ headless: true,
  ...(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE ? { executablePath: process.env.CRISPAUDIO_WEBKIT_EXECUTABLE } : {}) });
const results = [];
try {
  const page = await browser.newPage();
  await page.goto(process.env.CRISPAUDIO_TEST_URL || 'http://127.0.0.1:5190');
  await page.waitForLoadState('networkidle');
  for (const [index, test] of cases.entries()) {
    if (process.env.CRISPAUDIO_TEST_EFFECT && (process.env.CRISPAUDIO_TEST_EFFECT==='eq'?!['peaking','lowshelf','highshelf'].includes(test.type):test.type !== process.env.CRISPAUDIO_TEST_EFFECT)) continue;
    const channels = test.mono ? 1 : 2;
    const base = test.highFrequency
      ? Float32Array.from({ length: sampleRate * channels }, (_, i) => 0.4 * Math.sin(2 * Math.PI * (i % channels ? 19500 : 18000) * Math.floor(i / channels) / sampleRate))
      : test.mono ? Float32Array.from({ length: sampleRate }, (_, i) => stereo[i * 2]) : stereo;
    const data = test.impulse || test.burst ? base.slice() : base;
    if (test.burst) {
      for (let i = 0; i < sampleRate; i++) {
        const amplitude = i % 12000 < 6000 ? 0.8 : 0.01;
        data[i * channels] = amplitude * Math.sin(2 * Math.PI * 500 * i / sampleRate);
        if (channels === 2) data[i * channels + 1] = 0.02 * Math.sin(2 * Math.PI * 2200 * i / sampleRate);
      }
    }
    if (test.impulse) {
      data.fill(0);
      for (const i of [7200, 31200]) { data[i * channels] = 0.8; if (channels === 2) data[i * channels + 1] = -0.4; }
    }
    const source = path.join(output, `source-${index}.wav`);
    fs.writeFileSync(source, wav(data, channels));
    const fx = { type: test.type, enabled: true, params: test.params };
    const filter = (type, freq, q) => ({ type, enabled: true, params: { freq, q } });
    const segment = (id, startTime, sourceOffset, duration, gain) => ({ id, sourceId: 's', trackId: 't',
      startTime, sourceOffset, duration, gain, fadeInDuration: 0.12, fadeOutDuration: 0.14,
      fadeInCurve: 'scurve', fadeOutCurve: 'exponential', effects: [...(test.rack === 'master' ? [] : [fx]), ...(test.unfiltered ? [] : [filter('lowpass', 5000, 1)])] });
    const project = { id: 'p', name: 'native-reference', sampleRate,
      duration: test.type === 'reverb' ? (test.params.size === 1 ? 6 : 2) : test.params.time === 2 ? 3.2 : 1.2,
      tracks: [{ id: 't', volume: 0.8, pan: 0.35, muted: false, solo: true,
        fadeInDuration: 0.08, fadeOutDuration: 0.1, fadeInCurve: 'exponential', fadeOutCurve: 'scurve',
        automation: [{ time: 0, value: 0.2 }, { time: 0.2, value: 0.9 }, { time: 0.5, value: 0.5 }],
        effects: [...(test.unfiltered ? [] : [filter('highpass', 250, 1)]), ...(test.rack === 'master' ? [] : [fx])],
        segments: [segment('a', 0.037, 0.1, 0.3, 1), segment('b', 0.2, 0.6, 0.3, 0.7)] }],
      masterEffects: [fx, ...(test.unfiltered ? [] : [filter('lowpass', 3500, 2)])] };
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
    let activeMax = 0;
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < actual.length; i++) {
      const error = Math.abs(actual[i] - reference[i]);
      max = Math.max(max, error); if(i<48000)activeMax=Math.max(activeMax,error); sum += error * error;
      peak = Math.max(peak, Math.abs(reference[i]));
    }
    const result = { ...test, peak, max, activeMax, rms: Math.sqrt(sum / actual.length) };
    results.push(result);
    // Float WAV preserves headroom: extreme cascaded compressor makeup can
    // exceed unity. Keep absolute tolerances for ordinary levels and scale
    // by measured reference peak only above full scale.
    const headroom = Math.max(1, peak);
    // Native biquads retain the complete IIR tail. Browser graph silence/tail
    // handling can diverge after the last clip ends (.5 s), notably for three
    // cascaded +24 dB/Q20 bells. Keep the original bound over active clips and
    // an explicit 2e-4 peak/2e-5 RMS tail budget for the EQ-only comparison.
    const eq=['peaking','lowshelf','highshelf'].includes(test.type);
    assert.ok(activeMax < .0001*headroom && result.max < (eq?.0002:.0001)*headroom && result.rms < (eq?.00002:.00001)*headroom,JSON.stringify(result));
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ output, results }, null, 2));
}
