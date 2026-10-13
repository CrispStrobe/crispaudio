import {it,expect} from 'vitest';
import {navigateClip,placeClips} from '../../../src/lib/clipNavigation';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {AudioSegment,TimelineProject} from '../../../src/types/audio';
const clip=(id:string,trackId:string,start:number):AudioSegment=>({id,trackId,startTime:start,duration:1,sourceOffset:0,sourceId:'source',name:id,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear',color:'#fff'});
const p=():TimelineProject=>({...useProjectStore.getInitialState().project,tracks:['a','b','c'].map((id,i)=>({id,name:id,volume:1,pan:0,muted:false,solo:false,segments:[clip(id,id,i*2)]}))});
it('navigation follows visible clips and skips collapsed tracks in both axes',()=>{
 const project=p(),selection={startTime:0,endTime:1,segmentIds:['a']};expect(navigateClip(project,selection,0,1)?.selection?.segmentIds).toEqual(['b']);expect(navigateClip(project,selection,0,1,true)?.selection?.segmentIds).toEqual(['b']);const collapsed={...project,trackFolders:[{id:'folder',name:'hidden',collapsed:true,trackIds:['b']}]};expect(navigateClip(collapsed,selection,0,1,true)?.selection?.segmentIds).toEqual(['c']);expect(navigateClip(project,selection,0,-1)).toBeUndefined();
});
it('precise placement preserves offsets/links, rejects invalid and locked moves and retains no-op identity',()=>{
 const project=p();project.tracks[0].segments[0].linkGroup='av';project.tracks[2].segments[0].linkGroup='av';const next=placeClips(project,['a'],1.234567);expect(next.tracks[0].segments[0].startTime).toBe(1.234567);expect(next.tracks[2].segments[0].startTime).toBeCloseTo(5.234567);expect(next.tracks[1].segments[0].startTime).toBe(2);expect(placeClips(project,['a'],0)).toBe(project);expect(()=>placeClips(project,['a'],NaN)).toThrow();expect(()=>placeClips(project,['a'],-1)).toThrow();project.tracks[2].locked=true;expect(()=>placeClips(project,['a'],1)).toThrow('trimEdits.locked');expect(project.tracks[0].segments[0].startTime).toBe(0);
});
