import {beforeEach,expect,it} from 'vitest';
import {prepareNativeRecordingGroup,publishNativeRecordingGroup,type NativeRecordingManifest} from '../../../src/lib/nativeRecordingTakes';
import {useProjectStore} from '../../../src/stores/projectStore';
import {validRecording} from '../../../src/lib/recordingTakes';
import {serializeProject,deserializeProject} from '../../../src/lib/projectFile';
import type {AudioSource,TimelineProject} from '../../../src/types/audio';
const ROOT='/managed/group';
const project=():TimelineProject=>({...useProjectStore.getInitialState().project,id:'native-group',duration:4,minimumDuration:4,tracks:['a','b'].map(id=>({id,name:id,volume:1,pan:0,muted:false,solo:false,recordArmed:true,segments:[],recordingInput:{deviceId:'',channel:'mono',monitor:false,countIn:0,latencyMs:500}}))});
function buffer(rate=48000):AudioBuffer{return {length:rate*2,numberOfChannels:1,sampleRate:rate,duration:2,getChannelData:()=>new Float32Array(rate*2)} as AudioBuffer;}
function loaded(rate=48000):Map<string,AudioSource>{return new Map(['a','b'].map(id=>[id,{id:`native-${id}`,name:id,buffer:buffer(rate),duration:2,sampleRate:rate,channels:1,filePath:`${ROOT}/native-take-${id}/take.wav`,peaks:{min:new Float32Array(0),max:new Float32Array(0)}}]));}
function manifest():NativeRecordingManifest{return {version:2,clips:['a','b'].map(id=>({track_id:id,audio:`native-take-${id}/take.wav`,info:{frames:96000,sample_rate:48000,channels:1}})),timing:{version:1,intent:{projectId:'native-group',corrections:{a:{frames:0,basis:'unqualified'},b:{frames:-48,basis:'manual'}}},placements:['a','b'].map((id,i)=>({trackId:id,pass:0,projectStartFrame:48000,sourceOffsetFrames:24000+i*48,frames:48000}))}};}
beforeEach(()=>{useProjectStore.getState().loadProjectState(project(),new Map());useProjectStore.temporal.getState().clear();});
it('uses native frame positions after buffer resampling and never reapplies legacy latency',()=>{
 const data=prepareNativeRecordingGroup(ROOT,manifest(),loaded(44100),'Take');expect(data.map(row=>row.takes[0].startTime)).toEqual([1,1]);expect(data[0].takes[0].sourceOffset).toBe(.5);expect(data[1].takes[0].sourceOffset).toBe(.501);expect(data.map(row=>row.takes[0].latencyMs)).toEqual([0,1]);expect(data.map(row=>row.takes[0].pass)).toEqual([1,1]);expect(data[0].source.buffer.sampleRate).toBe(44100);
});
it('publishes all tracks and loop passes as one Undo action, retaining sources for Redo',()=>{
 const m=manifest();m.timing!.placements.push({trackId:'a',pass:1,projectStartFrame:48000,sourceOffsetFrames:60000,frames:24000});const state=useProjectStore.getState(),p=state.project;
 const next=publishNativeRecordingGroup(ROOT,m,loaded(),p,p,state.sources,'Take',0,{start:1,end:2});useProjectStore.setState(next);
 expect(next.project.tracks.map(t=>t.takes!.length)).toEqual([2,1]);expect(next.project.tracks[0].segments[0].duration).toBe(1);expect(next.sources.size).toBe(2);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
 useProjectStore.temporal.getState().undo();expect(useProjectStore.getState().project).toBe(p);expect(useProjectStore.getState().sources.size).toBe(2);useProjectStore.temporal.getState().redo();expect(useProjectStore.getState().project).toBe(next.project);
});
it('rejects bad geometry, stale groups and wrong source files before any editor mutation',()=>{
 const original=useProjectStore.getState().project;
 for(const change of [(m:NativeRecordingManifest)=>{m.version=1;},(m:NativeRecordingManifest)=>{m.timing!.placements[1].sourceOffsetFrames=90000;},(m:NativeRecordingManifest)=>{m.timing!.placements[1].frames=NaN;},(m:NativeRecordingManifest)=>{m.timing!.placements[1].trackId='missing';},(m:NativeRecordingManifest)=>{m.timing!.placements.push({...m.timing!.placements[0]});}]){
  const m=manifest();change(m);expect(()=>publishNativeRecordingGroup(ROOT,m,loaded(),original,original,new Map(),'Take',0)).toThrow('timingInvalid');expect(useProjectStore.getState().project).toBe(original);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
 }
 const foreign=manifest();foreign.timing!.intent.projectId='another-project';expect(()=>publishNativeRecordingGroup(ROOT,foreign,loaded(),original,original,new Map(),'Take',0)).toThrow('projectChanged');
 const sources=loaded();sources.get('b')!.filePath='/other/take.wav';expect(()=>prepareNativeRecordingGroup(ROOT,manifest(),sources,'Take')).toThrow('timingInvalid');expect(()=>publishNativeRecordingGroup(ROOT,manifest(),loaded(),original,{...original},new Map(),'Take',0)).toThrow('projectChanged');
});
it('reopens saved audio, exact placements and alternate takes without a clock remap',async()=>{
 const state=useProjectStore.getState(),p=state.project,m=manifest();m.timing!.placements.push({trackId:'a',pass:1,projectStartFrame:48000,sourceOffsetFrames:60000,frames:24000});
 const next=publishNativeRecordingGroup(ROOT,m,loaded(),p,p,state.sources,'Take',0);const saved=serializeProject(next.project,next.sources,'portable');
 const reopened=await deserializeProject(saved,{decodeAudioData:async()=>buffer()} as unknown as BaseAudioContext);
 expect(reopened.project.tracks.map(t=>t.takes)).toEqual(next.project.tracks.map(t=>t.takes));expect(reopened.sources.size).toBe(2);expect(validRecording(reopened.project,new Set(reopened.sources.keys()))).toBe(true);expect(reopened.project.tracks[0].takes![1].sourceOffset*48000).toBe(60000);
});
it('rejects incomplete groups, short empty tracks and incorrect decoded formats',()=>{
 const m=manifest();m.timing!.placements=m.timing!.placements.filter(p=>p.trackId==='a');expect(()=>prepareNativeRecordingGroup(ROOT,m,loaded(),'Take')).toThrow('recording.empty');
 const short=manifest();short.timing!.placements[1].frames=1;expect(()=>prepareNativeRecordingGroup(ROOT,short,loaded(),'Take')).toThrow('recording.empty');
 const sources=loaded();sources.get('b')!.channels=2;expect(()=>prepareNativeRecordingGroup(ROOT,manifest(),sources,'Take')).toThrow('timingInvalid');
 const cropped=loaded();cropped.get('a')!.provenance={path:cropped.get('a')!.filePath!,offset:1,rate:1};expect(()=>prepareNativeRecordingGroup(ROOT,manifest(),cropped,'Take')).toThrow('timingInvalid');
});
