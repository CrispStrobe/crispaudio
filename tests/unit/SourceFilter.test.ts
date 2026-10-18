import {expect,it,vi} from 'vitest';
import {createSourceFilter,DEFAULT_SOURCE_FILTER,renderSourceFilter,sourceFilterSettings} from '../../src/audio/engine/SourceFilter';

it('updates a persistent graph without reconnecting nodes and keeps dry/wet histories for smooth bypass',()=>{
 const nodes:{disconnect:ReturnType<typeof vi.fn>;connect:ReturnType<typeof vi.fn>;frequency:{value:number;setTargetAtTime:ReturnType<typeof vi.fn>};gain:{value:number;setTargetAtTime:ReturnType<typeof vi.fn>};Q:{value:number};type:string}[]=[],create=()=>{const node={disconnect:vi.fn(),connect:vi.fn(),frequency:{value:0,setTargetAtTime:vi.fn()},gain:{value:0,setTargetAtTime:vi.fn()},Q:{value:0},type:''};nodes.push(node);return node;},ctx={sampleRate:48000,currentTime:3,createGain:create,createBiquadFilter:create};
 const graph=createSourceFilter(ctx as unknown as BaseAudioContext,{} as AudioNode,DEFAULT_SOURCE_FILTER);
 expect(nodes).toHaveLength(6);expect(nodes[1].type).toBe('highpass');expect(nodes[2].type).toBe('lowpass');expect(nodes[1].Q.value).toBeCloseTo(-3.0102999566);
 const connections=nodes.map(n=>n.connect.mock.calls.length);graph.update({highpass:200,lowpass:4000,gainDb:-6},true);
 expect(nodes[1].frequency.setTargetAtTime).toHaveBeenCalledWith(200,3,.01);expect(nodes[3].gain.setTargetAtTime).toHaveBeenCalledWith(10**(-6/20),3,.005);expect(nodes[4].gain.setTargetAtTime).toHaveBeenCalledWith(0,3,.005);expect(nodes[5].gain.setTargetAtTime).toHaveBeenCalledWith(1,3,.005);expect(nodes.map(n=>n.connect.mock.calls.length)).toEqual(connections);
 graph.close();graph.close();expect(nodes.every(n=>n.disconnect.mock.calls.length===1)).toBe(true);graph.update(DEFAULT_SOURCE_FILTER);expect(nodes[1].frequency.setTargetAtTime).toHaveBeenCalledTimes(1);
});

it('caps filter frequencies below Nyquist and rejects invalid settings',()=>{
 expect(sourceFilterSettings(DEFAULT_SOURCE_FILTER,8000).lowpass).toBe(3920);
 for(const settings of [{...DEFAULT_SOURCE_FILTER,gainDb:1},{...DEFAULT_SOURCE_FILTER,highpass:NaN},{...DEFAULT_SOURCE_FILTER,lowpass:Infinity}])expect(()=>sourceFilterSettings(settings,48000)).toThrow();
});

it('checks cancellation and memory/duration/channel budgets before allocating offline audio',async()=>{
 const controller=new AbortController();controller.abort();await expect(renderSourceFilter([new Float32Array(10)],[{start:0,end:10}],-1,48000,DEFAULT_SOURCE_FILTER,controller.signal)).rejects.toMatchObject({name:'AbortError'});
 await expect(renderSourceFilter([new Float32Array(960001)],[{start:0,end:960001}],-1,8000,DEFAULT_SOURCE_FILTER,new AbortController().signal)).rejects.toThrow('sourceFilter.limit');
 await expect(renderSourceFilter(Array.from({length:3},()=>new Float32Array(10)),[{start:0,end:10}],-1,48000,DEFAULT_SOURCE_FILTER,new AbortController().signal)).rejects.toThrow('sourceFilter.limit');
 await expect(renderSourceFilter([new Float32Array(10)],[{start:0,end:10}],2,48000,DEFAULT_SOURCE_FILTER,new AbortController().signal)).rejects.toThrow('sourceEditor.select');
});
