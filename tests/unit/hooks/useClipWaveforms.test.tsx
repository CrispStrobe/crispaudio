import {act, cleanup, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useClipWaveforms} from '../../../src/hooks/useClipWaveforms';
import {waveformRequest} from '../../../src/lib/clipWaveformScheduler';
import {prepareClipWaveform} from '../../../src/lib/clipWaveform';
import type {AudioSegment, AudioSource, TimelineTrack} from '../../../src/types/audio';
const cache=vi.hoisted(()=>new Map<string,AudioSource>());
vi.mock('../../../src/lib/clipWaveform',async original=>({...await original<typeof import('../../../src/lib/clipWaveform')>(),
  cachedClipWaveform:(key:string)=>cache.get(key),prepareClipWaveform:vi.fn()}));
const source={buffer:{},sampleRate:48000} as AudioSource,processed={buffer:{},name:'processed'} as AudioSource;
const clip={id:'c',sourceId:'s',startTime:0,sourceOffset:0,duration:2,gain:1,fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear',effects:[{type:'lowpass',enabled:true,params:{freq:1000}}]} as AudioSegment;
const tracks=(c:AudioSegment)=>[{id:'t',segments:[c]} as TimelineTrack];
const sources=new Map([['s',source]]);
let visibility:DocumentVisibilityState;
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('OfflineAudioContext',class {});visibility='visible';vi.spyOn(document,'visibilityState','get').mockImplementation(()=>visibility);
 vi.mocked(prepareClipWaveform).mockImplementation(async(s,c,current)=>{if(!current())return;cache.set(waveformRequest(s,c).key,processed);return processed;});});
afterEach(()=>{cleanup();cache.clear();vi.restoreAllMocks();vi.clearAllMocks();vi.useRealTimers();vi.unstubAllGlobals();});
describe('waveform preview presentation',()=>{
 it('keeps a prior processed shape while the new FX renders, but drops it immediately after a trim',async()=>{
  const {result,rerender}=renderHook(({c})=>useClipWaveforms(tracks(c),sources,0,3),{initialProps:{c:clip}});
  expect(result.current.get('c')).toEqual({state:'pending',source:undefined});
  await act(()=>vi.advanceTimersByTimeAsync(120));expect(result.current.get('c')).toEqual({state:'ready',source:processed});
  const changed={...clip,effects:[{type:'lowpass' as const,enabled:true,params:{freq:200}}]};rerender({c:changed});
  expect(result.current.get('c')).toEqual({state:'pending',source:processed});
  rerender({c:{...changed,sourceOffset:1}});expect(result.current.get('c')).toEqual({state:'pending',source:undefined});
  await act(()=>vi.advanceTimersByTimeAsync(120));expect(result.current.get('c')?.state).toBe('ready');
 });
 it('suspends hidden documents and prepares the current view on return',async()=>{
  const {result}=renderHook(()=>useClipWaveforms(tracks(clip),sources,0,3));
  act(()=>{visibility='hidden';document.dispatchEvent(new Event('visibilitychange'));});
  expect(result.current.size).toBe(0);await act(()=>vi.advanceTimersByTimeAsync(500));expect(prepareClipWaveform).not.toHaveBeenCalled();
  act(()=>{visibility='visible';document.dispatchEvent(new Event('visibilitychange'));});
  await act(()=>vi.advanceTimersByTimeAsync(120));expect(result.current.get('c')?.state).toBe('ready');
 });
 it('uses dry drawing immediately after bypass instead of a stale processed shape',async()=>{
  const {result,rerender}=renderHook(({c})=>useClipWaveforms(tracks(c),sources,0,3),{initialProps:{c:clip}});
  await act(()=>vi.advanceTimersByTimeAsync(120));rerender({c:{...clip,effects:[]}});
  expect(result.current.get('c')).toEqual({state:'dry'});
 });
});
