import {beforeEach,expect,it,vi} from 'vitest';
import {useProjectStore} from '../../../src/stores/projectStore';
const mocks=vi.hoisted(()=>({invoke:vi.fn(),readFile:vi.fn(),decode:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.invoke}));
vi.mock('@tauri-apps/plugin-fs',()=>({readFile:mocks.readFile}));
import {importVideo} from '../../../src/lib/mediaBin';
const resetProject=()=>useProjectStore.setState({project:{id:crypto.randomUUID(),name:'Drop test',sampleRate:48000,tracks:[],masterEffects:[],duration:0},sources:new Map(),playheadPosition:0,isPlaying:false});
beforeEach(()=>{
 resetProject();mocks.invoke.mockReset();mocks.readFile.mockReset();mocks.decode.mockReset();
 mocks.invoke.mockImplementation(async(command:string)=>command==='probe_media'?{has_video:true,channels:2,duration:2}:'/tmp/extracted.wav');
 mocks.readFile.mockResolvedValue(new Uint8Array(8));mocks.decode.mockResolvedValue({duration:2,sampleRate:48000,numberOfChannels:2,getChannelData:()=>new Float32Array([.2,-.2])});
 vi.stubGlobal('OfflineAudioContext',class {decodeAudioData=mocks.decode;});
});
it('imports MP4 picture and audible linked audio, including into an existing audio project',async()=>{
 useProjectStore.getState().addTrack('Existing');const state=useProjectStore.getState();
 useProjectStore.setState({project:{...state.project,tracks:state.project.tracks.map(t=>({...t,segments:[{startTime:0,duration:2} as typeof t.segments[number]]}))}});
 await importVideo('/tmp/Camera.MP4',true);
 const {project,sources}=useProjectStore.getState(),audio=project.tracks.at(-1)!;
 expect(audio.muted).toBe(false);expect(audio.segments[0].linkGroup).toBe(project.video!.clips![0].linkGroup);expect(sources.size).toBe(1);
 expect(mocks.invoke).toHaveBeenCalledWith('prepare_media_asset',{path:'/tmp/Camera.MP4',proxy:false});
});
it('leaves the new project untouched if it changes while video decoding is pending',async()=>{
 mocks.decode.mockImplementationOnce(async()=>{resetProject();return {duration:2,sampleRate:48000,numberOfChannels:2};});
 await expect(importVideo('/tmp/Camera.MP4',true)).rejects.toThrow('Project changed');expect(useProjectStore.getState().project.video).toBeUndefined();expect(useProjectStore.getState().sources.size).toBe(0);
});
it('leaves the arrangement untouched when extracting the camera audio fails',async()=>{
 const before=useProjectStore.getState().project;mocks.readFile.mockRejectedValueOnce(new Error('Decode unavailable'));
 await expect(importVideo('/tmp/Camera.MP4',true)).rejects.toThrow('Decode unavailable');expect(useProjectStore.getState().project).toBe(before);
});
