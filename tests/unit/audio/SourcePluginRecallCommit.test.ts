import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {commitSourcePluginRecall} from '../../../src/audio/plugins/SourcePluginRecallCommit';
import {prepareSourcePluginRecall,sourcePluginRecallPlan} from '../../../src/lib/sourcePluginRecall';
import {recallFixture,RecallBuffer} from '../../fixtures/sourcePluginRecall';
import {useProjectStore} from '../../../src/stores/projectStore';
const mocks=vi.hoisted(()=>({invoke:vi.fn(),encode:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.invoke}));
vi.mock('../../../src/lib/wavExport',()=>({encodeSourceBufferWav:mocks.encode}));
let files:Set<string>,events:string[];
const current=()=>useProjectStore.getState();
const publish=(next:Parameters<typeof useProjectStore.setState>[0])=>{events.push('publish');useProjectStore.setState(next);};
const prepared=()=>{const plan=sourcePluginRecallPlan(current(),'clip');return {plan,preview:prepareSourcePluginRecall(plan,plan.input.channels.map(c=>Float32Array.from(c,v=>v*.25)),{...plan.recipe,parameters:{gain:.25}})};};
async function backend(command:string,args?:unknown){events.push(command);if(command==='recording_conversion_write'){files.add('/owned/derived.wav');return '/owned/derived.wav';}if(command==='recording_conversion_finish'&&!(args as {keep:boolean}).keep)files.clear();}
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('AudioBuffer',RecallBuffer);Object.assign(window,{__TAURI_INTERNALS__:{}});useProjectStore.setState(recallFixture().state);useProjectStore.temporal.getState().clear();files=new Set();events=[];mocks.invoke.mockImplementation(backend);mocks.encode.mockResolvedValue({arrayBuffer:async()=>new ArrayBuffer(64)});});
afterEach(()=>{delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;vi.unstubAllGlobals();});
it('protects and retains exactly one derived file around a single Undo/Redo publication',async()=>{
 const {plan,preview}=prepared(),before=current().project;await commitSourcePluginRecall(plan,preview,current,publish,new AbortController().signal);const applied=current().project,id=applied.tracks[0].segments[0].sourceId;expect(id).not.toBe('edited');expect(files.size).toBe(1);expect(events.indexOf('recording_conversion_protect')).toBeLessThan(events.indexOf('publish'));expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:true});expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);expect(current().sources.get(id)!.buffer.length).toBe(4800);expect(current().sources.get(id)!.filePath).toBe('/owned/derived.wav');
 useProjectStore.temporal.getState().undo();expect(current().project).toBe(before);useProjectStore.temporal.getState().redo();expect(current().project).toBe(applied);expect(files.size).toBe(1);expect(sourcePluginRecallPlan(current(),'clip').input.channels).toEqual(plan.input.channels);
});
it.each(['recording_conversion_begin','recording_conversion_write','recording_conversion_protect'])('rolls back after %s failure without changing the project',async command=>{
 const {plan,preview}=prepared(),before=current().project;mocks.invoke.mockImplementation((c,a)=>c===command?Promise.reject(new Error('IPC failed')):backend(c,a));await expect(commitSourcePluginRecall(plan,preview,current,publish,new AbortController().signal)).rejects.toThrow('IPC failed');expect(current().project).toBe(before);expect(files.size).toBe(0);expect(events).not.toContain('publish');expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:false});
});
it('rolls back a late successful write after cancellation',async()=>{
 const {plan,preview}=prepared(),controller=new AbortController();let release!:(v:string)=>void;mocks.invoke.mockImplementation((c,a)=>c==='recording_conversion_write'?new Promise<string>(r=>{release=r;files.add('/owned/derived.wav');}):backend(c,a));const pending=commitSourcePluginRecall(plan,preview,current,publish,controller.signal);await vi.waitFor(()=>expect(release).toBeTypeOf('function'));controller.abort();release('/owned/derived.wav');await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(files.size).toBe(0);expect(events).not.toContain('publish');
});
it.each(['project','sources','playback','abort'])('rolls back protected files after a late %s change',async kind=>{
 const {plan,preview}=prepared(),controller=new AbortController();let stale=false;mocks.invoke.mockImplementation(async(c,a)=>{const result=await backend(c,a);if(c==='recording_conversion_protect'){stale=true;if(kind==='abort')controller.abort();}return result;});const state=()=>({...current(),...(stale?(kind==='project'?{project:{...current().project}}:kind==='sources'?{sources:new Map(current().sources)}:kind==='playback'?{isPlaying:true}:{}):{})});await expect(commitSourcePluginRecall(plan,preview,state,publish,controller.signal)).rejects.toThrow();expect(events).not.toContain('publish');expect(files.size).toBe(0);
});
it('retains the file if a synchronous subscriber throws after publication starts',async()=>{
 const {plan,preview}=prepared();await expect(commitSourcePluginRecall(plan,preview,current,next=>{publish(next);throw new Error('subscriber failed');},new AbortController().signal)).rejects.toThrow('subscriber failed');expect(current().project.tracks[0].segments[0].sourceId).not.toBe('edited');expect(files.size).toBe(1);expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:true});
});
it('does not allocate a transaction after encoder failure or an initially stale source',async()=>{
 const {plan,preview}=prepared();mocks.encode.mockRejectedValue(new Error('encode failed'));await expect(commitSourcePluginRecall(plan,preview,current,publish,new AbortController().signal)).rejects.toThrow('encode failed');expect(mocks.invoke).not.toHaveBeenCalled();await expect(commitSourcePluginRecall(plan,preview,()=>({...current(),sources:new Map(current().sources)}),publish,new AbortController().signal)).rejects.toThrow('changed');expect(mocks.invoke).not.toHaveBeenCalled();
});
