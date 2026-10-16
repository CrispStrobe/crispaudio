import {beforeEach,it,expect,vi} from 'vitest';
import {NativeTimelineSnapshot} from '../../../src/audio/plugins/NativeTimelineSnapshot';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {AudioSource} from '../../../src/types/audio';
const {invoke}=vi.hoisted(()=>({invoke:vi.fn()}));vi.mock('@tauri-apps/api/core',()=>({invoke}));
function fixture(){const left=new Float32Array(8193),right=new Float32Array(8193);left[8192]=0.75;right[8192]=-0.625;const buffer={length:8193,sampleRate:48000,numberOfChannels:2,getChannelData:(ch:number)=>[left,right][ch]} as AudioBuffer;const p={...useProjectStore.getInitialState().project,duration:1,sampleRate:48000,tracks:[{id:'t',name:'Track',volume:1,pan:0,muted:false,solo:false,segments:[{id:'c',trackId:'t',sourceId:'s',startTime:0,sourceOffset:0,duration:0.1,gain:1,effects:[],name:'Clip',color:'#fff',fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear' as const,fadeOutCurve:'linear' as const}]}]};return {p,left,right,sources:new Map([['s',{id:'s',buffer} as AudioSource]])};}
beforeEach(()=>{invoke.mockReset();invoke.mockImplementation(async(cmd:string)=>cmd==='native_snapshot_begin'?'snapshot':undefined);});
it('freezes parameters and PCM before async upload, using ordered bounded binary chunks',async()=>{
 const f=fixture();let sentProject:unknown;invoke.mockImplementation(async(cmd:string,args:unknown)=>{if(cmd==='native_snapshot_begin'){sentProject=(args as {project:unknown}).project;f.p.masterVolume=0;f.left.fill(0);f.right.fill(0);return 'snapshot';}});
 const snapshot=await NativeTimelineSnapshot.create(f.p,f.sources);expect((sentProject as typeof f.p).masterVolume).not.toBe(0);const packets=invoke.mock.calls.filter(c=>c[0]==='native_snapshot_write').map(c=>c[1] as ArrayBuffer);expect(packets).toHaveLength(2);const last=new DataView(packets[1]),offset=8+last.getUint32(4,true);expect(last.getFloat32(offset,true)).toBe(0.75);expect(last.getFloat32(offset+4,true)).toBe(-0.625);await snapshot.close();await snapshot.close();expect(invoke.mock.calls.filter(c=>c[0]==='native_snapshot_close')).toHaveLength(1);
});
it('closes a late begin reply after caller cancellation without sending PCM',async()=>{
 const f=fixture(),controller=new AbortController();let release!:(id:string)=>void;invoke.mockImplementation((cmd:string)=>cmd==='native_snapshot_begin'?new Promise(resolve=>{release=resolve;}):Promise.resolve());const task=NativeTimelineSnapshot.create(f.p,f.sources,{signal:controller.signal}),failure=expect(task).rejects.toMatchObject({name:'AbortError'});controller.abort();release('late');await failure;expect(invoke).toHaveBeenCalledWith('native_snapshot_close',{snapshot:'late'});expect(invoke.mock.calls.some(c=>c[0]==='native_snapshot_write')).toBe(false);
});
it('rejects a superseded upload and closes its native reservation',async()=>{
 const f=fixture();let current=true;invoke.mockImplementation(async(cmd:string)=>{if(cmd==='native_snapshot_begin')return 'snapshot';if(cmd==='native_snapshot_write')current=false;});await expect(NativeTimelineSnapshot.create(f.p,f.sources,{isCurrent:()=>current})).rejects.toMatchObject({name:'AbortError'});expect(invoke).toHaveBeenCalledWith('native_snapshot_close',{snapshot:'snapshot'});expect(invoke.mock.calls.some(c=>c[0]==='native_snapshot_seal')).toBe(false);
});
it('guards stale playback and waits for cancellation cleanup when closing an active capture',async()=>{
 const f=fixture();let current=true;const snapshot=await NativeTimelineSnapshot.create(f.p,f.sources,{isCurrent:()=>current});current=false;await expect(snapshot.captureRange(0,48000)).rejects.toMatchObject({name:'AbortError'});expect(invoke.mock.calls.some(c=>c[0]==='native_snapshot_capture')).toBe(false);
 const next=await NativeTimelineSnapshot.create(f.p,f.sources);let release!:(r:unknown)=>void;invoke.mockImplementation((cmd:string)=>cmd==='native_snapshot_capture'?new Promise(resolve=>{release=resolve;}):Promise.resolve());const capture=next.captureRange(0,48000);await expect(next.captureRange(0,48000)).rejects.toThrow('already active');let closed=false;const closing=next.close().then(()=>{closed=true;});await Promise.resolve();expect(closed).toBe(false);release({cancelled:true});await capture;await closing;expect(closed).toBe(true);
});

it('closes a late native playback start and waits for its session cleanup',async()=>{
 const f=fixture(),snapshot=await NativeTimelineSnapshot.create(f.p,f.sources);let release!:(id:string)=>void;
 invoke.mockImplementation((cmd:string)=>cmd==='native_playback_start'?new Promise(resolve=>{release=resolve;}):Promise.resolve());
 const task=snapshot.startPlayback({startFrame:0,endFrame:48000,muted:true}),failure=expect(task).rejects.toMatchObject({name:'AbortError'});
 let done=false;const closing=snapshot.close().then(()=>{done=true;});await Promise.resolve();expect(done).toBe(false);
 release('late-session');await failure;await closing;expect(invoke).toHaveBeenCalledWith('native_playback_close',{session:'late-session'});expect(done).toBe(true);
});
it('owns one playback session, sends explicit live controls and closes it once',async()=>{
 const f=fixture(),snapshot=await NativeTimelineSnapshot.create(f.p,f.sources);
 invoke.mockImplementation(async(cmd:string)=>cmd==='native_playback_start'?'session':cmd==='native_playback_update'?1:undefined);
 const playback=await snapshot.startPlayback({startFrame:0,endFrame:48000,muted:true});
 await expect(snapshot.captureRange(0,48000)).rejects.toThrow(/active/);await expect(snapshot.startPlayback({startFrame:0,endFrame:48000})).rejects.toThrow(/active/);
 expect(await playback.update({...f.p,masterVolume:.25})).toBe(1);
 expect(invoke).toHaveBeenCalledWith('native_playback_update',expect.objectContaining({controls:expect.objectContaining({masterVolume:.25,tracks:[expect.objectContaining({id:'t',volume:1,sends:[]})]})}));
 await snapshot.close();await playback.close();expect(invoke.mock.calls.filter(c=>c[0]==='native_playback_close')).toHaveLength(1);await expect(playback.status()).rejects.toMatchObject({name:'AbortError'});
});

it('sends wet/dry curves with original rack indices, excluding disabled and unsupported effects',async()=>{
 const f=fixture(),snapshot=await NativeTimelineSnapshot.create(f.p,f.sources);
 invoke.mockImplementation(async(cmd:string)=>cmd==='native_playback_start'?'session':cmd==='native_playback_update'?1:undefined);
 const playback=await snapshot.startPlayback({startFrame:0,endFrame:48000});
 const project={...f.p,tracks:f.p.tracks.map(track=>({...track,effects:[{type:'delay' as const,enabled:false,params:{mix:.1}},{type:'reverb' as const,enabled:true,params:{mix:.3},automation:{mix:[{time:0,value:.2},{time:1,value:.7}]}},{type:'lowpass' as const,enabled:true,params:{frequency:1000}},{type:'chorus' as const,enabled:true,params:{mix:.4}}]}))};
 await playback.update(project);
 expect(invoke).toHaveBeenCalledWith('native_playback_update',expect.objectContaining({controls:expect.objectContaining({tracks:[expect.objectContaining({effectAutomation:[{index:1,parameter:'mix',value:.3,points:[{time:0,value:.2},{time:1,value:.7}]},{index:3,parameter:'mix',value:.4,points:null},{index:3,parameter:'depth',value:.5,points:null},{index:3,parameter:'rate',value:1.5,points:null}]})]})}));await snapshot.close();
});
