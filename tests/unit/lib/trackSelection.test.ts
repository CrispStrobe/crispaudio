import {beforeEach,describe,it,expect} from 'vitest';
import {useProjectStore} from '../../../src/stores/projectStore';
import {selectTimelineTrack} from '../../../src/lib/trackSelection';
beforeEach(()=>{useProjectStore.setState({...useProjectStore.getInitialState()});for(let i=0;i<4;i++)useProjectStore.getState().addTrack(`Track ${i}`);useProjectStore.temporal.getState().clear();});
describe('track header selection',()=>{
 it('selects empty tracks through an anchored range and replaces it on plain click',()=>{
  const tracks=useProjectStore.getState().project.tracks;
  selectTimelineTrack(tracks[2].id);selectTimelineTrack(tracks[0].id,true);
  expect(useProjectStore.getState().selection?.trackIds).toEqual(tracks.slice(0,3).map(t=>t.id));
  selectTimelineTrack(tracks[3].id,true);
  expect(useProjectStore.getState().selection?.trackIds).toEqual(tracks.slice(2).map(t=>t.id));
  selectTimelineTrack(tracks[1].id);
  expect(useProjectStore.getState().selection?.trackIds).toEqual([tracks[1].id]);
  expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
 });
 it('ignores a removed target and uses the new project for a fresh selection',()=>{
  const tracks=useProjectStore.getState().project.tracks;selectTimelineTrack(tracks[0].id);
  const selection=useProjectStore.getState().selection;selectTimelineTrack('missing',true);expect(useProjectStore.getState().selection).toBe(selection);
  useProjectStore.setState({...useProjectStore.getInitialState()});useProjectStore.getState().addTrack('New');const id=useProjectStore.getState().project.tracks[0].id;selectTimelineTrack(id,true);expect(useProjectStore.getState().selection?.trackIds).toEqual([id]);
 });
});
