import {it,expect} from 'vitest';
import {encodePluginPacket,decodePluginPacket} from '../../../src/audio/plugins/PluginStreamPacket';
const metadata={frames:3,channels:2,sampleRate:48000,sequence:1,latencySamples:7};
it('round trips stereo float32 headroom with an unaligned UTF-8 header',()=>{
 const samples=[new Float32Array([1.5,-2,0]),new Float32Array([-.5,0,3])],packet=encodePluginPacket({...metadata,label:'ä'},samples);samples[0].fill(0);
 const result=decodePluginPacket(packet,2,3,48000);expect(Array.from(result.samples[0])).toEqual([1.5,-2,0]);expect(Array.from(result.samples[1])).toEqual([-.5,0,3]);expect(result.metadata.latencySamples).toBe(7);
});
it('rejects truncated, mismatched and non-finite native replies',()=>{
 const packet=encodePluginPacket(metadata,[new Float32Array(3),new Float32Array(3)]);
 expect(()=>decodePluginPacket(packet.slice(0,-1),2,3,48000)).toThrow();expect(()=>decodePluginPacket(packet,1,3,48000)).toThrow();expect(()=>decodePluginPacket(packet,2,3,44100)).toThrow();
 const nan=encodePluginPacket(metadata,[new Float32Array([NaN,0,0]),new Float32Array(3)]);expect(()=>decodePluginPacket(nan,2,3,48000)).toThrow(/PCM/);
 const oversized=new ArrayBuffer(4);new DataView(oversized).setUint32(0,0xffffffff,true);expect(()=>decodePluginPacket(oversized,2,3,48000)).toThrow();
});
