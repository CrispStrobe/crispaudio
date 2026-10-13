import {it,expect} from 'vitest';
import {visibleTrackRows,saveTrackFolder,validTrackFolders,folderControl,folderSelection} from '../../../src/lib/trackFolders';
import {useProjectStore} from '../../../src/stores/projectStore';
import {playbackGraphKey} from '../../../src/lib/playbackGraphKey';
import type {TimelineProject} from '../../../src/types/audio';
const project=()=>({...useProjectStore.getInitialState().project,tracks:['a','b','c'].map(id=>({id,name:id,segments:[],volume:1,pan:0,muted:false,solo:false}))});
it('folder rows are contiguous and collapse only changes presentation, with stable cached geometry',()=>{
 const p=project(),next=saveTrackFolder(p,'Group',['a','c'],'folder');expect(visibleTrackRows(next).map(t=>t.id)).toEqual(['folder','a','c','b']);expect(visibleTrackRows(next)).toBe(visibleTrackRows(next));expect(visibleTrackRows({...next,name:'Changed'})).toBe(visibleTrackRows(next));expect(next.tracks).toBe(p.tracks);expect(playbackGraphKey(next)).toBe(playbackGraphKey(p));
 const collapsed={...next,trackFolders:next.trackFolders.map(f=>({...f,collapsed:true}))};expect(visibleTrackRows(collapsed).map(t=>t.id)).toEqual(['folder','b']);expect(collapsed.tracks).toBe(p.tracks);
});
it('membership moves between folders, rejects duplicate/unknown members and ID collisions',()=>{
 const p=saveTrackFolder(project(),'One',['a','b'],'one'),next=saveTrackFolder(p,'Two',['b','c'],'two');expect(next.trackFolders?.[0].trackIds).toEqual(['a']);expect(validTrackFolders(next)).toBe(true);
 expect(()=>saveTrackFolder(p,'Bad',['a','a'])).toThrow();expect(()=>saveTrackFolder(p,'Bad',['missing'])).toThrow();expect(()=>saveTrackFolder(p,'Bad',['a'],'a')).toThrow();expect(validTrackFolders({...p,trackFolders:[...p.trackFolders!,p.trackFolders![0]]})).toBe(false);
});
it('shared controls change all members once, retain routing and reject any locked member',()=>{
 const p=saveTrackFolder(project(),'Group',['a','c'],'folder'),next=folderControl(p,'folder','muted');expect(next.tracks.map(t=>t.muted)).toEqual([true,false,true]);expect(folderControl(next,'folder','muted').tracks.map(t=>t.muted)).toEqual([false,false,false]);p.tracks[2].locked=true;expect(()=>folderControl(p,'folder','solo')).toThrow('recording.locked');expect(p.tracks.every(t=>!t.solo)).toBe(true);
});
it('folder clip selection includes linked partners and dissolving/removing tracks preserves clips',()=>{
 const clip={id:'clip',trackId:'a',sourceId:'src',startTime:0,duration:1,linkGroup:'linked'};const p=project() as TimelineProject;p.tracks[0].segments=[clip as never];p.tracks[1].segments=[{...clip,id:'partner',trackId:'b'} as never];const next=saveTrackFolder(p,'Group',['a'],'folder');expect(folderSelection(next,'folder')?.segmentIds.sort()).toEqual(['clip','partner']);useProjectStore.getState().loadProjectState(next,new Map());useProjectStore.getState().removeTrack('a');expect(useProjectStore.getState().project.trackFolders).toEqual([]);expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(1);
});


it('selects empty folder members without adding a project edit',()=>{const p=saveTrackFolder(project(),'Empty',['a','c'],'empty'),s=folderSelection(p,'empty');expect(s?.trackIds).toEqual(['a','c']);expect(s?.segmentIds).toEqual([]);expect(s?.startTime).toBe(0);expect(folderSelection(p,'missing')).toBeNull();});
