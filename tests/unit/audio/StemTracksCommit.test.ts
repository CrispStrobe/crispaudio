import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {commitStemTracks} from '../../../src/audio/plugins/StemTracksCommit';
import {recallFixture,RecallBuffer} from '../../fixtures/sourcePluginRecall';
import {useProjectStore} from '../../../src/stores/projectStore';
const mocks=vi.hoisted(()=>({invoke:vi.fn(),encode:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.invoke}));
vi.mock('../../../src/lib/wavExport',()=>({encodeSourceBufferWav:mocks.encode}));
let files:string[],events:string[];
const current=()=>useProjectStore.getState();
const publish=(next:Parameters<typeof useProjectStore.setState>[0])=>{events.push('publish');useProjectStore.setState(next);};
function input(alone=false){
 const f=recallFixture(48000,2);f.state.project.id=crypto.randomUUID();
 if(alone)f.state.project.tracks[0].segments=[f.clip];
 useProjectStore.setState(f.state);useProjectStore.temporal.getState().clear();
 const stem=(v:number)=>[new Float32Array(2400).fill(v),new Float32Array(2400).fill(-v)];
 return {snapshot:current(),clipId:'clip',stems:[{name:'vocals',channels:stem(.1)},{name:'other',channels:stem(.2)}],trackName:(s:string)=>`Track – ${s}`,sourceName:(s:string)=>`Stem: ${s}`};
}
async function backend(command:string,args?:unknown){events.push(command);if(command==='recording_conversion_write'){const path=`/owned/${files.length}.wav`;files.push(path);return path;}if(command==='recording_conversion_finish'&&!(args as {keep:boolean}).keep)files=[];return undefined;}
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('AudioBuffer',RecallBuffer);Object.assign(window,{__TAURI_INTERNALS__:{}});files=[];events=[];mocks.invoke.mockImplementation(backend);mocks.encode.mockResolvedValue({arrayBuffer:async()=>new ArrayBuffer(8)});});
afterEach(()=>{delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;vi.unstubAllGlobals();});

it('adds every stem as a grouped track below the clip in one protected Undo step',async()=>{
 const i=input(),before=current().project;
 const {mutedOriginal}=await commitStemTracks(i,current,publish,new AbortController().signal);
 const after=current().project;
 expect(mutedOriginal).toBe(false);
 expect(after.tracks.map(t=>t.name)).toEqual(['Track','Track – vocals','Track – other']);
 expect(after.tracks[0].muted).toBe(false);
 const group=after.tracks[0].segments[0].editGroup!;
 expect(group).toBeDefined();expect(after.tracks[0].segments[1].editGroup).toBeUndefined();
 for(const track of after.tracks.slice(1)){const c=track.segments[0];expect(c).toMatchObject({startTime:2,sourceOffset:0,gain:.7,editGroup:group,trackId:track.id});expect(c.duration).toBe(before.tracks[0].segments[0].duration);expect(current().sources.get(c.sourceId)!.filePath).toMatch(/^\/owned\//);}
 expect(current().sources.get(after.tracks[1].segments[0].sourceId)!.buffer.getChannelData(1)[0]).toBeCloseTo(-.1,6);
 expect(events.filter(e=>e==='recording_conversion_begin')).toHaveLength(1);
 expect(events.indexOf('recording_conversion_protect')).toBeLessThan(events.indexOf('publish'));
 expect(mocks.invoke).toHaveBeenLastCalledWith('recording_conversion_finish',{token:expect.any(String),keep:true});
 expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);useProjectStore.temporal.getState().undo();expect(current().project).toBe(before);
});
it('mutes the original track only when the clip is its only content',async()=>{
 const i=input(true);const {mutedOriginal}=await commitStemTracks(i,current,publish,new AbortController().signal);
 expect(mutedOriginal).toBe(true);expect(current().project.tracks[0].muted).toBe(true);
});
it('rolls back owned files when the project changes before publication',async()=>{
 const i=input();let release!:(v:string)=>void;
 mocks.invoke.mockImplementation((c,a)=>c==='recording_conversion_write'&&!release?new Promise<string>(r=>{release=r;files.push('/owned/late.wav');}):backend(c,a));
 const outcome=commitStemTracks(i,current,publish,new AbortController().signal).catch(e=>e);
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
 useProjectStore.setState({project:{...current().project}});release('/owned/late.wav');
 expect(await outcome).toBeInstanceOf(Error);expect(events).not.toContain('publish');expect(files).toEqual([]);
});
it.each(['length','nan','locked','count'])('rejects %s before storing files',async kind=>{
 const i=input();
 if(kind==='length')i.stems[0].channels[0]=new Float32Array(10);
 if(kind==='nan')i.stems[1].channels[1][5]=NaN;
 if(kind==='locked')i.snapshot.project.tracks[0].locked=true;
 if(kind==='count')i.stems=Array.from({length:9},()=>i.stems[0]);
 await expect(commitStemTracks(i,current,publish,new AbortController().signal)).rejects.toThrow();expect(mocks.invoke).not.toHaveBeenCalled();
});
