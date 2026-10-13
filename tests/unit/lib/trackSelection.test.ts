import {beforeEach,describe,it,expect} from 'vitest';
import {useProjectStore} from '../../../src/stores/projectStore';
import {selectTimelineTrack,selectPictureTimelineTrack} from '../../../src/lib/trackSelection';
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
 it('starts a new range when its previous anchor was removed',()=>{const tracks=useProjectStore.getState().project.tracks;useProjectStore.setState({selection:{startTime:0,endTime:0,segmentIds:[],trackIds:['removed'],trackAnchorId:'removed'}});selectTimelineTrack(tracks[2].id,true);expect(useProjectStore.getState().selection?.trackIds).toEqual([tracks[2].id]);expect(useProjectStore.getState().selection?.trackAnchorId).toBe(tracks[2].id);});
 it('starts a picture range from the selected clip and retains linked audio',()=>{
  const state=useProjectStore.getState(),track=state.project.tracks[0],clip={id:'movie',videoTrackId:'middle',startTime:1,duration:2,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut' as const,transitionDuration:0,linkGroup:'pair'};
  const audio={id:'audio',trackId:track.id,sourceId:'s',startTime:1,duration:2,sourceOffset:0,fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear' as const,fadeOutCurve:'linear' as const,gain:1,effects:[],name:'A',color:'#fff',linkGroup:'pair'};
  useProjectStore.setState({project:{...state.project,tracks:[{...track,segments:[audio]},...state.project.tracks.slice(1)],video:{path:'camera.mp4',duration:6,tracks:['upper','middle','picture'].map(id=>({id,name:id,visible:true,locked:false,rippleEnabled:true})),clips:[clip]}},selection:{startTime:1,endTime:3,segmentIds:['movie','audio']}});
  selectPictureTimelineTrack('picture',true);
  expect(useProjectStore.getState().selection?.trackIds).toEqual(['middle','picture']);
  expect(useProjectStore.getState().selection?.segmentIds).toEqual(expect.arrayContaining(['movie','audio']));
  expect(useProjectStore.getState().selection?.trackAnchorId).toBe('middle');
  selectPictureTimelineTrack('upper');expect(useProjectStore.getState().selection?.trackIds).toEqual(['upper']);expect(useProjectStore.getState().selection?.segmentIds).toEqual([]);
 });
 it('ignores a removed target and uses the new project for a fresh selection',()=>{
  const tracks=useProjectStore.getState().project.tracks;selectTimelineTrack(tracks[0].id);
  const selection=useProjectStore.getState().selection;selectTimelineTrack('missing',true);expect(useProjectStore.getState().selection).toBe(selection);
  useProjectStore.setState({...useProjectStore.getInitialState()});useProjectStore.getState().addTrack('New');const id=useProjectStore.getState().project.tracks[0].id;selectTimelineTrack(id,true);expect(useProjectStore.getState().selection?.trackIds).toEqual([id]);
 });
});
