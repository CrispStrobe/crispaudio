import {afterEach, describe, expect, it, vi} from 'vitest';
import {clipWaveformKey, clipWaveformState, prepareClipWaveform} from '../../src/lib/clipWaveform';
import {TimelineEngine} from '../../src/audio/engine/TimelineEngine';
import type {AudioSource, AudioSegment} from '../../src/types/audio';
const clip = (): AudioSegment => ({id:'c', trackId:'t', sourceId:'s', startTime:3, sourceOffset:1,
  duration:2, gain:1, fadeInDuration:0, fadeOutDuration:0, fadeInCurve:'linear', fadeOutCurve:'linear',
  name:'clip', color:'#000000', effects:[{type:'lowpass',enabled:true,params:{freq:1000}}]});
const source = (): AudioSource => ({id:'s',name:'source',duration:4,sampleRate:48000,channels:1,
  buffer:{} as AudioBuffer,peaks:{min:new Float32Array(1),max:new Float32Array(1)}});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('effect-aware waveform scheduling',()=>{
 it('invalidates audible edits and replaced source buffers, independently of names/selection',()=>{
  const s=source(),c=clip(),key=clipWaveformKey(s,c);
  expect(clipWaveformKey(s,{...c,name:'renamed'})).toBe(key);
  for(const change of [{gain:.5},{sourceOffset:2},{startTime:4},{fadeInDuration:.5},
   {effects:[{type:'lowpass' as const,enabled:true,params:{freq:400}}]}])
   expect(clipWaveformKey(s,{...c,...change})).not.toBe(key);
  expect(clipWaveformKey({...s,buffer:{} as AudioBuffer},c)).not.toBe(key);
 });
 it('does not pretend native or over-budget effects are processed',()=>{
  vi.stubGlobal('OfflineAudioContext',class {});
  const s=source(),c=clip();expect(clipWaveformState(s,c)).toBe('pending');
  expect(clipWaveformState(s,{...c,duration:61})).toBe('source');
  expect(clipWaveformState({...s,sampleRate:192000},{...c,duration:60})).toBe('source');
  expect(clipWaveformState(s,{...c,effects:[]})).toBe('dry');
  const native={instanceId:'n',pluginId:'p',name:'plug',format:'AU' as const,enabled:true,bypass:false,parameters:{},state:''};
  expect(clipWaveformState(s,{...c,nativeEffects:[native]})).toBe('source');
  expect(clipWaveformState(s,{...c,nativeEffects:[{...native,bypass:true}]})).toBe('pending');
 });
 it('serializes DSP, skips obsolete queued edits and discards an in-flight stale result',async()=>{
  vi.stubGlobal('OfflineAudioContext',class {});
  let finish!:(b:AudioBuffer)=>void;
  const render=vi.spyOn(TimelineEngine,'renderClipWaveform').mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  let current=true;
  const first=prepareClipWaveform(source(),clip(),()=>current);
  await Promise.resolve();expect(render).toHaveBeenCalledTimes(1);
  const obsolete=prepareClipWaveform(source(),clip(),()=>false);
  await Promise.resolve();expect(render).toHaveBeenCalledTimes(1);
  current=false;finish({} as AudioBuffer);
  expect(await first).toBeUndefined();expect(await obsolete).toBeUndefined();expect(render).toHaveBeenCalledTimes(1);
 });
 it('includes both channels in peaks and reuses completed results without changing source audio',async()=>{
  vi.stubGlobal('OfflineAudioContext',class {});
  const s=source(),c=clip(),left=new Float32Array(480).fill(.2),right=new Float32Array(480).fill(-.7);
  const buffer={length:480,duration:.01,sampleRate:48000,numberOfChannels:2,getChannelData:(i:number)=>i?right:left} as AudioBuffer;
  const render=vi.spyOn(TimelineEngine,'renderClipWaveform').mockResolvedValue(buffer);
  const result=await prepareClipWaveform(s,c,()=>true);
  expect(result?.peaks.min[0]).toBeCloseTo(-.7);expect(result?.peaks.max[0]).toBeCloseTo(.2);
  expect(await prepareClipWaveform(s,c,()=>true)).toBe(result);expect(render).toHaveBeenCalledTimes(1);
  expect(s.buffer).not.toBe(buffer);expect(s.peaks.max[0]).toBe(0);
 });
});
