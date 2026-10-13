import {beforeEach,expect,it} from 'vitest';
import {quickRecordingTrack,defaultRecordingInput,recordingTargets,publishRecordingGroup,type PreparedRecording} from '../../../src/lib/recordingGroup';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {TimelineProject,AudioSource} from '../../../src/types/audio';
const project=():TimelineProject=>({...useProjectStore.getInitialState().project,id:'group',duration:4,minimumDuration:4,tracks:['a','b'].map((id,i)=>({id,name:id,volume:1,pan:0,muted:false,solo:false,recordArmed:true,segments:[],recordingInput:{deviceId:id,channel:i?'right':'mono',monitor:false,countIn:i,latencyMs:i*10}}))});
const prepared=(id:string):PreparedRecording=>({trackId:id,source:{id:`s${id}`,name:id,duration:2,sampleRate:48000,channels:1,buffer:{} as AudioBuffer,peaks:{min:new Float32Array(0),max:new Float32Array(0)}} as AudioSource,takes:[{id:`take${id}`,name:id,sourceId:`s${id}`,startTime:0,sourceOffset:0,duration:2,pass:1,latencyMs:0,capturedAt:'now',droppedFrames:0,notes:[]}]});
beforeEach(()=>{useProjectStore.getState().loadProjectState(project(),new Map());useProjectStore.temporal.getState().clear();});
it('selects each armed input independently and excludes bus tracks',()=>{
 const p=project();p.tracks.push({...p.tracks[0],id:'bus',kind:'bus'});expect(recordingTargets(p,'a',true).map(t=>[t.trackId,t.input.deviceId,t.input.channel])).toEqual([['a','a','mono'],['b','b','right']]);expect(recordingTargets(p,'b',false)).toHaveLength(1);const targets=recordingTargets(p,'a',true);targets[0].input.latencyMs=99;expect(p.tracks[0].recordingInput!.latencyMs).toBe(0);
});
it('rejects missing/unarmed/locked targets and groups above the memory limit',()=>{
 const p=project();expect(()=>recordingTargets(p,'missing',false)).toThrow('groupCount');p.tracks[0].locked=true;expect(()=>recordingTargets(p,'a',true)).toThrow('locked');p.tracks[0].locked=false;p.tracks[0].recordArmed=false;expect(recordingTargets(p,'a',true)).toHaveLength(1);expect(()=>recordingTargets(p,'a',false)).toThrow('locked');p.tracks=Array.from({length:9},(_,i)=>({...p.tracks[1],id:String(i)}));expect(()=>recordingTargets(p,'a',true)).toThrow('groupCount');
});
it('publishes all sources/takes/comps in one undo and retains originals for redo',()=>{
 const state=useProjectStore.getState(),p=state.project;const next=publishRecordingGroup(p,p,state.sources,[prepared('a'),prepared('b')],.04);useProjectStore.setState(next);expect(next.project.tracks.map(t=>[t.takes!.length,t.segments.length])).toEqual([[1,1],[1,1]]);expect(next.sources.size).toBe(2);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);useProjectStore.temporal.getState().undo();expect(useProjectStore.getState().project).toBe(p);expect(useProjectStore.getState().sources.size).toBe(2);useProjectStore.temporal.getState().redo();expect(useProjectStore.getState().project).toBe(next.project);
});
it('fails atomically for stale projects or any invalid/locked/duplicate capture',()=>{
 const p=project(),sources=new Map<string,AudioSource>();expect(()=>publishRecordingGroup(p,{...p},sources,[prepared('a')],.04)).toThrow('projectChanged');const invalid=prepared('b');invalid.takes[0].duration=3;expect(()=>publishRecordingGroup(p,p,sources,[prepared('a'),invalid],.04)).toThrow('invalidComp');expect(p.tracks.every(t=>!t.takes&&t.segments.length===0)).toBe(true);expect(sources.size).toBe(0);expect(()=>publishRecordingGroup(p,p,sources,[prepared('a'),prepared('a')],.04)).toThrow('groupCount');p.tracks[1].locked=true;expect(()=>publishRecordingGroup(p,p,sources,[prepared('a'),prepared('b')],.04)).toThrow('locked');
});

it('quick recording honors setup and armed targets while protecting locks and bus tracks',()=>{
 const p=project();expect(defaultRecordingInput.countIn).toBe(0);expect(quickRecordingTrack(p,'b')?.id).toBe('b');p.tracks[0].locked=true;expect(quickRecordingTrack(p,'')?.id).toBe('b');expect(()=>quickRecordingTrack(p,'a')).toThrow('recording.locked');p.tracks[1].recordArmed=false;expect(quickRecordingTrack(p,'','b')?.id).toBe('b');p.tracks[1].kind='bus';expect(quickRecordingTrack(p,'')).toBeUndefined();expect(p.tracks[1].recordArmed).toBe(false);
});
