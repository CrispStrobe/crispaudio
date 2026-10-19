import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {renderSourcePluginWaveform,sourcePluginWaveformPlan} from '../../../src/audio/engine/SourcePluginWaveform';
import type {NativeSourceInput} from '../../../src/audio/engine/NativeSourceAudition';
const mocks=vi.hoisted(()=>({invoke:vi.fn(),read:vi.fn(),remove:vi.fn(),stat:vi.fn(),encode:vi.fn(),job:vi.fn(),decode:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.invoke}));
vi.mock('@tauri-apps/plugin-fs',()=>({readFile:mocks.read,remove:mocks.remove,stat:mocks.stat}));
vi.mock('../../../src/lib/wavExport',()=>({encodeSourceChannelsWav:mocks.encode}));
vi.mock('../../../src/lib/mediaJob',()=>({mediaJob:mocks.job}));
const input=(rate=48000,channels=2):NativeSourceInput=>({channels:Array.from({length:channels},(_,i)=>new Float32Array(4800).fill(i?-.1:.1)),sampleRate:rate,range:{start:100,end:2100},effect:{instanceId:'test',pluginId:'vst3:test',name:'Test',format:'VST3',enabled:true,bypass:false,state:'base',parameters:{gain:.5}}});
let current:NativeSourceInput,processed:Float32Array[];
beforeEach(()=>{
 vi.resetAllMocks();current=input();processed=current.channels.map(c=>Float32Array.from(c,v=>v*2));
 mocks.invoke.mockResolvedValue('/owned/input.wav');mocks.encode.mockResolvedValue(new Blob([new Uint8Array(44)]));mocks.job.mockResolvedValue({path:'/owned/output.wav',frames:4800,sampleRate:48000,state:'transient'});mocks.stat.mockResolvedValue({isFile:true,size:4800*8+44});mocks.read.mockResolvedValue(new Uint8Array(44));mocks.remove.mockResolvedValue(undefined);
 mocks.decode.mockImplementation(async()=>({sampleRate:current.sampleRate,length:4800,numberOfChannels:processed.length,getChannelData:(ch:number)=>processed[ch]}));
 vi.stubGlobal('OfflineAudioContext',class {decodeAudioData=mocks.decode;});
});
afterEach(()=>vi.unstubAllGlobals());
it.each([44100,48000])('splices a fresh %i Hz render into the selection without changing original PCM or effect state',async rate=>{
 current=input(rate);processed=current.channels.map(c=>Float32Array.from(c,v=>v*2));mocks.job.mockResolvedValue({path:'/owned/output.wav',frames:4800,sampleRate:rate});
 const result=await renderSourcePluginWaveform(current,new AbortController().signal);
 for(let ch=0;ch<result.length;ch++)for(let i=0;i<4800;i++)expect(result[ch][i]).toBe(i>=100&&i<2100?processed[ch][i]:current.channels[ch][i]);
 expect(current.channels[0][200]).toBeCloseTo(.1);expect(current.effect.state).toBe('base');
 expect(mocks.job).toHaveBeenCalledWith('audio_unit_plugin',expect.objectContaining({operation:'plugin-render',request:expect.objectContaining({offset:0,duration:4800/rate,state:'base',parameters:{gain:.5}})}),expect.any(AbortSignal),expect.any(Function));
 expect(mocks.remove).toHaveBeenCalledWith('/owned/output.wav');expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:false});
 expect(mocks.invoke.mock.calls.some(([command])=>command.startsWith('native_')||command==='persist_recording'||command==='recording_conversion_protect')).toBe(false);
});
it('admits mono and refuses excessive allocation, rates, shape, selection and effects before any work',async()=>{
 expect(sourcePluginWaveformPlan(input(44100,1)).estimatedBytes).toBeLessThan(64*1024*1024);
 const invalid=[{...current,sampleRate:96000},{...current,channels:[new Float32Array(48000*120),new Float32Array(48000*120)]},{...current,range:{start:1,end:5000}},{...current,channels:[new Float32Array(1),new Float32Array(2)]},{...current,effect:{...current.effect,enabled:false}}];
 for(const value of invalid)await expect(renderSourcePluginWaveform(value,new AbortController().signal)).rejects.toThrow();
 expect(mocks.encode).not.toHaveBeenCalled();expect(mocks.invoke).not.toHaveBeenCalled();
});
it('finishes a late input allocation after cancellation without launching a helper',async()=>{
 const controller=new AbortController();mocks.invoke.mockImplementation(async command=>{if(command==='recording_conversion_begin')controller.abort();return '/owned/input.wav';});
 await expect(renderSourcePluginWaveform(current,controller.signal)).rejects.toMatchObject({name:'AbortError'});
 expect(mocks.job).not.toHaveBeenCalled();expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:false});
});
it('rolls back input on helper failure',async()=>{
 mocks.job.mockRejectedValue(new Error('helper failed'));await expect(renderSourcePluginWaveform(current,new AbortController().signal)).rejects.toThrow('helper failed');
 expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:false});expect(mocks.remove).not.toHaveBeenCalled();
});
it.each([{sampleRate:44100,frames:4800},{sampleRate:48000,frames:4801}])('rejects invalid helper metadata and removes both files',async metadata=>{
 mocks.job.mockResolvedValue({path:'/owned/output.wav',...metadata});await expect(renderSourcePluginWaveform(current,new AbortController().signal)).rejects.toThrow('format');
 expect(mocks.read).not.toHaveBeenCalled();expect(mocks.remove).toHaveBeenCalledWith('/owned/output.wav');expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:false});
});
it('checks file size before reading/decoding and still rolls back input if output cleanup fails',async()=>{
 mocks.stat.mockResolvedValue({isFile:true,size:10000000});mocks.remove.mockRejectedValue(new Error('cleanup failed'));
 await expect(renderSourcePluginWaveform(current,new AbortController().signal)).rejects.toThrow('cleanup failed');expect(mocks.read).not.toHaveBeenCalled();expect(mocks.decode).not.toHaveBeenCalled();expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:false});
});
it.each(['channels','length','rate','nan'])('rejects invalid decoded %s and releases both files',async kind=>{
 mocks.decode.mockResolvedValue({sampleRate:kind==='rate'?44100:48000,length:kind==='length'?4799:4800,numberOfChannels:kind==='channels'?1:2,getChannelData:()=>new Float32Array(4800).fill(kind==='nan'?NaN:0)});
 await expect(renderSourcePluginWaveform(current,new AbortController().signal)).rejects.toThrow('PCM');expect(mocks.remove).toHaveBeenCalled();expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:false});
});
it('does not publish decoded PCM that finishes after cancellation',async()=>{
 const controller=new AbortController();mocks.decode.mockImplementation(async()=>{controller.abort();return {};});await expect(renderSourcePluginWaveform(current,controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(mocks.remove).toHaveBeenCalled();expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:false});
});
it('serializes snapshots across editor owners and skips an aborted waiter before allocating',async()=>{
 let finish!:(value:unknown)=>void;mocks.job.mockImplementationOnce(()=>new Promise(done=>{finish=done;}));
 const first=renderSourcePluginWaveform(current,new AbortController().signal);
 await vi.waitFor(()=>expect(mocks.job).toHaveBeenCalledOnce());
 const controller=new AbortController(),second=renderSourcePluginWaveform(input(),controller.signal),rejected=expect(second).rejects.toMatchObject({name:'AbortError'});
 controller.abort();await Promise.resolve();expect(mocks.encode).toHaveBeenCalledOnce();
 finish({path:'/owned/output.wav',frames:4800,sampleRate:48000});await first;await rejected;expect(mocks.encode).toHaveBeenCalledOnce();
});
