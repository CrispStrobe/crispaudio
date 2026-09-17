import { encodeCompressed, decodeCompressed } from './codecRuntime';
import { encodeWavJS } from './wavRuntime';
import { encodeAudioBufferToWav, type BitDepth } from '../audio/utils/audioBufferUtils';
import type { CodecRequest, CodecResponse } from './codecProtocol';

// Use the worker's small message interface without mixing DOM/WebWorker libs.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<CodecRequest>) => void) | null;
  postMessage: (message: CodecResponse, transfer: Transferable[]) => void;
};
scope.onmessage = async ({ data }) => {
  try {
    if (data.type === 'wav') {
      if (![8, 16, 24, 32].includes(data.bitDepth)) throw new Error(`Unsupported bit depth: ${data.bitDepth}`);
      const channels = data.channelData.map(bytes => new Float32Array(bytes));
      const bytes = data.mode === 'mono-float'
        ? await encodeWavJS(channels[0], data.sampleRate, data.bitDepth).arrayBuffer()
        : encodeAudioBufferToWav({ numberOfChannels: channels.length, length: channels[0].length,
          sampleRate: data.sampleRate, getChannelData: (c: number) => channels[c] } as AudioBuffer, data.bitDepth as BitDepth);
      scope.postMessage({ id: data.id, type: 'encoded', bytes }, [bytes]);
    } else if (data.type === 'encode') {
      const bytes = await encodeCompressed(new Float32Array(data.pcm), data.channels, data.sampleRate, data.format, data.bitrateKbps);
      scope.postMessage({ id: data.id, type: 'encoded', bytes }, [bytes]);
    } else {
      const decoded = await decodeCompressed(new Uint8Array(data.bytes));
      const channelData = decoded.channelData.map(channel => channel.buffer as ArrayBuffer);
      scope.postMessage({ id: data.id, type: 'decoded', channelData, sampleRate: decoded.sampleRate }, channelData);
    }
  } catch (error) {
    scope.postMessage({ id: data.id, type: 'error', message: error instanceof Error ? error.message : String(error) }, []);
  }
};
