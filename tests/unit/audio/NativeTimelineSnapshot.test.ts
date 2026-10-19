import {beforeEach,afterEach,it,expect,vi} from 'vitest';
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

const recordingOptions={device:'output-uid',projectStartFrame:0,recordStartFrame:0,cycle:false,leadFrames:0,countInFrames:0,maxFrames:480000,inputs:[{trackId:'t',device:'input-uid',channels:[0],monitorFx:false,correction:{frames:0,basis:'unqualified' as const}}]};
it('owns one native recording, routes sparse controls and cancels before releasing its snapshot',async()=>{
 const f=fixture(),snapshot=await NativeTimelineSnapshot.create(f.p,f.sources);
 invoke.mockImplementation(async(cmd:string)=>cmd==='native_recording_start'?'recording':cmd==='native_recording_status'?{phase:'recording',frame:4800}:cmd==='native_recording_close'?{phase:'fault',directory:'recordings/native-group-generated',error:'cancelled'}:undefined);
 const recording=await snapshot.startRecording(recordingOptions);
 expect(invoke).toHaveBeenCalledWith('native_recording_start',{snapshot:'snapshot',options:recordingOptions});
 await expect(snapshot.captureRange(0,48000)).rejects.toThrow(/active/);await expect(snapshot.startPlayback({startFrame:0,endFrame:48000})).rejects.toThrow(/active/);await expect(snapshot.startRecording(recordingOptions)).rejects.toThrow(/active/);
 expect(await recording.status()).toMatchObject({phase:'recording',frame:4800});await recording.cue('t',{gain:.5,pan:-.2,mono:true});
 expect(invoke).toHaveBeenCalledWith('native_recording_cue',{session:'recording',track:'t',controls:{gain:.5,pan:-.2,mono:true}});
 const before=invoke.mock.calls.length;await expect(recording.cue('t',{gain:NaN,pan:0,mono:false})).rejects.toThrow('Invalid native cue controls');expect(invoke.mock.calls).toHaveLength(before);
 await snapshot.close();await recording.close();expect(invoke.mock.calls.filter(call=>call[0]==='native_recording_close')).toHaveLength(1);expect(invoke).toHaveBeenCalledWith('native_recording_close',{session:'recording',cancel:true});await expect(recording.status()).rejects.toMatchObject({name:'AbortError'});
});
it('waits for a late recording start and cancels it after snapshot closure',async()=>{
 const f=fixture(),snapshot=await NativeTimelineSnapshot.create(f.p,f.sources);let release!:(id:string)=>void;
 invoke.mockImplementation((cmd:string)=>cmd==='native_recording_start'?new Promise(resolve=>{release=resolve;}):Promise.resolve());
 const task=snapshot.startRecording(recordingOptions),failure=expect(task).rejects.toMatchObject({name:'AbortError'});
 let finished=false;const closing=snapshot.close().then(()=>{finished=true;});await Promise.resolve();expect(finished).toBe(false);
 release('late-recording');await failure;await closing;expect(invoke).toHaveBeenCalledWith('native_recording_close',{session:'late-recording',cancel:true});expect(finished).toBe(true);
});
it('returns a stopped recording result once and permits another transport afterwards',async()=>{
 const f=fixture(),snapshot=await NativeTimelineSnapshot.create(f.p,f.sources),result={phase:'complete',directory:'recordings/native-group-generated',manifest:{version:2}};
 invoke.mockImplementation(async(cmd:string)=>cmd==='native_recording_start'?'recording':cmd==='native_recording_close'?result:cmd==='native_playback_start'?'playback':undefined);
 const recording=await snapshot.startRecording(recordingOptions),first=recording.close();expect(recording.close()).toBe(first);expect(await first).toEqual(result);
 expect(invoke).toHaveBeenCalledWith('native_recording_close',{session:'recording',cancel:false});await expect(recording.cue('t',{gain:1,pan:0,mono:false})).rejects.toMatchObject({name:'AbortError'});
 const playback=await snapshot.startPlayback({startFrame:0,endFrame:48000});await playback.close();await snapshot.close();
});
it('still joins an owned recording when snapshot registry close fails',async()=>{
 const f=fixture(),snapshot=await NativeTimelineSnapshot.create(f.p,f.sources);
 invoke.mockImplementation(async(cmd:string)=>{if(cmd==='native_recording_start')return 'recording';if(cmd==='native_snapshot_close')throw new Error('registry unavailable');});
 await snapshot.startRecording(recordingOptions);await expect(snapshot.close()).rejects.toThrow('registry unavailable');
 expect(invoke).toHaveBeenCalledWith('native_recording_close',{session:'recording',cancel:true});
});
it('sends validated monitor attenuation and rejects controls after recording close',async()=>{
 const f=fixture(),snapshot=await NativeTimelineSnapshot.create(f.p,f.sources);invoke.mockImplementation(async(cmd:string)=>cmd==='native_recording_start'?'recording':undefined);
 const recording=await snapshot.startRecording({...recordingOptions,monitorMix:{backing:.5,output:0}});await recording.mix({backing:.25,output:.75});expect(invoke).toHaveBeenCalledWith('native_recording_mix',{session:'recording',levels:{backing:.25,output:.75}});
 const before=invoke.mock.calls.length;await expect(recording.mix({backing:-1,output:1})).rejects.toThrow('Invalid native monitor levels');await expect(recording.mix({backing:1,output:Infinity})).rejects.toThrow('Invalid native monitor levels');expect(invoke.mock.calls).toHaveLength(before);
 await recording.close();await expect(recording.mix({backing:1,output:1})).rejects.toMatchObject({name:'AbortError'});await snapshot.close();
});


// A deferred converter verifies ownership at the additional pre-IPC await.
afterEach(()=>vi.unstubAllGlobals());
it.each(['abort','supersede','failure'] as const)('rejects %s during 44.1-kHz conversion before native admission',async action=>{
 const f=fixture(),source=f.sources.get('s')!;Object.assign(source.buffer,{sampleRate:44100});
 const controller=new AbortController();let current=true,resolve!:(value:unknown)=>void,reject!:(error:Error)=>void;
 const rendered=new Promise((done,fail)=>{resolve=done;reject=fail;});
 vi.stubGlobal('OfflineAudioContext',class {
  destination={};createBuffer(){return {copyToChannel:vi.fn()};}createBufferSource(){return {connect:vi.fn(),start:vi.fn()};}startRendering(){return rendered;}
 });
 const pending=NativeTimelineSnapshot.create(f.p,f.sources,{signal:controller.signal,isCurrent:()=>current}),failure=action==='failure'?expect(pending).rejects.toThrow('converter failed'):expect(pending).rejects.toMatchObject({name:'AbortError'});
 if(action==='abort')controller.abort();else if(action==='supersede')current=false;
 if(action==='failure')reject(new Error('converter failed'));else resolve({getChannelData:()=>new Float32Array(Math.ceil(8193*48000/44100)+2)});
 await failure;expect(invoke).not.toHaveBeenCalled();
});
