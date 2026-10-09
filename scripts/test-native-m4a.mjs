// Optional native M4A/WebKit import timing check; see MEDIA_WORKSPACE.md.
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
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'crispaudio-native-m4a-'));
const frames = 24001;
const samples = new Float32Array(frames * 2);
for (let i = 0; i < frames; i++) {
  const t = i / 48000;
  const amplitude = (t >= 0.07 && t < 0.14) || (t >= 0.2 && t < 0.38) ? 0.2 : 0;
  samples[i * 2] = amplitude * Math.sin(2 * Math.PI * 500 * t);
  samples[i * 2 + 1] = amplitude * Math.sin(2 * Math.PI * 2200 * t);
}
const header = Buffer.alloc(44);
header.write('RIFF'); header.writeUInt32LE(36 + samples.byteLength, 4);
header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
header.writeUInt16LE(3, 20); header.writeUInt16LE(2, 22);
header.writeUInt32LE(48000, 24); header.writeUInt32LE(384000, 28);
header.writeUInt16LE(8, 32); header.writeUInt16LE(32, 34);
header.write('data', 36); header.writeUInt32LE(samples.byteLength, 40);
const source = path.join(output, 'source.wav');
fs.writeFileSync(source, Buffer.concat([header, Buffer.from(samples.buffer)]));
const document = { format: 'crispaudio-project', version: 3,
  project: { sampleRate: 48000, duration: frames / 48000, tracks: [{ volume: 1, pan: 0,
    segments: [{ sourceId: 's', startTime: 0, sourceOffset: 0, duration: frames / 48000, gain: 1 }] }] },
  sources: [{ id: 's', path: source }] };
const request = path.join(output, 'project.crispaudio');
fs.writeFileSync(request, JSON.stringify(document));
const browser = await webkit.launch({ headless: true,
  ...(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE ? { executablePath: process.env.CRISPAUDIO_WEBKIT_EXECUTABLE } : {}) });
const results = [];
try {
  const page = await browser.newPage();
  for (const bitrate of [96, 128, 192, 256, 320]) {
    const target = path.join(output, `native-${bitrate}.m4a`);
    const native = spawnSync(cli, ['render-project', '--input', request, '--output', target,
      '--audio-bitrate-kbps', String(bitrate), '--backend', 'apple'], { encoding: 'utf8',
      env: { ...process.env, CRISPAUDIO_FFMPEG: '/nonexistent', CRISPAUDIO_FFPROBE: '/nonexistent' } });
    assert.equal(native.status, 0, native.stderr);
    const decoded = await page.evaluate(async ({ bytes, reference }) => {
      const context = new OfflineAudioContext(2, 1, 48000);
      const buffer = await context.decodeAudioData(new Uint8Array(bytes).buffer);
      let sum = 0;
      for (let i = 0; i < Math.min(buffer.length, reference.length / 2); i++) {
        for (let ch = 0; ch < 2; ch++) {
          const difference = buffer.getChannelData(ch)[i] - reference[i * 2 + ch];
          sum += difference * difference;
        }
      }
      return { frames: buffer.length, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels,
        unshiftedRmsError: Math.sqrt(sum / reference.length) };
    }, { bytes: Array.from(fs.readFileSync(target)), reference: Array.from(samples) });
    assert.equal(decoded.frames, frames, 'WebKit must preserve the gapless valid frame count');
    assert.equal(decoded.sampleRate, 48000); assert.equal(decoded.channels, 2);
    assert.ok(decoded.unshiftedRmsError < 0.02, 'Stereo bursts must align without manual priming offset');
    results.push({ bitrate, ...decoded });
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ output, results }, null, 2));
}
