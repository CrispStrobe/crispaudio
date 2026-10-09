import { beforeEach, expect, it } from 'vitest';
import { useProjectStore } from '../../../src/stores/projectStore';
import type { TimelineProject } from '../../../src/types/audio';
import { serializeProject, deserializeProject } from '../../../src/lib/projectFile';
import { moveClips } from '../../../src/lib/projectEdits';

beforeEach(()=>{
  const project:TimelineProject={id:crypto.randomUUID(),name:'locks',sampleRate:48000,duration:10,masterEffects:[],tracks:[
    {id:'t',name:'Mic',locked:true,muted:false,solo:false,volume:1,pan:0,segments:[{id:'c',trackId:'t',sourceId:'s',linkGroup:'av',startTime:0,duration:10,sourceOffset:0,gain:1,fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear',effects:[],name:'sound',color:'#fff'}]},
    {id:'u',name:'Other',muted:false,solo:false,volume:1,pan:0,segments:[]}],video:{path:'camera.mp4',duration:10,session:{} as never,clips:[{id:'v',linkGroup:'av',startTime:0,duration:10,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0}]}};
  useProjectStore.getState().loadProjectState(project,new Map());
  useProjectStore.temporal.getState().clear();
});
it('blocks direct, linked, clipboard and track deletion edits atomically',()=>{
 const state=useProjectStore.getState(),project=state.project;
 state.moveSegment('c',1);expect(useProjectStore.getState().project).toBe(project);
 useProjectStore.setState({project:moveClips(project,['v'],1)});expect(useProjectStore.getState().project).toBe(project);
 state.removeTrack('t');expect(useProjectStore.getState().project).toBe(project);
 state.selectSegment('c');state.cut();expect(useProjectStore.getState().project).toBe(project);
 expect(useProjectStore.getState().clipboard.operation).toBeNull();
 expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
});
it('permits mixing and copying, then unlock/edit/undo restores the arrangement',()=>{
 const state=useProjectStore.getState();state.updateTrack('t',{volume:.5,muted:true});
 expect(useProjectStore.getState().project.tracks[0].volume).toBe(.5);
 state.selectSegment('c');state.copy();expect(useProjectStore.getState().clipboard.segments).toHaveLength(1);
 state.updateTrack('t',{locked:false});state.moveSegment('c',1);
 expect(useProjectStore.getState().project.video?.clips?.[0].startTime).toBe(1);
 useProjectStore.temporal.getState().undo();expect(useProjectStore.getState().project.tracks[0].segments[0].startTime).toBe(0);
 useProjectStore.temporal.getState().undo();expect(useProjectStore.getState().project.tracks[0].locked).toBe(true);
});
it('keeps range and clip selection separate, validates bounds and saves it in the project',()=>{
 const state=useProjectStore.getState();state.selectSegment('c');state.setEditRange(2,5);
 const selection=useProjectStore.getState().selection;
 expect(useProjectStore.getState().project.editRange).toEqual({start:2,end:5});
 state.setEditRange(5,2);state.setEditRange(0,11);state.setEditRange(NaN,5);
 expect(useProjectStore.getState().project.editRange).toEqual({start:2,end:5});
 state.playEditRange();expect(useProjectStore.getState()).toMatchObject({isPlaying:true,rangePlayback:true,playheadPosition:2});
 state.clearEditRange();expect(useProjectStore.getState().selection).toBe(selection);
 expect(useProjectStore.getState().project.editRange).toBeUndefined();
});

it('protects locked picture when a linked sound edit is requested',()=>{
 const state=useProjectStore.getState();state.updateTrack('t',{locked:false});
 useProjectStore.setState(s=>({project:{...s.project,video:{...s.project.video!,locked:true}}}));
 const before=useProjectStore.getState().project;state.moveSegment('c',1);
 expect(useProjectStore.getState().project).toBe(before);
 state.setSegmentGain('c',.5);expect(useProjectStore.getState().project.tracks[0].segments[0].gain).toBe(.5);
});

it('round trips lock and range fields through saved project loading',async()=>{
 const state=useProjectStore.getState();state.setEditRange(2,5);
 const saved=serializeProject(useProjectStore.getState().project,new Map(),'linked');
 const loaded=await deserializeProject(saved,{} as AudioContext);
 state.loadProjectState(loaded.project,loaded.sources);
 expect(useProjectStore.getState().project.tracks[0].locked).toBe(true);
 expect(useProjectStore.getState().project.editRange).toEqual({start:2,end:5});
 expect(useProjectStore.getState().rangePlayback).toBe(false);
});
