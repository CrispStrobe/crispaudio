import {nativeSourceOwner} from '../../../src/audio/engine/NativeSourceOwner';
import {beforeEach,expect,it,vi} from 'vitest';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {TimelineRecording} from '../../../src/components/timeline/TimelineRecording';
import {useProjectStore} from '../../../src/stores/projectStore';
import {useSettingsStore} from '../../../src/stores/settingsStore';
import {useUIStore} from '../../../src/stores/uiStore';
import {useRecordingMeterStore} from '../../../src/stores/recordingMeterStore';
import type {TimelineEngine} from '../../../src/audio/engine/TimelineEngine';
import type {AudioEngineHandle} from '../../../src/hooks/useAudioEngine';
const mocks=vi.hoisted(()=>({start:vi.fn(),status:vi.fn(),stop:vi.fn(),inputs:vi.fn(),outputs:vi.fn(),options:vi.fn(),capture:vi.fn()}));
vi.mock('react-i18next',async importOriginal=>({...await importOriginal<typeof import('react-i18next')>(),useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('../../../src/lib/nativeMenu',()=>({isNativeMac:()=>true,menuBlocked:()=>false,textEditing:()=>false}));
vi.mock('../../../src/audio/plugins/NativeRecordingController',()=>({NativeRecordingController:class{start=mocks.start;status=mocks.status;stop=mocks.stop;monitorState(){return {mix:{backing:1,output:1},lastMix:{backing:1,output:1},lastCueGains:{voice:.25},cues:{voice:{gain:.25,pan:0,mono:false}}};}},NativeRecordingFailure:class extends Error{},nativeRecordingOptions:mocks.options}));
vi.mock('../../../src/audio/plugins/NativeTimelineRecording',()=>({NativeTimelineRecording:{inputs:mocks.inputs}}));
vi.mock('../../../src/lib/audioOutput',()=>({playbackOutputs:mocks.outputs}));
vi.mock('../../../src/audio/engine/TimelineCapture',()=>({TimelineCapture:class{constructor(){mocks.capture();}}}));
const engine={stop:vi.fn(),closeNativeOwned:vi.fn(async()=>{})}as unknown as TimelineEngine;
const audio={getContext:()=>({sampleRate:48000}),resume:vi.fn(),masterGain:{}}as unknown as AudioEngineHandle;
function renderRecording(){return render(<TimelineRecording engine={{current:engine}} audio={audio}/>);}
beforeEach(()=>{
 vi.clearAllMocks();const base=useProjectStore.getInitialState().project;useProjectStore.getState().loadProjectState({...base,id:'record-ui',duration:4,tracks:[{id:'voice',name:'Voice',volume:1,pan:0,solo:false,muted:false,recordArmed:true,segments:[],recordingInput:{deviceId:'browser-input',channel:'mono',monitor:false,countIn:0,latencyMs:500}}]},new Map());useProjectStore.temporal.getState().clear();useUIStore.setState({timelineRecording:false});useSettingsStore.setState({nativeRecording:true,nativeRecordingOutput:''});useRecordingMeterStore.getState().clear();
 mocks.start.mockResolvedValue(undefined);mocks.status.mockResolvedValue({phase:'recording',frame:24000,elapsedFrames:24000,inputs:[{trackId:'voice',frames:24000,peaks:[.5,.25],channels:1}]});mocks.stop.mockResolvedValue({directory:'/managed/raw'});mocks.inputs.mockResolvedValue({permission:'Authorized',devices:[]});mocks.outputs.mockResolvedValue({devices:[]});mocks.options.mockReturnValue({leadFrames:0,countInFrames:0,projectStartFrame:0,recordStartFrame:0});
});
it('starts native recording immediately without opening a dialog or browser capture and displays native meters',async()=>{
 renderRecording();fireEvent.click(screen.getByRole('button',{name:'recording.start'}));
 await waitFor(()=>expect(mocks.status).toHaveBeenCalled());expect(mocks.capture).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(useUIStore.getState().timelineRecording).toBe(true);
 expect(useRecordingMeterStore.getState().levels.voice).toEqual({peak:.5,channels:1});expect(useProjectStore.getState().playheadPosition).toBe(.5);
 fireEvent.click(screen.getByRole('button',{name:'recording.stop'}));await waitFor(()=>expect(useUIStore.getState().timelineRecording).toBe(false));expect(mocks.stop).toHaveBeenCalledWith(false);expect(useRecordingMeterStore.getState().levels).toEqual({});
});
it('publishes one whole project result and supports one-action Undo',async()=>{
 const original=useProjectStore.getState().project,next={...original,name:'Recorded'};mocks.stop.mockResolvedValue({directory:'/managed/raw',next:{project:next,sources:new Map()}});
 renderRecording();fireEvent.click(screen.getByRole('button',{name:'recording.start'}));await waitFor(()=>expect(mocks.status).toHaveBeenCalled());fireEvent.click(screen.getByRole('button',{name:'recording.stop'}));await waitFor(()=>expect(useProjectStore.getState().project).toBe(next));
 expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project).toBe(original);
});
it('unmount cancels a pending native start and never inserts its late result',async()=>{
 let release!:()=>void;mocks.start.mockImplementation(()=>new Promise<void>(resolve=>{release=resolve;}));const original=useProjectStore.getState().project;
 const view=renderRecording();fireEvent.click(screen.getByRole('button',{name:'recording.start'}));await waitFor(()=>expect(mocks.start).toHaveBeenCalled());view.unmount();await waitFor(()=>expect(mocks.stop).toHaveBeenCalledWith(true));release();await act(async()=>{await Promise.resolve();});expect(useProjectStore.getState().project).toBe(original);expect(mocks.status).not.toHaveBeenCalled();expect(useUIStore.getState().timelineRecording).toBe(false);
});
it('transport Stop also cancels preparation before the native start command',async()=>{
 let release!:(value:unknown)=>void;mocks.inputs.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));renderRecording();fireEvent.click(screen.getByRole('button',{name:'recording.start'}));await waitFor(()=>expect(mocks.inputs).toHaveBeenCalled());act(()=>window.dispatchEvent(new Event('crispaudio-transport-stop')));await waitFor(()=>expect(useUIStore.getState().timelineRecording).toBe(false));release({permission:'Authorized',devices:[]});await act(async()=>{await Promise.resolve();});expect(mocks.start).not.toHaveBeenCalled();
});
it('Stop during native helper preparation cancels quietly instead of publishing empty takes',async()=>{
 mocks.status.mockResolvedValue({phase:'preparing'});renderRecording();fireEvent.click(screen.getByRole('button',{name:'recording.start'}));await waitFor(()=>expect(mocks.status).toHaveBeenCalled());fireEvent.click(screen.getByRole('button',{name:'recording.stop'}));await waitFor(()=>expect(useUIStore.getState().timelineRecording).toBe(false));expect(mocks.stop).toHaveBeenCalledWith(true);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
});
it('offers one live cue section with unique slider IDs while recording',async()=>{
 renderRecording();fireEvent.click(screen.getByRole('button',{name:'recording.start'}));await waitFor(()=>expect(mocks.status).toHaveBeenCalled());fireEvent.click(screen.getByRole('button',{name:'recording.settings'}));
 expect(document.querySelector('[data-recording-section="live-mix"]')).toBeInTheDocument();expect(document.querySelector('[data-recording-section="cue"]')).not.toBeInTheDocument();const ids=[...document.querySelectorAll('[data-floating-inspector] input[id]')].map(input=>input.id);expect(new Set(ids).size).toBe(ids.length);
 fireEvent.click(screen.getByRole('button',{name:'recording.stop'}));await waitFor(()=>expect(useUIStore.getState().timelineRecording).toBe(false));
});
it('keeps ownership when a UI flag resets and stops the existing native run instead of opening another',async()=>{
 renderRecording();fireEvent.click(screen.getByRole('button',{name:'recording.start'}));await waitFor(()=>expect(mocks.status).toHaveBeenCalled());act(()=>useUIStore.setState({timelineRecording:false}));fireEvent.click(screen.getByRole('button',{name:'recording.start'}));await waitFor(()=>expect(mocks.stop).toHaveBeenCalledWith(false));expect(mocks.start).toHaveBeenCalledTimes(1);
});

it('Record grants first-use microphone permission and closes the browser stream before native start',async()=>{
 const stop=vi.fn(),get=vi.fn(async()=>({getTracks:()=>[{stop}]}));
 vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:get,enumerateDevices:vi.fn(async()=>[]),addEventListener:vi.fn(),removeEventListener:vi.fn()}});
 mocks.inputs.mockResolvedValueOnce({permission:'Undetermined',devices:[]}).mockResolvedValue({permission:'Authorized',devices:[]});mocks.start.mockImplementation(async()=>{expect(stop).toHaveBeenCalledTimes(1);});
 try{renderRecording();expect(get).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'recording.start'}));await waitFor(()=>expect(mocks.status).toHaveBeenCalled());expect(get).toHaveBeenCalledTimes(1);expect(mocks.capture).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'recording.stop'}));await waitFor(()=>expect(useUIStore.getState().timelineRecording).toBe(false));}finally{vi.unstubAllGlobals();}
});
it('transport Stop while permission is pending releases its late stream without starting native recording',async()=>{
 let release!:(value:unknown)=>void;const stop=vi.fn(),get=vi.fn(()=>new Promise(resolve=>{release=resolve;}));
 vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:get,enumerateDevices:vi.fn(async()=>[]),addEventListener:vi.fn(),removeEventListener:vi.fn()}});mocks.inputs.mockResolvedValue({permission:'Undetermined',devices:[]});
 try{renderRecording();fireEvent.click(screen.getByRole('button',{name:'recording.start'}));await waitFor(()=>expect(get).toHaveBeenCalled());act(()=>window.dispatchEvent(new Event('crispaudio-transport-stop')));await waitFor(()=>expect(useUIStore.getState().timelineRecording).toBe(false));await act(async()=>release({getTracks:()=>[{stop}]}));await waitFor(()=>expect(stop).toHaveBeenCalledTimes(1));expect(mocks.start).not.toHaveBeenCalled();expect(mocks.status).not.toHaveBeenCalled();}finally{vi.unstubAllGlobals();}
});

it.each([false,true])('joins source output before permission/inventory/native recording, respecting Stop=%s',async cancel=>{
 let release!:()=>void;nativeSourceOwner.reserve(()=>new Promise<void>(resolve=>{release=resolve;}));
 renderRecording();fireEvent.click(screen.getByRole('button',{name:'recording.start'}));
 await act(async()=>{await Promise.resolve();});expect(mocks.inputs).not.toHaveBeenCalled();expect(mocks.start).not.toHaveBeenCalled();
 if(cancel)act(()=>window.dispatchEvent(new Event('crispaudio-transport-stop')));
 await act(async()=>release());
 if(cancel){await waitFor(()=>expect(useUIStore.getState().timelineRecording).toBe(false));expect(mocks.inputs).not.toHaveBeenCalled();expect(mocks.start).not.toHaveBeenCalled();}
 else {await waitFor(()=>expect(mocks.status).toHaveBeenCalled());fireEvent.click(screen.getByRole('button',{name:'recording.stop'}));await waitFor(()=>expect(useUIStore.getState().timelineRecording).toBe(false));}
});
