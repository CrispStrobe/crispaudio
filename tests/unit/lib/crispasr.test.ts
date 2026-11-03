import {describe,it,expect,vi,beforeEach} from 'vitest';
import {DEFAULT_MUSIC} from '../../../src/lib/musicalTime';
import {downbeatMeter,beatMarkers,blendSelection,decodeStems,musicFromBeats,pauseCuts,planPauses,processingWindow,tightenPauses,crispProcess} from '../../../src/lib/crispasr';
import type {TimelineProject} from '../../../src/types/audio';

const invoke=vi.fn();
vi.mock('@tauri-apps/api/core',()=>({invoke:(...args:unknown[])=>invoke(...args)}));

function project(video=false):TimelineProject{
 const clip=(id:string,track:string)=>({id,trackId:track,sourceId:'s',startTime:0,duration:10,sourceOffset:0,gain:1,name:id,color:'#fff',effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear' as const,fadeOutCurve:'linear' as const});
 return {id:'p',name:'P',sampleRate:48000,frameRate:25,duration:10,masterEffects:[],markers:[{id:'m',time:8,name:'End'}],
  tracks:[{id:'a',name:'A',muted:false,solo:false,volume:1,pan:0,segments:[clip('x','a')]},{id:'b',name:'B',muted:false,solo:false,volume:1,pan:0,segments:[clip('y','b')]}],
  ...(video?{video:{path:'v.mp4',duration:10,clips:[{id:'v',startTime:0,duration:10,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0}]}}:{})} as unknown as TimelineProject;
}
function stems(list:{name:string;channels:number[][]}[]):ArrayBuffer{
 const parts:number[]=[];const bytes:Uint8Array[]=[];
 const u32=(v:number)=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,v,true);bytes.push(b);};
 u32(list.length);
 for(const s of list){const name=new TextEncoder().encode(s.name);u32(name.length);bytes.push(name);u32(s.channels.length);u32(s.channels[0].length);for(const c of s.channels){const f=new Float32Array(c);bytes.push(new Uint8Array(f.buffer));}}
 void parts;const total=bytes.reduce((n,b)=>n+b.length,0),out=new Uint8Array(total);let at=0;for(const b of bytes){out.set(b,at);at+=b.length;}return out.buffer;
}

describe('CrispASR client helpers',()=>{
 beforeEach(()=>{invoke.mockReset();});

 it('decodes stem responses strictly',()=>{
  const decoded=decodeStems(stems([{name:'vocals',channels:[[.1,.2],[.3,.4]]},{name:'other',channels:[[0,1],[1,0]]}]));
  expect(decoded.map(s=>s.name)).toEqual(['vocals','other']);
  expect(Array.from(decoded[0].channels[1])).toEqual([Math.fround(.3),Math.fround(.4)]);
  const truncated=stems([{name:'vocals',channels:[[.1,.2]]}]).slice(0,-4);
  expect(()=>decodeStems(truncated)).toThrow('crisp.invalidResult');
  expect(()=>decodeStems(stems([{name:'x',channels:[[NaN]]}]))).toThrow('crisp.invalidResult');
 });

 it('sends planar raw PCM with a cancellable job header and validates lengths',async()=>{
  (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__={};
  invoke.mockResolvedValueOnce(stems([{name:'vocals',channels:[[1,2,3]]}]));
  const result=await crispProcess('separate','','/m.gguf',[new Float32Array([1,2,3])],48000,new AbortController().signal);
  expect(result[0].name).toBe('vocals');
  const [command,body,options]=invoke.mock.calls[0];
  expect(command).toBe('crispasr_process');
  expect(Array.from(new Float32Array((body as Uint8Array).buffer))).toEqual([1,2,3]);
  const header=JSON.parse((options as {headers:Record<string,string>}).headers['x-crispasr']);
  expect(header).toMatchObject({task:'separate',model:'/m.gguf',rate:48000,channels:1});
  expect(typeof header.jobId).toBe('string');
  invoke.mockResolvedValueOnce(stems([{name:'vocals',channels:[[1,2]]}]));
  await expect(crispProcess('separate','','/m.gguf',[new Float32Array([1,2,3])],48000,new AbortController().signal)).rejects.toThrow('crisp.invalidResult');
  await expect(crispProcess('separate','','',[new Float32Array(3)],48000,new AbortController().signal)).rejects.toThrow('crisp.chooseModel');
 });

 it('cancels the native job when aborted',async()=>{
  let resolve:(v:ArrayBuffer)=>void=()=>{};
  invoke.mockImplementation((command:string)=>command==='cancel_media_job'?Promise.resolve(true):new Promise(r=>{resolve=r;}));
  const controller=new AbortController();
  const pending=crispProcess('speech','','/s.gguf',[new Float32Array(2)],48000,controller.signal);
  controller.abort();
  resolve(stems([{name:'speech',channels:[[0,0]]}]));
  await expect(pending).rejects.toThrow();
  expect(invoke.mock.calls.some(([command])=>command==='cancel_media_job')).toBe(true);
 });

 it('limits processing to the selection hull plus context',()=>{
  expect(processingWindow([{start:500,end:600},{start:100,end:200}],1000,50)).toEqual({start:50,end:650});
  expect(processingWindow([{start:0,end:10}],20,50)).toEqual({start:0,end:20});
  expect(()=>processingWindow([],10,1)).toThrow('sourceEditor.select');
 });

 it('blends only selected samples and channels, leaving the rest bit-identical',()=>{
  const original=[new Float32Array(20).fill(.25),new Float32Array(20).fill(-.25)];
  const wet=[new Float32Array(16).fill(1)];
  const out=blendSelection(original,wet,4,[{start:6,end:14}],0,2);
  expect(out[1]).toEqual(original[1]);
  for(const i of [0,5,14,19])expect(out[0][i]).toBe(.25);
  expect(out[0][9]).toBe(1);
  expect(out[0][6]).toBeGreaterThan(.25);expect(out[0][6]).toBeLessThan(1);
  const both=blendSelection(original,wet,4,[{start:6,end:14}],-1,1);
  expect(both[1][10]).toBe(1);
  expect(()=>blendSelection(original,wet,10,[{start:6,end:14}],0,2)).toThrow('crisp.invalidResult');
 });

 it('plans interior pauses and frame-aligned cuts like the CLI',()=>{
  const pauses=planPauses([[5,6],[.5,1],[.9,2],[3,4.5]],.9);
  expect(pauses).toEqual([{start:2,end:3}]);
  expect(planPauses([[0,1],[1.5,2]],.4)).toEqual([{start:1,end:1.5}]);
  const cuts=pauseCuts([{start:2,end:3}],.2,25);
  expect(cuts[0].start).toBeCloseTo(2.12,9);expect(cuts[0].end).toBeCloseTo(2.88,9);
  expect(pauseCuts([{start:1,end:1.1}],.2)).toEqual([]);
  expect(()=>pauseCuts([{start:2,end:3},{start:2.5,end:4}],.1)).toThrow('crisp.invalidPauses');
 });

 it('tightens pauses on every lane in one immutable result and retimes markers',()=>{
  const p=project(true),before=JSON.stringify(p);
  const out=tightenPauses(p,[{start:2,end:3},{start:5,end:7}],.4);
  expect(JSON.stringify(p)).toBe(before);
  const length=(id:string)=>out.tracks.find(t=>t.id===id)!.segments.reduce((n,c)=>n+c.duration,0);
  expect(length('a')).toBeCloseTo(10-.6-1.6,6);
  expect(length('b')).toBeCloseTo(10-.6-1.6,6);
  expect(out.video!.clips!.reduce((n,c)=>n+c.duration,0)).toBeCloseTo(7.8,6);
  expect(out.markers![0].time).toBeCloseTo(8-2.2,6);
  p.tracks[1].locked=true;
  expect(()=>tightenPauses(p,[{start:2,end:3}],.4)).toThrow();
  expect(()=>tightenPauses(project(),[{start:2,end:30}],.4)).toThrow('crisp.invalidPauses');
 });

 it('derives tempo, meter and bar origin from a beat grid and names bar markers',()=>{
  const beats=Array.from({length:12},(_,i)=>({time:.5+i*.5,downbeat:i%3===0}));
  const music=musicFromBeats({tempoBpm:120,beats},undefined)!;
  expect(music).toMatchObject({tempo:120,numerator:3,denominator:4,origin:.5});
  expect(musicFromBeats({tempoBpm:0,beats},undefined)).toBeUndefined();
  // Inconsistent downbeats (as Beat This! gives on a synthetic click): tempo only.
  const noisy=[1,1,0,1,1,1,0,1,1,1,0,1].map((d,i)=>({time:.02+i*.5,downbeat:d===1}));
  expect(downbeatMeter({tempoBpm:120,beats:noisy})).toBeUndefined();
  expect(musicFromBeats({tempoBpm:120,beats:noisy},{...DEFAULT_MUSIC,numerator:3})).toMatchObject({tempo:120,numerator:3,origin:.02});
  expect(downbeatMeter({tempoBpm:120,beats})).toEqual({numerator:3,origin:.5});
  const markers=beatMarkers({tempoBpm:120,beats},10,true,bar=>`Bar ${bar}`);
  expect(markers.map(m=>m.name)).toEqual(['Bar 1','Bar 2','Bar 3','Bar 4']);
  expect(markers[1].time).toBeCloseTo(12,9);
  expect(()=>beatMarkers({tempoBpm:1,beats:[{time:2,downbeat:true},{time:1,downbeat:true}]},0,true,String)).toThrow('crisp.invalidResult');
 });
});
