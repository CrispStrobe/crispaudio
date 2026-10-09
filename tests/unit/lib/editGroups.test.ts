import {beforeEach,expect,it} from 'vitest';
import {nameEditGroup,linkedIds,moveClips,splitClips,linkClips} from '../../../src/lib/projectEdits';
import {editTimeRange} from '../../../src/lib/rangeEdits';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {TimelineProject} from '../../../src/types/audio';
const clip={id:'a',trackId:'t',sourceId:'s',linkGroup:'source-a',startTime:0,duration:2,sourceOffset:0,gain:1,name:'a',color:'#fff',effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear' as const,fadeOutCurve:'linear' as const};
function fixture():TimelineProject{return {id:'p',name:'p',sampleRate:48000,duration:6,masterEffects:[],tracks:[{id:'t',name:'Track',muted:false,solo:false,volume:1,pan:0,segments:[clip,{...clip,id:'b',linkGroup:'source-b',startTime:4}]}]};}
beforeEach(()=>{useProjectStore.getState().loadProjectState(fixture(),new Map());useProjectStore.temporal.getState().clear();});
it('names a group without replacing source links and moves all its members',()=>{
 const p=nameEditGroup(fixture(),['a','b'],'Section');expect(p.tracks[0].segments.map(c=>c.linkGroup)).toEqual(['source-a','source-b']);
 expect(linkedIds(p,['a'])).toEqual(['a','b']);const moved=moveClips(p,['a'],1);expect(moved.tracks[0].segments.map(c=>c.startTime)).toEqual([1,5]);
 expect(linkedIds({...p,groupEditingEnabled:false},['a'])).toEqual(['a']);
});
it('splits retain named membership, while unlink only removes source links',()=>{
 const p=nameEditGroup(fixture(),['a','b'],'Section'),split=splitClips(p,['a'],1);
 expect(split.tracks[0].segments).toHaveLength(3);expect(new Set(split.tracks[0].segments.map(c=>c.editGroup?.id)).size).toBe(1);
 const unlinked=linkClips(p,['a'],true);expect(unlinked.tracks[0].segments[0].linkGroup).toBeUndefined();expect(unlinked.tracks[0].segments[1].linkGroup).toBe('source-b');expect(unlinked.tracks[0].segments[0].editGroup?.name).toBe('Section');
});
it('selection and direct moves include groups; pasted copies have independent identities',()=>{
 const p=nameEditGroup(fixture(),['a','b'],'Section');useProjectStore.getState().loadProjectState(p,new Map());
 useProjectStore.getState().selectSegment('a');expect(useProjectStore.getState().selection).toMatchObject({startTime:0,endTime:6,segmentIds:['a','b']});
 useProjectStore.getState().moveSegment('a',1);expect(useProjectStore.getState().project.tracks[0].segments.map(c=>c.startTime)).toEqual([1,5]);
 useProjectStore.getState().copy();useProjectStore.getState().paste(10);
 const all=useProjectStore.getState().project.tracks[0].segments;expect(all[2].editGroup?.id).not.toBe(all[0].editGroup?.id);expect(all[2].editGroup?.id).toBe(all[3].editGroup?.id);
});
it('rejects indirect changes to locked group members and preserves undo',()=>{
 const p=nameEditGroup(fixture(),['a','b'],'Section');p.tracks.push({...p.tracks[0],id:'locked',locked:true,segments:[{...p.tracks[0].segments[1],id:'locked-b',trackId:'locked'}]});
 useProjectStore.getState().loadProjectState(p,new Map());useProjectStore.temporal.getState().clear();const before=useProjectStore.getState().project;
 useProjectStore.getState().moveSegment('a',1);expect(useProjectStore.getState().project).toBe(before);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
});
it('range scope protects named groups until group editing is explicitly disabled',()=>{
 const p=fixture();p.tracks.push({...p.tracks[0],id:'other',segments:[{...clip,id:'other-a',trackId:'other',linkGroup:undefined}]});
 const grouped=nameEditGroup(p,['a','other-a'],'Group');expect(()=>editTimeRange(grouped,.5,1,'extract',{trackIds:['t']})).toThrow('groupScope');
 expect(editTimeRange({...grouped,groupEditingEnabled:false},.5,1,'extract',{trackIds:['t']}).tracks[1]).toBe(grouped.tracks[1]);
 expect(JSON.parse(JSON.stringify(grouped)).tracks[0].segments[0].editGroup.name).toBe('Group');
});
it('rejects empty selection or invalid group names',()=>{expect(()=>nameEditGroup(fixture(),[],'Name')).toThrow('invalid');expect(()=>nameEditGroup(fixture(),['a'],' ')).toThrow('invalid');});
