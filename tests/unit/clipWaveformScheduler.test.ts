import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ClipWaveformScheduler, waveformRequest} from '../../src/lib/clipWaveformScheduler';
import {prepareClipWaveform, cachedClipWaveform} from '../../src/lib/clipWaveform';
import type {AudioSegment, AudioSource} from '../../src/types/audio';
vi.mock('../../src/lib/clipWaveform', async original => ({...await original<typeof import('../../src/lib/clipWaveform')>(),
  prepareClipWaveform: vi.fn(), cachedClipWaveform: vi.fn()}));
const source = {buffer: {}, sampleRate:48000} as AudioSource;
const clip = {id:'c',sourceOffset:0,duration:2,startTime:0,gain:1,fadeInDuration:0,fadeOutDuration:0,
  fadeInCurve:'linear',fadeOutCurve:'linear',effects:[{type:'lowpass',enabled:true,params:{freq:1000}}]} as AudioSegment;
const request = (freq:number, offset=0) => waveformRequest(source,{...clip,sourceOffset:offset,
  effects:[{type:'lowpass',enabled:true,params:{freq}}]});
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('OfflineAudioContext',class {});vi.mocked(cachedClipWaveform).mockReturnValue(undefined);vi.mocked(prepareClipWaveform).mockResolvedValue(undefined);});
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();vi.unstubAllGlobals();});
describe('continuous waveform refresh',()=>{
 it('samples the latest edit during continuous movement without resetting the deadline',async()=>{
  const notify=vi.fn(),worker=new ClipWaveformScheduler(notify);
  for(let i=0;i<12;i++){worker.update([request(1000+i)]);await vi.advanceTimersByTimeAsync(10);}
  expect(prepareClipWaveform).toHaveBeenCalledTimes(1);
  expect(vi.mocked(prepareClipWaveform).mock.calls[0][1].effects[0].params.freq).toBe(1011);
  expect(notify).toHaveBeenCalledTimes(1);worker.dispose();
 });
 it('finishes an older shape while edits continue, then renders the latest state without overlap',async()=>{
  let finish!:(s:AudioSource|undefined)=>void;
  vi.mocked(prepareClipWaveform).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const notify=vi.fn(),worker=new ClipWaveformScheduler(notify),first=request(1000),latest=request(200);
  worker.update([first]);await vi.advanceTimersByTimeAsync(120);worker.update([latest]);
  await vi.advanceTimersByTimeAsync(500);expect(prepareClipWaveform).toHaveBeenCalledTimes(1);
  expect(vi.mocked(prepareClipWaveform).mock.calls[0][2]()).toBe(true);
  finish(source);await vi.advanceTimersByTimeAsync(0);
  expect(notify.mock.calls[0][0].get('c').key).toBe(first.key);
  await vi.advanceTimersByTimeAsync(120);expect(prepareClipWaveform).toHaveBeenCalledTimes(2);
  expect(notify.mock.calls[1][0].get('c').key).toBe(latest.key);worker.dispose();
 });
 it('rejects a result after trim/source geometry changes or the clip leaves the viewport',async()=>{
  let finish!:(s:AudioSource|undefined)=>void;
  vi.mocked(prepareClipWaveform).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const notify=vi.fn(),worker=new ClipWaveformScheduler(notify);
  worker.update([request(1000)]);await vi.advanceTimersByTimeAsync(120);
  worker.update([request(1000,1)]);expect(vi.mocked(prepareClipWaveform).mock.calls[0][2]()).toBe(false);
  worker.update([]);finish(source);await vi.advanceTimersByTimeAsync(1000);
  expect(notify).not.toHaveBeenCalled();expect(prepareClipWaveform).toHaveBeenCalledTimes(1);worker.dispose();
 });
 it('does not retry a failed or evicted result until the audible key changes',async()=>{
  vi.mocked(prepareClipWaveform).mockRejectedValueOnce(Error('DSP unavailable'));
  const worker=new ClipWaveformScheduler(vi.fn());worker.update([request(1000)]);
  await vi.advanceTimersByTimeAsync(1000);worker.update([request(1000)]);await vi.advanceTimersByTimeAsync(1000);
  expect(prepareClipWaveform).toHaveBeenCalledTimes(1);
  worker.update([request(200)]);await vi.advanceTimersByTimeAsync(120);expect(prepareClipWaveform).toHaveBeenCalledTimes(2);worker.dispose();
 });
 it('does not render a cached result or execute a timer after disposal',async()=>{
  vi.mocked(cachedClipWaveform).mockReturnValue(source);
  const worker=new ClipWaveformScheduler(vi.fn());worker.update([request(1000)]);await vi.advanceTimersByTimeAsync(120);
  expect(prepareClipWaveform).not.toHaveBeenCalled();
  vi.mocked(cachedClipWaveform).mockReturnValue(undefined);worker.update([request(200)]);worker.dispose();await vi.advanceTimersByTimeAsync(1000);
  expect(prepareClipWaveform).not.toHaveBeenCalled();
 });
 it('cannot publish or continue after disposal during DSP',async()=>{
  let finish!:(s:AudioSource|undefined)=>void;
  vi.mocked(prepareClipWaveform).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const notify=vi.fn(),worker=new ClipWaveformScheduler(notify);worker.update([request(1000)]);await vi.advanceTimersByTimeAsync(120);
  worker.dispose();expect(vi.mocked(prepareClipWaveform).mock.calls[0][2]()).toBe(false);
  finish(source);await vi.advanceTimersByTimeAsync(1000);expect(notify).not.toHaveBeenCalled();
 });
});
