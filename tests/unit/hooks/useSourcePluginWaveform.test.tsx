import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,renderHook} from '@testing-library/react';
import {useSourcePluginWaveform} from '../../../src/hooks/useSourcePluginWaveform';
import {renderSourcePluginWaveform} from '../../../src/audio/engine/SourcePluginWaveform';
import type {NativeSourceInput} from '../../../src/audio/engine/NativeSourceAudition';
vi.mock('../../../src/audio/engine/SourcePluginWaveform',async original=>({...await original<object>(),renderSourcePluginWaveform:vi.fn()}));
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();});
function fixture(){
 vi.useFakeTimers();const jobs:{signal:AbortSignal;resolve:(pcm:Float32Array[])=>void;reject:(e:Error)=>void}[]=[];
 vi.mocked(renderSourcePluginWaveform).mockImplementation((...args)=>new Promise((resolve,reject)=>jobs.push({signal:args[1],resolve,reject})));
 const input:NativeSourceInput={channels:[new Float32Array(4800)],sampleRate:48000,range:{start:0,end:4800},effect:{instanceId:'test',pluginId:'vst3:test',name:'Test',format:'VST3',enabled:true,bypass:false,state:'base',parameters:{gain:0}}};
 const props={input,enabled:true,identity:{}},view=renderHook(p=>useSourcePluginWaveform(p.input,p.enabled,p.identity),{initialProps:props});
 return {props,view,jobs,tick:async()=>{await act(async()=>vi.advanceTimersByTimeAsync(350));},finish:async(index:number)=>{await act(async()=>{jobs[index].resolve(props.input.channels);await Promise.resolve();});}};
}
it('returns display PCM only for the current settings and hides a stale snapshot immediately',async()=>{const h=fixture();await h.tick();await h.finish(0);expect(h.view.result.current.status).toBe('ready');expect(h.view.result.current.pcm).toBe(h.props.input.channels);h.view.rerender({...h.props,input:{...h.props.input,effect:{...h.props.input.effect,parameters:{gain:-6}}}});expect(h.view.result.current.pcm).toBeUndefined();expect(h.view.result.current.status).toBe('updating');await h.tick();await h.finish(1);expect(h.view.result.current.status).toBe('ready');});
it('rejects late work after project/source identity changes and serializes replacements',async()=>{const h=fixture();await h.tick();h.view.rerender({...h.props,identity:{}});expect(h.jobs[0].signal.aborted).toBe(true);await h.tick();expect(h.jobs).toHaveLength(1);await h.finish(0);expect(h.view.result.current.pcm).toBeUndefined();expect(h.jobs).toHaveLength(2);await h.finish(1);expect(h.view.result.current.status).toBe('ready');});
it('cancels on selection changes, recording/disable and unmount',async()=>{const h=fixture();await h.tick();h.view.rerender({...h.props,input:{...h.props.input,range:{start:200,end:1200}}});expect(h.jobs[0].signal.aborted).toBe(true);h.view.rerender({...h.props,enabled:false});expect(h.view.result.current.status).toBe('source');await h.finish(0);await h.tick();expect(h.jobs).toHaveLength(1);expect(h.view.result.current.pcm).toBeUndefined();h.view.rerender(h.props);await h.tick();h.view.unmount();expect(h.jobs[1].signal.aborted).toBe(true);await h.finish(1);});
it('falls back without allocating render PCM when the automatic memory budget is exceeded',async()=>{const h=fixture();h.view.rerender({...h.props,input:{...h.props.input,channels:[new Float32Array(4000000)],range:{start:0,end:4000000}}});expect(h.view.result.current.status).toBe('limited');await h.tick();expect(h.jobs).toHaveLength(0);});
it('pauses and waits for the active graph, without publishing it, before explicit Prepare',async()=>{const h=fixture();await h.tick();let settled=false;const wait=h.view.result.current.pause().then(()=>{settled=true;});await act(async()=>{await Promise.resolve();});expect(settled).toBe(false);expect(h.jobs[0].signal.aborted).toBe(true);await h.finish(0);await wait;expect(settled).toBe(true);expect(h.view.result.current.pcm).toBeUndefined();});
it('reports current render failure without retaining display PCM',async()=>{const h=fixture();await h.tick();await act(async()=>h.jobs[0].reject(new Error('failed')));expect(h.view.result.current.status).toBe('error');expect(h.view.result.current.pcm).toBeUndefined();});
it('coalesces rapid parameter edits and preserves the snapshot on unrelated rerenders',async()=>{
 const h=fixture();for(const gain of [1,2,3])h.view.rerender({...h.props,input:{...h.props.input,effect:{...h.props.input.effect,parameters:{gain}}}});
 await h.tick();expect(h.jobs).toHaveLength(1);expect(vi.mocked(renderSourcePluginWaveform).mock.calls.at(-1)![0].effect.parameters).toEqual({gain:3});await h.finish(0);const pcm=h.view.result.current.pcm;h.view.rerender({...h.props,input:vi.mocked(renderSourcePluginWaveform).mock.calls.at(-1)![0]});await h.tick();expect(h.view.result.current.pcm).toBe(pcm);expect(h.jobs).toHaveLength(1);
});
