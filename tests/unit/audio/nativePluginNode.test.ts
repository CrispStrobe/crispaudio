import {beforeEach,it,expect,vi} from 'vitest';
const open=vi.hoisted(()=>vi.fn());vi.mock('../../../src/audio/plugins/NativePluginStream',()=>({NativePluginStream:{open}}));
import {createNativePluginNode} from '../../../src/audio/plugins/NativePluginNode';
class Node {port={postMessage:vi.fn(),onmessage:null as ((e:{data:unknown})=>void)|null};disconnect=vi.fn();onprocessorerror:(()=>void)|null=null;}
const request={id:'test',sampleRate:48000,channels:1 as const};
beforeEach(()=>{vi.stubGlobal('AudioWorkletNode',Node);open.mockReset();});
const context=()=>({sampleRate:48000,currentTime:1,audioWorklet:{addModule:vi.fn().mockResolvedValue(undefined)}} as unknown as AudioContext);
const stream=()=>({info:{latencySamples:0},close:vi.fn().mockResolvedValue(undefined),process:vi.fn(),snapshot:vi.fn()});
it('rejects invalid clocks before opening and closes a processor whose origin expired during initialization',async()=>{const s=stream();open.mockResolvedValue(s);await expect(createNativePluginNode(context(),{...request,sampleRate:44100},{startFrame:96000,onFault:()=>{}})).rejects.toThrow(/clock/);expect(open).not.toHaveBeenCalled();await expect(createNativePluginNode(context(),request,{startFrame:0,onFault:()=>{}})).rejects.toThrow(/expired/);expect(s.close).toHaveBeenCalledOnce();});
it('processor errors always close the owned stream, even if the fault callback throws',async()=>{const s=stream();open.mockResolvedValue(s);const bridge=await createNativePluginNode(context(),request,{startFrame:96000,onFault:()=>{throw new Error('caller fault');}});expect(()=>bridge.node.onprocessorerror?.(new Event('processorerror'))).toThrow('caller fault');expect(s.close).toHaveBeenCalledOnce();await bridge.close();expect(s.close).toHaveBeenCalledOnce();});
it('aborts immediately after native opening without returning a silent disposed node',async()=>{const abort=new AbortController(),s=stream();open.mockImplementation(async()=>{abort.abort();return s;});await expect(createNativePluginNode(context(),request,{startFrame:96000,signal:abort.signal,onFault:()=>{}})).rejects.toMatchObject({name:'AbortError'});expect(s.close).toHaveBeenCalledOnce();});
