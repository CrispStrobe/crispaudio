import {expect,it,vi} from 'vitest';
import {editGainPoint,gainAt,normalizeGainPoints,scheduleGain,micAutomation} from '../../../src/lib/mixAutomation';
import {useProjectStore} from '../../../src/stores/projectStore';
it('holds endpoints, defaults to unity and interpolates linear gain rather than dB',()=>{
 const points=[{time:2,value:0},{time:4,value:2}];
 expect(gainAt(undefined,3)).toBe(1);expect(gainAt(points,0)).toBe(0);expect(gainAt(points,3)).toBe(1);expect(gainAt(points,10)).toBe(2);
});
it('uses the last supplied duplicate at zero and inside an envelope, including scheduling on seek',()=>{
 const points=[{time:2,value:4},{time:0,value:1},{time:0,value:0},{time:2,value:2}];
 expect(normalizeGainPoints(points)).toEqual([{time:0,value:0},{time:2,value:2}]);
 expect(gainAt(points,0)).toBe(0);expect(gainAt(points,1)).toBe(1);
 const param={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()};scheduleGain(param as unknown as AudioParam,points,10,1);
 expect(param.setValueAtTime).toHaveBeenCalledWith(1,10);expect(param.linearRampToValueAtTime.mock.calls).toEqual([[2,11]]);
});
it('moving onto a timestamp replaces it without changing the input or creating endpoints',()=>{
 const points=[{time:1,value:0},{time:3,value:1},{time:5,value:2}];
 expect(editGainPoint(points,1,{time:3,value:.5})).toEqual([{time:3,value:.5},{time:5,value:2}]);expect(points).toHaveLength(3);
});
it('preserves microphone crossfade envelopes',()=>{
 const points=micAutomation('a',[{start:0,end:2,trackId:'a',confidence:1},{start:2,end:4,trackId:'b',confidence:1}]);
 expect(gainAt(points,0)).toBe(1);expect(gainAt(points,2)).toBeCloseTo(.5);expect(gainAt(points,3)).toBe(0);
});
it('protects automation through direct store writes and updateTrack on a locked track',()=>{
 const state=useProjectStore.getState();state.addTrack('Locked');const track=useProjectStore.getState().project.tracks.at(-1)!;
 state.updateTrack(track.id,{automation:[{time:0,value:1}],locked:true});
 const before=useProjectStore.getState().project;useProjectStore.temporal.getState().clear();
 state.updateTrack(track.id,{automation:[]});expect(useProjectStore.getState().project).toBe(before);
 useProjectStore.setState({project:{...before,tracks:before.tracks.map(t=>t.id===track.id?{...t,automation:[]}:t)}});
 expect(useProjectStore.getState().project).toBe(before);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
 state.updateTrack(track.id,{locked:false});state.updateTrack(track.id,{automation:[]});expect(useProjectStore.getState().project.tracks.at(-1)!.automation).toEqual([]);
});
