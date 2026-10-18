import {beforeEach,expect,it,vi} from 'vitest';
import {NativeRecordingRecovery as recovery,type RecoveryCandidate,type RecoveryResult} from '../../../src/audio/plugins/NativeRecordingRecovery';
import {useProjectStore} from '../../../src/stores/projectStore';
import {serializeProject,deserializeProject} from '../../../src/lib/projectFile';
import type {NativeRecordingManifest} from '../../../src/lib/nativeRecordingTakes';
const mocks=vi.hoisted(()=>({invoke:vi.fn(),readFile:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.invoke}));
vi.mock('@tauri-apps/plugin-fs',()=>({readFile:mocks.readFile}));
function buffer():AudioBuffer{return {sampleRate:48000,length:4800,duration:.1,numberOfChannels:1,getChannelData:()=>new Float32Array(4800)}as AudioBuffer;}
function candidate(kind:'complete'|'interrupted'='interrupted'):RecoveryCandidate{return {kind,importId:'boot/run-one',group:'native-group-fixture',projectId:'recovery-project',tracks:['a','b'],outputEndFrame:8192,recovered:false};}
function manifest():NativeRecordingManifest{return {version:2,clips:['a','b'].map(track_id=>({track_id,audio:`native-take-${track_id}/take.wav`,info:{frames:4800,sample_rate:48000,channels:1}})),timing:{version:1,intent:{context:{scope:'boot/run-one'},projectId:'recovery-project',corrections:{a:{frames:0,basis:'unqualified'},b:{frames:0,basis:'unqualified'}}},placements:['a','b'].map(trackId=>({trackId,pass:0,projectStartFrame:24000,sourceOffsetFrames:1200,frames:2400}))}};}
function result(kind:'complete'|'interrupted'='interrupted'):RecoveryResult{return {group:'native-group-fixture',phase:kind==='complete'?'complete':'recovered',incomplete:kind==='interrupted',directory:'/managed/native-group-fixture'+(kind==='interrupted'?'/recovered-v1':''),manifest:manifest(),reasons:[]};}
const context={decodeAudioData:vi.fn(async()=>buffer())}as unknown as BaseAudioContext;
beforeEach(()=>{vi.clearAllMocks();const base=useProjectStore.getInitialState().project;useProjectStore.getState().loadProjectState({...base,sampleRate:48000,id:'recovery-project',tracks:['a','b'].map(id=>({id,name:id,segments:[],recordArmed:true,volume:1,pan:0,muted:false,solo:false}))},new Map());useProjectStore.temporal.getState().clear();mocks.readFile.mockResolvedValue(new Uint8Array(64));mocks.invoke.mockImplementation(async(command)=>command==='native_recording_discover'?{candidates:[candidate()],scanned:1,rejected:0,truncated:false}:result());});
it('reviews every file without editor changes, imports one incomplete group with one Undo and portable receipt',async()=>{
 const original=useProjectStore.getState().project;
 const review=await recovery.review(candidate(),original,context,'Recovered',new AbortController().signal);
 expect(mocks.readFile).toHaveBeenCalledTimes(2);expect(useProjectStore.getState().project).toBe(original);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
 const next=recovery.insert(review,original,new Map(),'Recovered · incomplete',0);useProjectStore.setState(next);
 expect(next.project.nativeRecordingImports).toEqual(['boot/run-one']);expect(next.project.tracks[0].takes![0]).toMatchObject({startTime:.5,sourceOffset:.025,duration:.05,notes:['Recovered incomplete recording']});expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
 expect(()=>recovery.insert(review,next.project,next.sources,'Recovered',0)).toThrow('recoveryAlreadyImported');
 const saved=serializeProject(next.project,next.sources,'portable'),reopened=await deserializeProject(saved,context);expect(reopened.project.nativeRecordingImports).toEqual(['boot/run-one']);await expect(recovery.review(candidate(),reopened.project,context,'Recovered',new AbortController().signal)).rejects.toThrow('recoveryAlreadyImported');
 useProjectStore.temporal.getState().undo();expect(useProjectStore.getState().project).toBe(original);expect(useProjectStore.getState().project.nativeRecordingImports).toBeUndefined();
 const retry=await recovery.review(candidate(),original,context,'Recovered',new AbortController().signal);expect(()=>recovery.insert(retry,original,useProjectStore.getState().sources,'Recovered',0)).not.toThrow();
 useProjectStore.temporal.getState().redo();expect(useProjectStore.getState().project.nativeRecordingImports).toEqual(['boot/run-one']);
});
it('reconciles complete recordings through the same loading/Undo adapter without incomplete notes',async()=>{
 mocks.invoke.mockResolvedValue(result('complete'));const state=useProjectStore.getState();const review=await recovery.review(candidate('complete'),state.project,context,'Recorded',new AbortController().signal);const next=recovery.insert(review,state.project,state.sources,'Take',0);expect(next.project.tracks[0].takes![0].notes).toEqual([]);expect(next.project.nativeRecordingImports).toEqual(['boot/run-one']);
});
it('refuses stale or locked projects and never partially imports when any WAV fails',async()=>{
 const state=useProjectStore.getState();mocks.readFile.mockResolvedValueOnce(new Uint8Array(64)).mockRejectedValueOnce(new Error('missing WAV'));await expect(recovery.review(candidate(),state.project,context,'Recovered',new AbortController().signal)).rejects.toThrow('missing WAV');expect(useProjectStore.getState().project).toBe(state.project);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
 const review=await recovery.review(candidate(),state.project,context,'Recovered',new AbortController().signal);expect(()=>recovery.insert(review,{...state.project},state.sources,'Recovered',0)).toThrow('projectChanged');
 const locked={...state.project,tracks:state.project.tracks.map(t=>({...t,locked:true}))};const lockedReview={...review,snapshot:locked};expect(()=>recovery.insert(lockedReview,locked,state.sources,'Recovered',0)).toThrow('locked');expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
});
it('rejects unmanaged IDs, foreign projects, identity/phase mismatches and late cancelled review',async()=>{
 const p=useProjectStore.getState().project;
 await expect(recovery.review({...candidate(),group:'../outside'},p,context,'Recovered',new AbortController().signal)).rejects.toThrow('timingInvalid');
 await expect(recovery.review({...candidate(),projectId:'other'},p,context,'Recovered',new AbortController().signal)).rejects.toThrow('projectChanged');expect(mocks.invoke).not.toHaveBeenCalled();
 for(const patch of [{incomplete:false},{group:'native-group-other'},{phase:'complete'},{manifest:{...manifest(),timing:{...manifest().timing!,intent:{...manifest().timing!.intent,context:{scope:'another-run'}}}}}]){mocks.invoke.mockResolvedValue({...result(),...patch});await expect(recovery.review(candidate(),p,context,'Recovered',new AbortController().signal)).rejects.toThrow('timingInvalid');}
 let resolve!:(v:RecoveryResult)=>void;mocks.invoke.mockReturnValue(new Promise<RecoveryResult>(r=>{resolve=r;}));const controller=new AbortController();const pending=recovery.review(candidate(),p,context,'Recovered',controller.signal);controller.abort();resolve(result());await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(mocks.readFile).not.toHaveBeenCalled();
});
it('validates discovery bounds and rejects malformed portable import receipts',async()=>{
 expect((await recovery.discover()).candidates[0].group).toBe('native-group-fixture');mocks.invoke.mockResolvedValue({candidates:[{...candidate(),group:'/outside'}],scanned:1,rejected:0,truncated:false});await expect(recovery.discover()).rejects.toThrow('timingInvalid');
 const state=useProjectStore.getState();const json=JSON.parse(serializeProject(state.project,state.sources));for(const receipt of [['duplicate','duplicate'],['bad\u0000'],42,Array(4097).fill('x')]){json.project.nativeRecordingImports=receipt;await expect(deserializeProject(JSON.stringify(json),context)).rejects.toThrow('import receipts');}
});

it('rejects oversized rate conversion before reading audio into memory',async()=>{
 const original=useProjectStore.getState().project,p={...original,sampleRate:192000};const large=result();large.manifest.clips=large.manifest.clips.map(c=>({...c,info:{...c.info,frames:16000000,channels:2}}));mocks.invoke.mockResolvedValue(large);
 await expect(recovery.review(candidate(),p,context,'Recovered',new AbortController().signal)).rejects.toThrow('recoveryBudget');expect(mocks.readFile).not.toHaveBeenCalled();expect(useProjectStore.getState().project).toBe(original);
});
