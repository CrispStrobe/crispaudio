import {expect,it,vi} from 'vitest';
import {editPanPoint,panAt,normalizePanPoints,schedulePan} from '../../../src/lib/mixAutomation';
import {editTimeRange} from '../../../src/lib/rangeEdits';
import {deserializeProject} from '../../../src/lib/projectFile';
import {useProjectStore} from '../../../src/stores/projectStore';
it('holds signed endpoints, uses static fallback only for empty lanes and keeps the last duplicate',()=>{
 const points=[{time:2,value:1},{time:2,value:-1},{time:4,value:1}];
 expect(panAt(undefined,0,.7)).toBe(.7);expect(panAt(points,0,.7)).toBe(-1);expect(panAt(points,3)).toBe(0);expect(panAt(points,10)).toBe(1);
 expect(normalizePanPoints([...points,{time:5,value:2}])).toHaveLength(2);
 expect(editPanPoint(points,2,{time:4,value:-.5})).toEqual([{time:4,value:-.5}]);
 const param={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()};schedulePan(param as unknown as AudioParam,points,10,3,.7);
 expect(param.setValueAtTime).toHaveBeenCalledWith(0,10);expect(param.linearRampToValueAtTime.mock.calls).toEqual([[1,11]]);
});
it('protects pan points on locked tracks and retimes signed envelopes with range edits',()=>{
 useProjectStore.getState().loadProjectState({...useProjectStore.getInitialState().project,tracks:[]},new Map());useProjectStore.getState().addTrack('Pan');
 let p=useProjectStore.getState().project;const id=p.tracks[0].id;
 useProjectStore.getState().updateTrack(id,{panAutomation:[{time:0,value:-1},{time:10,value:1}]});
 p={...useProjectStore.getState().project,minimumDuration:10};
 const out=editTimeRange(p,3,5,'extract');expect(panAt(out.tracks[0].panAutomation,5)).toBeCloseTo(.4);
 expect(editTimeRange(p,3,5,'lift').tracks[0].panAutomation).toBe(p.tracks[0].panAutomation);
 useProjectStore.getState().updateTrack(id,{locked:true});const before=useProjectStore.getState().project;
 useProjectStore.getState().updateTrack(id,{panAutomation:[]});expect(useProjectStore.getState().project).toBe(before);
 useProjectStore.setState({project:{...before,tracks:before.tracks.map(t=>({...t,panAutomation:[]}))}});expect(useProjectStore.getState().project).toBe(before);
 expect(()=>editTimeRange({...before,minimumDuration:10},3,5,'extract')).toThrow('locked');
});
it('rejects malformed pan lanes before decoding media, while older projects remain readable',async()=>{
 const project={id:'p',tracks:[{panAutomation:[{time:0,value:2}]}]};
 const json=(p:unknown)=>JSON.stringify({format:'crispaudio-project',version:3,project:p,sources:[]});
 await expect(deserializeProject(json(project),{} as BaseAudioContext)).rejects.toThrow('Invalid pan automation');
 await expect(deserializeProject(json({id:'p',tracks:[]}),{} as BaseAudioContext)).resolves.toMatchObject({project:{id:'p'}});
});
