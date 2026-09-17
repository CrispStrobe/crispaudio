import { afterEach, expect, it, vi } from 'vitest';
import { encodeWavJS } from '../../../src/lib/wavRuntime';
import { encodeAudioBufferToWav, type BitDepth } from '../../../src/audio/utils/audioBufferUtils';
import type { CodecRequest } from '../../../src/lib/codecProtocol';
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it.each([8, 16, 24, 32] as BitDepth[])('preserves mono and multichannel WAV bytes at %i bits', async bitDepth => {
  const postMessage = vi.fn();
  const scope = { onmessage: null as unknown as (e: { data: CodecRequest }) => Promise<void>, postMessage };
  vi.stubGlobal('self', scope);
  await import('../../../src/lib/codec.worker');
  const samples = new Float32Array([-1, -0.5, 0, 0.5, 1]);
  await scope.onmessage({ data: { id: 1, type: 'wav', mode: 'mono-float', channelData: [samples.buffer], sampleRate: 48000, bitDepth } });
  expect(new Uint8Array(postMessage.mock.calls[0][0].bytes)).toEqual(new Uint8Array(await encodeWavJS(samples, 48000, bitDepth).arrayBuffer()));
  const audio = { numberOfChannels: 2, length: samples.length, sampleRate: 48000, getChannelData: () => samples } as unknown as AudioBuffer;
  await scope.onmessage({ data: { id: 2, type: 'wav', mode: 'multichannel-pcm', channelData: [samples.buffer, samples.buffer], sampleRate: 48000, bitDepth } });
  expect(new Uint8Array(postMessage.mock.calls[1][0].bytes)).toEqual(new Uint8Array(encodeAudioBufferToWav(audio, bitDepth)));
});
