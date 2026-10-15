// Offline capability evidence for the exact vendored binary, not patent clearance.
// Run: node scripts/audit-aac-wasm.mjs
// No audio device, network, codec rebuild, or generated media files are needed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import createGlint from '../src/lib/glint/glint.mjs';

const wasm = readFileSync(new URL('../src/lib/glint/glint.wasm', import.meta.url));
const compiled = new WebAssembly.Module(wasm);
const codec = await createGlint({
  instantiateWasm(imports, receive) {
    const instance = new WebAssembly.Instance(compiled, imports);
    receive(instance, compiled);
    return instance.exports;
  },
});

function encodeEvidence() {
  const samples = 48000;
  const pcm = new Float32Array(samples);
  for (let i = 0; i < samples; i++) pcm[i] = 0.2 * Math.sin(2 * Math.PI * 440 * i / 48000);
  const input = codec._malloc(pcm.byteLength);
  const length = codec._malloc(4);
  let output = 0;
  try {
    codec.HEAPF32.set(pcm, input / 4);
    codec.setValue(length, 0, 'i32');
    output = codec._glint_encode_audio(input, samples, 1, 48000, 1, 128, -1, 1, length);
    const size = codec.getValue(length, 'i32');
    assert(output && size >= 7, 'AAC encode failed');
    const bytes = codec.HEAPU8.slice(output, output + size);
    const profiles = new Set();
    const mpegIDs = new Set();
    let frames = 0;
    for (let offset = 0; offset < bytes.length;) {
      assert(offset + 7 <= bytes.length, 'Truncated ADTS header');
      assert(bytes[offset] === 255 && (bytes[offset + 1] & 0xf6) === 0xf0, 'Invalid ADTS sync/layer');
      profiles.add(((bytes[offset + 2] >> 6) & 3) + 1);
      mpegIDs.add((bytes[offset + 1] >> 3) & 1);
      const frameLength = ((bytes[offset + 3] & 3) << 11)
        | (bytes[offset + 4] << 3) | (bytes[offset + 5] >> 5);
      assert(frameLength >= 7 && offset + frameLength <= bytes.length, 'Invalid ADTS length');
      offset += frameLength;
      frames++;
    }
    assert.deepEqual([...profiles], [2], 'Expected AAC-LC ADTS profile');
    assert.deepEqual([...mpegIDs], [0], 'Expected MPEG-4 ADTS ID');
    return { bytes: size, adtsFrames: frames, audioObjectTypes: [...profiles], mpegIDs: [...mpegIDs] };
  } finally {
    if (output) codec._glint_free(output);
    codec._free(input);
    codec._free(length);
  }
}

function pnsPayload() {
  // One mono single-channel element, long sine window, max_sfb=1.
  // The sole section uses NOISE_HCB (13): no spectral Huffman data is present.
  // first noise value=346; pulse, TNS and gain-control flags=0; then ID_END.
  // Thus nonzero decoded PCM exercises PNS, independently of our encoder.
  const fields = [
    [0, 3], [0, 4], [100, 8], [0, 1], [0, 2], [0, 1], [1, 6], [0, 1],
    [13, 4], [1, 5], [346, 9], [0, 1], [0, 1], [0, 1], [7, 3],
  ];
  const bits = [];
  for (const [value, width] of fields) {
    for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1);
  }
  while (bits.length % 8) bits.push(0);
  return Uint8Array.from({ length: bits.length / 8 }, (_, i) =>
    bits.slice(i * 8, i * 8 + 8).reduce((value, bit) => (value << 1) | bit, 0));
}

function fixture(profileBits, mpegID) {
  const payload = pnsPayload();
  const size = payload.length + 7;
  const frame = [255, 241 | (mpegID << 3), (profileBits << 6) | (3 << 2),
    64 | (size >> 11), (size >> 3) & 255, ((size & 7) << 5) | 31, 252, ...payload];
  return Uint8Array.from(Array.from({ length: 4 }, () => frame).flat());
}

function decodeEvidence(bytes) {
  const input = codec._malloc(bytes.length);
  const metadata = codec._malloc(12);
  let output = 0;
  try {
    codec.HEAPU8.set(bytes, input);
    for (let offset = 0; offset < 12; offset += 4) codec.setValue(metadata + offset, 0, 'i32');
    output = codec._glint_decode_audio(input, bytes.length, metadata, metadata + 4, metadata + 8);
    const rate = codec.getValue(metadata, 'i32');
    const channels = codec.getValue(metadata + 4, 'i32');
    const frames = codec.getValue(metadata + 8, 'i32');
    if (!output) return { accepted: false };
    assert(rate === 48000 && channels === 1 && frames === 4096, 'Unexpected PNS decode dimensions');
    const pcm = codec.HEAPF32.slice(output / 4, output / 4 + frames * channels);
    assert(pcm.every(Number.isFinite), 'Non-finite decoded audio');
    const nonzeroSamples = pcm.filter((value) => value !== 0).length;
    const peak = pcm.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0);
    assert(nonzeroSamples > 0 && peak > 0, 'PNS produced no signal');
    return { accepted: true, rate, channels, frames, nonzeroSamples, peak };
  } finally {
    if (output) codec._glint_free(output);
    codec._free(input);
    codec._free(metadata);
  }
}

const report = {
  wasmSha256: createHash('sha256').update(wasm).digest('hex'),
  encoder: encodeEvidence(),
  pnsDecoder: [0, 1].map((mpegID) => ({ mpegID, ...decodeEvidence(fixture(1, mpegID)) })),
  otherADTSProfiles: [0, 2, 3].map((profileBits) => ({
    profileBits, ...decodeEvidence(fixture(profileBits, 0)),
  })),
};
assert(report.pnsDecoder.every((result) => result.accepted));
assert(report.otherADTSProfiles.every((result) => !result.accepted));
console.log(JSON.stringify(report, null, 2));
