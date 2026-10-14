import {beforeEach,it,expect,vi} from 'vitest';
import type {AudioSegment,AudioSource,TimelineProject} from '../../../src/types/audio';
const prepare=vi.hoisted(()=>vi.fn());
vi.mock('../../../src/audio/plugins/NativePluginNode',()=>({prepareNativePluginNode:prepare}));
vi.mock('../../../src/audio/plugins/GraphCompensation',async importOriginal=>({...await importOriginal<object>(),prepareGraphCompensation:vi.fn().mockResolvedValue(undefined)}));
import {TimelineEngine} from '../../../src/audio/engine/TimelineEngine';
import {useProjectStore} from '../../../src/stores/projectStore';
class Node {
 connect=vi.fn();disconnect=vi.fn();start=vi.fn();stop=vi.fn();onended?:()=>void;
 port={postMessage:vi.fn(),close:vi.fn()};buffer?:AudioBuffer;
 gain=parameter();pan=parameter();
 constructor(public kind:string,public options?:{processorOptions:{frames:number}}){}
}
function parameter(){return {value:1,setValueAtTime:vi.fn(),setTargetAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),cancelScheduledValues:vi.fn()};}
function context(){const nodes:Node[]=[];const make=(kind:string)=>{const node=new Node(kind);nodes.push(node);return node;};
 vi.stubGlobal('AudioWorkletNode',class extends Node{constructor(_ctx:unknown,kind:string,options:Node['options']){super(kind,options);nodes.push(this);}});
 const ctx={state:'running',currentTime:1,sampleRate:48000,destination:{},createGain:()=>make('gain'),createStereoPanner:()=>make('pan'),createBufferSource:()=>make('source'),createChannelSplitter:()=>make('split'),createAnalyser:()=>make('meter'),createBuffer:()=>({})};
 return {ctx:ctx as unknown as AudioContext,nodes};
}
const clip=(id:string,trackId:string):AudioSegment=>({id,trackId,sourceId:'s',startTime:2,sourceOffset:0,duration:1,gain:1,effects:[],fadeInDuration:.1,fadeOutDuration:.1,fadeInCurve:'linear',fadeOutCurve:'linear'});
function project():TimelineProject{return {...useProjectStore.getInitialState().project,duration:3,tracks:[{id:'a',name:'A',volume:1,pan:0,muted:false,solo:false,output:'bus',segments:[clip('ca','a')]},{id:'b',name:'B',volume:1,pan:0,muted:false,solo:false,output:'bus',segments:[clip('cb','b')]},{id:'bus',kind:'bus',name:'Bus',volume:1,pan:0,muted:false,solo:false,segments:[]}]};}
const request={id:'vst3:test',sampleRate:48000,channels:2 as const,bypass:true};
function bridge(delayFrames:number){return {delayFrames,attach:vi.fn(()=>new Node('native')),update:vi.fn(),snapshot:vi.fn().mockResolvedValue({metadata:{state:'program',parameters:[{address:'100',value:.5}]}}),close:vi.fn().mockResolvedValue(undefined)};}
beforeEach(()=>{prepare.mockReset();});
it('aligns clip fades, track automation, bus racks and the audible recording clock, then disposes at range end',async()=>{
 const {ctx,nodes}=context(),engine=new TimelineEngine(ctx),a=bridge(128),track=bridge(256),bus=bridge(512);prepare.mockResolvedValueOnce(a).mockResolvedValueOnce(track).mockResolvedValueOnce(bus);
 engine.setSources(new Map([['s',{buffer:{}} as AudioSource]]));
 await engine.playNative(project(),2,3,new Map([['clip:ca',[request]],['track:a',[request]],['track:bus',[request]]]),()=>{});
 expect(prepare.mock.calls.map(c=>c[1].transport)).toEqual(Array(3).fill({samplePosition:96000,tempo:120,numerator:4,denominator:4,originSeconds:0,playing:true}));
 const input=48000+4096,audible=input+896;
 expect(a.attach).toHaveBeenCalledWith(input);expect(track.attach).toHaveBeenCalledWith(input+128);expect(bus.attach).toHaveBeenCalledWith(input+384);
 expect(engine.playbackAnchor()).toEqual({frame:audible,timeline:2});expect(engine.automationClock()?.time).toBe(2);
 const compensation=nodes.filter(n=>n.kind==='crispaudio-frame-delay');expect(compensation.map(n=>n.options!.processorOptions.frames)).toEqual([384]);
 const sources=nodes.filter(n=>n.kind==='source');expect(sources.slice(1).map(n=>n.start.mock.calls[0])).toEqual([[input/48000,0,1],[input/48000,0,1]]);
 expect(nodes.some(n=>n.gain.linearRampToValueAtTime.mock.calls.some(c=>Math.abs(c[1]-((input+128)/48000+.1))<1e-9))).toBe(true);
 Object.assign(ctx,{currentTime:(audible+24000)/48000});expect(engine.automationClock()?.time).toBe(2.5);
 sources[0].onended?.();expect(engine.playbackAnchor()).toBeUndefined();expect(a.close).toHaveBeenCalledOnce();expect(track.close).toHaveBeenCalledOnce();expect(bus.close).toHaveBeenCalledOnce();expect(compensation.every(n=>n.port.postMessage.mock.calls.some(c=>c[0].type==='dispose'))).toBe(true);
});
it('stopped preparation cannot replace a newer ordinary playback graph',async()=>{
 const {ctx}=context(),engine=new TimelineEngine(ctx),late=bridge(128);let resolve!:(value:ReturnType<typeof bridge>)=>void;prepare.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const pending=engine.playNative(project(),2,3,new Map([['track:a',[request]]]),()=>{});await vi.waitFor(()=>expect(prepare).toHaveBeenCalledOnce());
 engine.play(project(),2);const anchor=engine.playbackAnchor();resolve(late);await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(late.attach).not.toHaveBeenCalled();expect(late.close).toHaveBeenCalledOnce();expect(engine.playbackAnchor()).toEqual(anchor);engine.stop();
});
it('closes earlier inserts if later preparation fails and stops the whole graph on a runtime fault',async()=>{
 const {ctx}=context(),engine=new TimelineEngine(ctx),first=bridge(128);prepare.mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('Unavailable plugin'));
 await expect(engine.playNative(project(),2,3,new Map([['track:a',[request,request]]]),()=>{})).rejects.toThrow('Unavailable plugin');expect(first.close).toHaveBeenCalledOnce();expect(engine.playbackAnchor()).toBeUndefined();
 const active=bridge(128),fault=vi.fn();prepare.mockResolvedValueOnce(active);await engine.playNative(project(),2,3,new Map([['track:a',[request]]]),fault);
 prepare.mock.calls.at(-1)![2].onFault('underrun');expect(fault).toHaveBeenCalledWith('track:a: underrun');expect(active.close).toHaveBeenCalledOnce();expect(engine.playbackAnchor()).toBeUndefined();
});
it('rejects unknown racks and unsupported native channel layouts before opening sessions',async()=>{
 const {ctx}=context(),engine=new TimelineEngine(ctx);
 await expect(engine.playNative(project(),2,3,new Map([['track:missing',[request]]]),()=>{})).rejects.toThrow(/scope/);
 await expect(engine.playNative(project(),2,3,new Map([['master',[{...request,channels:1}]]]),()=>{})).rejects.toThrow(/stereo/);expect(prepare).not.toHaveBeenCalled();
});
it('activates serial master inserts at successive arrivals and ignores the old range-end callback after a restart',async()=>{
 const {ctx,nodes}=context(),engine=new TimelineEngine(ctx),first=bridge(128),second=bridge(256);prepare.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
 const p=project();p.tracks.push({id:'empty',name:'Empty',volume:1,pan:0,solo:false,muted:false,segments:[]});
 await engine.playNative(p,2,3,new Map([['master',[request,request]]]),()=>{});
 expect(first.attach).toHaveBeenCalledWith(52096);expect(second.attach).toHaveBeenCalledWith(52224);expect(engine.playbackAnchor()?.frame).toBe(52480);
 const oldEnd=nodes.find(n=>n.kind==='source')!.onended;engine.play(p,2);const anchor=engine.playbackAnchor();oldEnd?.();expect(engine.playbackAnchor()).toEqual(anchor);expect(first.close).toHaveBeenCalledOnce();expect(second.close).toHaveBeenCalledOnce();engine.stop();
});
it('retains request, project and source snapshots while native preparation awaits',async()=>{
 const {ctx,nodes}=context(),engine=new TimelineEngine(ctx),insert=bridge(128),original={} as AudioBuffer;prepare.mockResolvedValue(insert);
 engine.setSources(new Map([['s',{buffer:original} as AudioSource]]));const p=project(),parameters={gain:.5},racks=new Map([['track:a',[{...request,parameters}]]]);
 const pending=engine.playNative(p,2,3,racks,()=>{});parameters.gain=0;racks.clear();p.tracks[0].segments[0].sourceOffset=99;engine.setSources(new Map());await pending;
 expect(prepare.mock.calls[0][1].parameters).toEqual({gain:.5});expect(nodes.filter(n=>n.kind==='source').slice(1).every(n=>n.buffer===original&&n.start.mock.calls[0][1]===0)).toBe(true);engine.stop();
});

it('live native controls keep the graph and bypass state, validate edits and capture independent paused state',async()=>{
 const {ctx}=context(),engine=new TimelineEngine(ctx),insert=bridge(128);prepare.mockResolvedValue(insert);
 expect(engine.updateNativeInsert('track:a',0,{bypass:true})).toBe(false);await expect(engine.snapshotNativeRacks()).rejects.toThrow(/active/);
 await engine.playNative(project(),2,3,new Map([['track:a',[{...request,parameters:{'100':.001}}]]]),()=>{});const anchor=engine.playbackAnchor(),parameters={'101':.25};
 expect(engine.updateNativeInsert('track:a',0,{parameters})).toBe(true);parameters['101']=99;expect(insert.update).toHaveBeenLastCalledWith({'100':.001,'101':.25},true);
 expect(engine.updateNativeInsert('track:missing',0,{bypass:false})).toBe(false);expect(engine.updateNativeInsert('track:a',.5,{bypass:false})).toBe(false);
 expect(()=>engine.updateNativeInsert('track:a',0,{parameters:{'100':NaN}})).toThrow(/parameters/);expect(()=>engine.updateNativeInsert('track:a',0,{parameters:Object.fromEntries(Array.from({length:1000},(_,i)=>[`parameter-${i}`,0]))})).toThrow(/parameters/);expect(prepare).toHaveBeenCalledOnce();expect(engine.playbackAnchor()).toEqual(anchor);
 await expect(engine.snapshotNativeRacks()).rejects.toThrow(/Pause/);expect(insert.snapshot).not.toHaveBeenCalled();Object.assign(ctx,{state:'suspended'});
 const saved=await engine.snapshotNativeRacks();expect(saved.get('track:a')![0]).toMatchObject({state:'program',parameters:{'100':.001,'101':.25},bypass:true});
 saved.get('track:a')![0].parameters!['100']=99;expect((await engine.snapshotNativeRacks()).get('track:a')![0].parameters!['100']).toBe(.001);engine.stop();expect(engine.updateNativeInsert('track:a',0,{bypass:false})).toBe(false);
});
it('rejects native state captures changed by live edits, resumed playback or graph replacement',async()=>{
 const {ctx}=context(),engine=new TimelineEngine(ctx),insert=bridge(128);prepare.mockResolvedValue(insert);await engine.playNative(project(),2,3,new Map([['track:a',[request]]]),()=>{});Object.assign(ctx,{state:'suspended'});
 let release!:(value:unknown)=>void;insert.snapshot.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 let captured=engine.snapshotNativeRacks(),rejected=expect(captured).rejects.toThrow(/changed/);engine.updateNativeInsert('track:a',0,{bypass:false});release({metadata:{state:'stale'}});await rejected;
 captured=engine.snapshotNativeRacks();rejected=expect(captured).rejects.toThrow(/changed/);Object.assign(ctx,{state:'running'});release({metadata:{state:'stale'}});await rejected;
 Object.assign(ctx,{state:'suspended'});captured=engine.snapshotNativeRacks();const closed=expect(captured).rejects.toMatchObject({name:'AbortError'});engine.stop();release({metadata:{state:'stale'}});await closed;
});

it('keeps normal playback gated but routes saved native racks into the coordinated offline renderer',async()=>{
 const {ctx}=context(),engine=new TimelineEngine(ctx),p=project();p.nativeEffects=[{instanceId:'m',pluginId:'au:test',name:'Test',format:'AU',enabled:true,bypass:false,state:'program',parameters:{'0':440}}];
 expect(()=>engine.play(p,2)).toThrow(/awaiting validation/);expect(prepare).not.toHaveBeenCalled();
 const output={} as AudioBuffer,render=vi.spyOn(engine,'renderNativeToBuffer').mockResolvedValue(output),sources=new Map<string,AudioSource>();expect(await engine.renderToBuffer(p,2,3,undefined,sources)).toBe(output);expect(render.mock.calls[0][3].get('master')![0]).toMatchObject({instanceId:'m',id:'au:test',sampleRate:p.sampleRate,state:'program'});expect(render.mock.calls[0][5]).toBe(sources);
 const range=vi.spyOn(engine,'renderNativeMixRange').mockResolvedValue(output);expect(await engine.renderMixRange(p,2,3,undefined,sources)).toBe(output);expect(range).toHaveBeenCalledOnce();
});
