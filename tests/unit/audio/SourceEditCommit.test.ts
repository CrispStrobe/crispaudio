import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {commitSourceEdit} from '../../../src/audio/plugins/SourceEditCommit';
import {recallFixture,RecallBuffer} from '../../fixtures/sourcePluginRecall';
import {useProjectStore} from '../../../src/stores/projectStore';
const mocks=vi.hoisted(()=>({invoke:vi.fn(),encode:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.invoke}));
vi.mock('../../../src/lib/wavExport',()=>({encodeSourceBufferWav:mocks.encode}));
let files:Set<string>,events:string[];
const current=()=>useProjectStore.getState();
const publish=(next:Parameters<typeof useProjectStore.setState>[0])=>{events.push('publish');useProjectStore.setState(next);};
function input(rate=48000,channels=2){
 const f=recallFixture(rate,channels);
 // Current-format first edit, with an untouched sibling sharing the same source.
 f.clip.sourceEdit=undefined;f.state.project.id=crypto.randomUUID();useProjectStore.setState(f.state);useProjectStore.temporal.getState().clear();
 return {snapshot:current(),clipId:'clip',pcm:Array.from({length:channels},(_,ch)=>new Float32Array(2400).fill(ch?-.2:.2)),operation:{type:'invert',channel:-1,ranges:[{start:0,end:2400}],targetDb:-1},name:'Inverted'};
}
async function backend(command:string,args?:unknown){events.push(command);if(command==='recording_conversion_write'){files.add('/owned/edit.wav');return '/owned/edit.wav';}if(command==='recording_conversion_finish'&&!(args as {keep:boolean}).keep)files.clear();}
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('AudioBuffer',RecallBuffer);Object.assign(window,{__TAURI_INTERNALS__:{}});files=new Set();events=[];mocks.invoke.mockImplementation(backend);mocks.encode.mockResolvedValue({arrayBuffer:async()=>new ArrayBuffer(64)});});
afterEach(()=>{delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;vi.unstubAllGlobals();});
it.each([[44100,1],[48000,2],[96000,2],[48000,4]])('protects current %i Hz/%i-channel audio before one publication, retaining originals and Undo/Redo',async(rate,channels)=>{
 const i=input(rate,channels),before=current().project,sibling=before.tracks[0].segments[1],old=current().sources.get('edited')!;
 await commitSourceEdit(i,current,publish,new AbortController().signal);
 const applied=current().project,clip=applied.tracks[0].segments[0],derived=current().sources.get(clip.sourceId)!;
 expect(events.indexOf('recording_conversion_protect')).toBeLessThan(events.indexOf('publish'));
 expect(derived.buffer.length).toBe(2400);expect(derived.sampleRate).toBe(rate);expect(derived.channels).toBe(channels);expect(derived.buffer.getChannelData(0)).toEqual(i.pcm[0]);expect(derived.filePath).toBe('/owned/edit.wav');
 expect(clip.sourceOffset).toBe(0);expect(clip.duration).toBe(i.snapshot.project.tracks[0].segments[0].duration);expect(clip.sourceEdit).toMatchObject({sourceId:'edited',offset:1200/rate,journal:{version:1,sampleRate:rate,channels},operations:[{...i.operation,window:{start:1200,frames:2400}}]});
 expect(applied.tracks[0].segments[1]).toBe(sibling);expect(current().sources.get('edited')).toBe(old);expect(old.buffer.getChannelData(0)[0]).toBe(3);
 expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);useProjectStore.temporal.getState().undo();expect(current().project).toBe(before);useProjectStore.temporal.getState().redo();expect(current().project).toBe(applied);expect(files.size).toBe(1);
 expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:true});
});
it.each(['recording_conversion_begin','recording_conversion_write','recording_conversion_protect'])('rolls back %s failures without publishing',async command=>{
 const i=input(),before=current().project;mocks.invoke.mockImplementation((c,a)=>c===command?Promise.reject(new Error('IPC failed')):backend(c,a));
 await expect(commitSourceEdit(i,current,publish,new AbortController().signal)).rejects.toThrow('IPC failed');expect(current().project).toBe(before);expect(files.size).toBe(0);expect(events).not.toContain('publish');expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:false});
});
it.each(['abort','project','sources','playback'])('discards a late write after %s',async reason=>{
 const i=input(),controller=new AbortController();let release!:(v:string)=>void;
 mocks.invoke.mockImplementation((c,a)=>c==='recording_conversion_write'?new Promise<string>(r=>{release=r;files.add('/owned/edit.wav');}):backend(c,a));
 const promise=commitSourceEdit(i,current,publish,controller.signal);const outcome=promise.catch(e=>e);
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
 if(reason==='abort')controller.abort();if(reason==='project')useProjectStore.setState({project:{...current().project}});if(reason==='sources')useProjectStore.setState({sources:new Map(current().sources)});if(reason==='playback')useProjectStore.setState({isPlaying:true});
 release('/owned/edit.wav');expect(await outcome).toBeInstanceOf(Error);expect(events).not.toContain('publish');expect(files.size).toBe(0);
});
it('retains uncertain publication when a subscriber throws after mutation',async()=>{
 const i=input();await expect(commitSourceEdit(i,current,next=>{publish(next);throw new Error('subscriber');},new AbortController().signal)).rejects.toThrow('subscriber');expect(files.size).toBe(1);expect(current().project).not.toBe(i.snapshot.project);expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:true});
});
it('checks again after protection and rolls back an aborted unpublished file',async()=>{
 const i=input(),controller=new AbortController();mocks.invoke.mockImplementation(async(c,a)=>{const result=await backend(c,a);if(c==='recording_conversion_protect')controller.abort();return result;});await expect(commitSourceEdit(i,current,publish,controller.signal)).rejects.toThrow();expect(files.size).toBe(0);expect(events).not.toContain('publish');
});
it.each(['nan','shape','locked'])('rejects %s before storing files',async kind=>{
 const i=input();if(kind==='nan')i.pcm[1][123]=NaN;if(kind==='shape')i.pcm[0]=new Float32Array(1);if(kind==='locked')i.snapshot.project.tracks[0].locked=true;
 await expect(commitSourceEdit(i,current,publish,new AbortController().signal)).rejects.toThrow();expect(mocks.invoke).not.toHaveBeenCalled();expect(events).not.toContain('publish');
});
it('publishes in browser without native storage',async()=>{
 const i=input();delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;await commitSourceEdit(i,current,publish,new AbortController().signal);expect(events).toEqual(['publish']);expect(mocks.encode).not.toHaveBeenCalled();
});
