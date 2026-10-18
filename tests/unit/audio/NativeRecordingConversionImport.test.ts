import {beforeEach,expect,it,vi} from 'vitest';
import {importRecoveredTakes} from '../../../src/audio/plugins/NativeRecordingConversionImport';
import type {RecoveryReview} from '../../../src/audio/plugins/NativeRecordingRecovery';
import type {AudioSource} from '../../../src/types/audio';
import {useProjectStore} from '../../../src/stores/projectStore';
const mocks=vi.hoisted(()=>({invoke:vi.fn(),encode:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.invoke}));
vi.mock('../../../src/lib/wavExport',()=>({encodeAudioBufferWav:mocks.encode}));
let paths:Set<string>,events:string[],written:number;
function review(rate=44100):RecoveryReview{
 const snapshot=useProjectStore.getState().project;
 const loaded=new Map(['a','b'].map(id=>{const path=`/managed/native-group-fixture/recovered-v1/native-take-${id}/take.wav`;return [id,{id:`source-${id}`,name:'Recovered',sampleRate:rate,channels:1,duration:.1,buffer:{sampleRate:rate,length:rate/10,duration:.1,numberOfChannels:1,getChannelData:()=>new Float32Array(rate/10)} as AudioBuffer,peaks:new Float32Array(10),...(rate===48000?{filePath:path}:{provenance:{path,offset:0,rate:1}})} satisfies AudioSource] as const;}));
 return {snapshot,loaded,candidate:{kind:'interrupted',group:'native-group-fixture',projectId:snapshot.id,importId:'boot/run',tracks:['a','b'],outputEndFrame:8192,recovered:false},result:{phase:'recovered',incomplete:true,group:'native-group-fixture',directory:'/managed/native-group-fixture/recovered-v1',reasons:[],manifest:{version:2,clips:['a','b'].map(track_id=>({track_id,audio:`native-take-${track_id}/take.wav`,info:{frames:4800,sample_rate:48000,channels:1}})),timing:{version:1,intent:{context:{scope:'boot/run'},projectId:snapshot.id,corrections:{a:{frames:0,basis:'unqualified'},b:{frames:0,basis:'unqualified'}}},placements:['a','b'].map(trackId=>({trackId,pass:0,projectStartFrame:0,sourceOffsetFrames:0,frames:4800}))}}}};
}
async function backend(command:string,args?:unknown){
 events.push(command);
 if(command==='recording_conversion_write'){const path=`/owned/source-${written++}.wav`;paths.add(path);return path;}
 if(command==='recording_conversion_finish'&&!(args as {keep:boolean}).keep)paths.clear();
}
const current=()=>useProjectStore.getState();
const publish=(next:Parameters<typeof useProjectStore.setState>[0])=>{events.push('publish');useProjectStore.setState(next);};
beforeEach(()=>{
 vi.clearAllMocks();paths=new Set();events=[];written=0;mocks.invoke.mockImplementation(backend);mocks.encode.mockResolvedValue({arrayBuffer:async()=>new ArrayBuffer(64)});
 const base=useProjectStore.getInitialState().project;useProjectStore.getState().loadProjectState({...base,id:'converted-import',sampleRate:44100,tracks:['a','b'].map(id=>({id,name:id,segments:[],recordArmed:true,volume:1,pan:0,muted:false,solo:false}))},new Map());useProjectStore.setState({isPlaying:false});useProjectStore.temporal.getState().clear();
});
it('protects all conversions before one publication and keeps files through Undo/Redo',async()=>{
 const original=current().project,checked=review();await importRecoveredTakes(checked,current,publish,'Recovered',0,new AbortController().signal);
 expect(events).toEqual(['recording_conversion_begin','recording_conversion_write','recording_conversion_write','recording_conversion_protect','publish','recording_conversion_finish']);
 expect(paths.size).toBe(2);expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:true});expect([...checked.loaded.values()].every(s=>!s.filePath)).toBe(true);
 expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);useProjectStore.temporal.getState().undo();expect(current().project).toBe(original);expect(paths.size).toBe(2);useProjectStore.temporal.getState().redo();expect(current().project.nativeRecordingImports).toEqual(['boot/run']);expect(paths.size).toBe(2);
});
it('rolls back late writes after cancellation, then retries without a partial editor transaction',async()=>{
 const checked=review(),original=current().project,controller=new AbortController();let release!:(path:string)=>void;
 mocks.invoke.mockImplementation((command,args)=>command==='recording_conversion_write'?new Promise<string>(resolve=>{release=resolve;paths.add('/owned/late.wav');}):backend(command,args));
 const pending=importRecoveredTakes(checked,current,publish,'Recovered',0,controller.signal);await vi.waitFor(()=>expect(release).toBeTypeOf('function'));controller.abort();release('/owned/late.wav');await expect(pending).rejects.toMatchObject({name:'AbortError'});
 expect(paths.size).toBe(0);expect(events).not.toContain('publish');expect(current().project).toBe(original);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:false});
 mocks.invoke.mockImplementation(backend);await importRecoveredTakes(checked,current,publish,'Recovered',0,new AbortController().signal);expect(paths.size).toBe(2);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
});
it('rolls back every earlier file when a later conversion or write fails',async()=>{
 for(const failure of ['encode','write']){
  const checked=review(),original=current().project;paths.clear();events=[];
  mocks.encode.mockReset().mockResolvedValue({arrayBuffer:async()=>new ArrayBuffer(64)});mocks.invoke.mockImplementation(backend);
  if(failure==='encode')mocks.encode.mockResolvedValueOnce({arrayBuffer:async()=>new ArrayBuffer(64)}).mockRejectedValueOnce(new Error('encode failed'));
  else mocks.invoke.mockImplementation((command,args)=>command==='recording_conversion_write'&&paths.size===1?Promise.reject(new Error('write failed')):backend(command,args));
  await expect(importRecoveredTakes(checked,current,publish,'Recovered',0,new AbortController().signal)).rejects.toThrow(`${failure} failed`);
  expect(paths.size).toBe(0);expect(current().project).toBe(original);expect(events).not.toContain('publish');expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
 }
});
it('rolls back protected files if project or playback changes before publication',async()=>{
 for(const change of ['project','playback']){
  const checked=review(),original=current().project;let stale=false;events=[];
  mocks.invoke.mockImplementation(async(command,args)=>{const result=await backend(command,args);if(command==='recording_conversion_protect')stale=true;return result;});
  const state=()=>({...current(),...(stale?(change==='project'?{project:{...original}}:{isPlaying:true}):{})});
  await expect(importRecoveredTakes(checked,state,publish,'Recovered',0,new AbortController().signal)).rejects.toThrow(change==='project'?'projectChanged':'recoveryStopPlayback');
  expect(paths.size).toBe(0);expect(current().project).toBe(original);expect(events).not.toContain('publish');
 }
});
it('aborts on begin/protect errors and cleans preparation rejected by the take adapter',async()=>{
 for(const failure of ['recording_conversion_begin','recording_conversion_protect','locked']){
  const checked=review();if(failure==='locked'){useProjectStore.setState({project:{...current().project,tracks:current().project.tracks.map(t=>({...t,locked:true}))}});checked.snapshot=current().project;}
  const original=current().project;events=[];
  mocks.invoke.mockImplementation((command,args)=>command===failure?Promise.reject(new Error('IPC failed')):backend(command,args));
  await expect(importRecoveredTakes(checked,current,publish,'Recovered',0,new AbortController().signal)).rejects.toThrow(failure==='locked'?'locked':'IPC failed');
  expect(paths.size).toBe(0);expect(current().project).toBe(original);expect(events).not.toContain('publish');expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:false});
 }
});
it('retains files when a synchronous subscriber throws after the editor has published',async()=>{
 const checked=review();await expect(importRecoveredTakes(checked,current,next=>{publish(next);throw new Error('subscriber failed');},'Recovered',0,new AbortController().signal)).rejects.toThrow('subscriber failed');
 expect(paths.size).toBe(2);expect(current().project.nativeRecordingImports).toEqual(['boot/run']);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:true});
});
it('keeps a successful publication when final acknowledgement is lost',async()=>{
 const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});mocks.invoke.mockImplementation((command,args)=>command==='recording_conversion_finish'?Promise.reject(new Error('connection lost')):backend(command,args));
 try{await importRecoveredTakes(review(),current,publish,'Recovered',0,new AbortController().signal);expect(paths.size).toBe(2);expect(current().project.nativeRecordingImports).toEqual(['boot/run']);expect(warning).toHaveBeenCalled();}finally{warning.mockRestore();}
});
it('imports original-rate takes without a conversion transaction and refuses stale work before encoding',async()=>{
 await importRecoveredTakes(review(48000),current,publish,'Recovered',0,new AbortController().signal);expect(mocks.invoke).not.toHaveBeenCalled();expect(mocks.encode).not.toHaveBeenCalled();
 const checked=review();await expect(importRecoveredTakes(checked,()=>({...current(),project:{...checked.snapshot}}),publish,'Recovered',0,new AbortController().signal)).rejects.toThrow('projectChanged');expect(mocks.invoke).not.toHaveBeenCalled();
});
