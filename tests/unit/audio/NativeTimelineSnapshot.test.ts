import {beforeEach,it,expect,vi} from 'vitest';
import {NativeTimelineSnapshot} from '../../../src/audio/plugins/NativeTimelineSnapshot';
import {DEFAULT_MUSIC} from '../../../src/lib/musicalTime';
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

it('sends master and clip base values and curves with original scope and rack indices',async()=>{
 const f=fixture(),snapshot=await NativeTimelineSnapshot.create(f.p,f.sources);invoke.mockImplementation(async(cmd:string)=>cmd==='native_playback_start'?'session':cmd==='native_playback_update'?1:undefined);const playback=await snapshot.startPlayback({startFrame:0,endFrame:48000});
 const effect={type:'ringmod' as const,enabled:true,params:{freq:731,mix:.4},automation:{freq:[{time:0,value:200}]}};
 const project={...f.p,masterEffects:[effect],tracks:f.p.tracks.map(track=>({...track,segments:track.segments.map(clip=>({...clip,effects:[{...effect,enabled:false},effect]}))}))};await playback.update(project);
 const controls=(index:number)=>[{index,parameter:'mix',value:.4,points:null},{index,parameter:'freq',value:731,points:[{time:0,value:200}]}];
 expect(invoke).toHaveBeenCalledWith('native_playback_update',expect.objectContaining({controls:expect.objectContaining({effectScopes:[{scope:'master',controls:controls(0)},{scope:'clip:c',controls:controls(1)}]})}));await snapshot.close();
});

it('sends saved native parameter curves and explicit Read restoration by stable instance',async()=>{
 const f=fixture(),snapshot=await NativeTimelineSnapshot.create(f.p,f.sources);invoke.mockImplementation(async(cmd:string)=>cmd==='native_playback_start'?'session':cmd==='native_playback_update'?1:undefined);const playback=await snapshot.startPlayback({startFrame:0,endFrame:48000});
 const effect={instanceId:'fx',pluginId:'au:test',name:'Gain',format:'AU' as const,enabled:true,bypass:false,state:'opaque',parameters:{gain:-6},parameterAutomation:{gain:{min:-24,max:12,points:[{time:0,value:.5}]}}};
 await playback.update({...f.p,nativeEffects:[effect]});expect(invoke).toHaveBeenLastCalledWith('native_playback_update',expect.objectContaining({controls:expect.objectContaining({native:[{scope:'master',instanceId:'fx',parameters:{gain:-6},bypass:false,parameterAutomation:effect.parameterAutomation}]})}));
 await playback.update({...f.p,nativeEffects:[{...effect,parameterAutomation:undefined}]});expect(invoke).toHaveBeenLastCalledWith('native_playback_update',expect.objectContaining({controls:expect.objectContaining({native:[expect.objectContaining({parameterAutomation:null})]})}));await snapshot.close();
});

it('sends monitor-only music settings on live updates and explicitly clears missing settings',async()=>{
 const f=fixture(),snapshot=await NativeTimelineSnapshot.create({...f.p,music:{...DEFAULT_MUSIC,metronome:true}},f.sources);
 expect(invoke).toHaveBeenCalledWith('native_snapshot_begin',expect.objectContaining({project:expect.objectContaining({music:expect.objectContaining({metronome:true})})}));
 invoke.mockImplementation(async(cmd:string)=>cmd==='native_playback_start'?'session':1);
 const playback=await snapshot.startPlayback({startFrame:0,endFrame:48000});
 await playback.update({...f.p,music:{...DEFAULT_MUSIC,metronome:true,clickLevel:.7}});
 expect(invoke).toHaveBeenLastCalledWith('native_playback_update',expect.objectContaining({controls:expect.objectContaining({music:{...DEFAULT_MUSIC,metronome:true,clickLevel:.7}})}));
 await playback.update({...f.p,music:undefined});
 expect(invoke).toHaveBeenLastCalledWith('native_playback_update',expect.objectContaining({controls:expect.objectContaining({music:null})}));await snapshot.close();
});
