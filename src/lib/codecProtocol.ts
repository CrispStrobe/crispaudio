// Data-only worker protocol: safe to import on either side of the boundary.
export type CompressedFormat = 'mp3' | 'aac' | 'opus';

export type CodecJob =
  | { type: 'encode'; pcm: ArrayBuffer; channels: number; sampleRate: number; format: CompressedFormat; bitrateKbps: number }
  | { type: 'decode'; bytes: ArrayBuffer };
export type CodecRequest = CodecJob & { id: number };
export type CodecResult =
  | { type: 'encoded'; bytes: ArrayBuffer }
  | { type: 'decoded'; channelData: ArrayBuffer[]; sampleRate: number };
export type CodecResponse = (CodecResult | { type: 'error'; message: string }) & { id: number };
