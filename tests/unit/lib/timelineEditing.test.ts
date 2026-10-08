import {beforeEach,expect,it,vi} from 'vitest';
import {useProjectStore} from '../../../src/stores/projectStore';
import {splitSelectedVideo,nudgeSelection,deleteSelection} from '../../../src/lib/timelineEditing';
import {videoClips,validateVideoClips,videoTimelineDuration} from '../../../src/lib/videoEditing';
import {snapClipStart} from '../../../src/lib/timelineSnap';
import {envelopeValue,scheduleEnvelope} from '../../../src/lib/audioEnvelope';
import type {TimelineProject} from '../../../src/types/audio';
beforeEach(()=>{useProjectStore.setState(useProjectStore.getInitialState());useProjectStore.setState({project:{...useProjectStore.getState().project,video:{path:'source.mp4',duration:10,session:{} as never}}});useProjectStore.temporal.getState().clear();});
it('migrates a legacy video without changing source timing and splits non-destructively',()=>{
  const state=useProjectStore.getState();state.setSelection({startTime:0,endTime:10,segmentIds:['source-video']});splitSelectedVideo(4);
  expect(videoClips(useProjectStore.getState().project.video).map(c=>[c.startTime,c.sourceOffset,c.duration])).toEqual([[0,0,4],[4,4,6]]);
  useProjectStore.temporal.getState().undo();expect(useProjectStore.getState().project.video?.clips).toBeUndefined();
});
it('moves video precisely despite snapping, deletes it, and restores it with Undo',()=>{
  useProjectStore.getState().setSelection({startTime:0,endTime:10,segmentIds:['source-video']});nudgeSelection(.001);
  expect(videoClips(useProjectStore.getState().project.video)[0].startTime).toBe(.001);expect(videoTimelineDuration(useProjectStore.getState().project.video)).toBe(10.001);
  deleteSelection();expect(videoClips(useProjectStore.getState().project.video)).toHaveLength(0);
  useProjectStore.temporal.getState().undo();expect(videoClips(useProjectStore.getState().project.video)).toHaveLength(1);
});
it('snaps either edge near other clips, stays continuous away from edges, and can bypass',()=>{
  expect(snapClipStart(1.97,3,[5],100,true)).toBe(2);
  expect(snapClipStart(4.95,3,[5],100,true)).toBe(5);
  expect(snapClipStart(1.97,3,[5],1000,true)).toBe(1.97);
  expect(snapClipStart(1.97,3,[5],100,false)).toBe(1.97);
});
it('rejects ambiguous overlaps and accepts a correctly sized dissolve',()=>{
  const first=videoClips(useProjectStore.getState().project.video)[0];const second={...first,id:'second',startTime:8,duration:4};
  expect(validateVideoClips([first,second],10)).toBeTruthy();
  expect(validateVideoClips([first,{...second,transition:'fade',transitionDuration:2}],10)).toBeNull();
});
it('resumes inside an out-fade at its actual amplitude, including curved and overlapping fades',()=>{
  expect(envelopeValue(9,10,0,2,'linear','linear')).toBe(.5);
  expect(envelopeValue(5,10,8,8,'linear','linear')).toBeCloseTo(.390625);
  expect(envelopeValue(1,10,4,0,'scurve','linear')).toBe(.15625);
  const param={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()} as unknown as AudioParam;
  scheduleEnvelope(param,20,9,10,0,2,'linear','linear');
  expect(param.setValueAtTime).toHaveBeenCalledWith(.5,20);
  expect(param.linearRampToValueAtTime).toHaveBeenLastCalledWith(0,21);
});
it('preserves unrelated audio when editing video',()=>{
  const before=useProjectStore.getState().project.tracks;useProjectStore.getState().setSelection({startTime:0,endTime:10,segmentIds:['source-video']});splitSelectedVideo(2);
  expect(useProjectStore.getState().project.tracks).toBe(before);
  const project:TimelineProject=useProjectStore.getState().project;expect(project.video?.path).toBe('source.mp4');
});
it('audio nudging and deletion keep untouched video on its stream-copy path',()=>{
  const state=useProjectStore.getState();state.addTrack('Audio');const track=useProjectStore.getState().project.tracks[0];
  useProjectStore.setState({project:{...useProjectStore.getState().project,tracks:[{...track,segments:[{id:'audio',startTime:1,duration:2} as never]}]},selection:{startTime:1,endTime:3,segmentIds:['audio']}});
  const video=useProjectStore.getState().project.video;nudgeSelection(.001);
  expect(useProjectStore.getState().project.video).toBe(video);deleteSelection();expect(useProjectStore.getState().project.video).toBe(video);
});
