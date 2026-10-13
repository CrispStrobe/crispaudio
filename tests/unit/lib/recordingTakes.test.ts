import {it,expect} from 'vitest';
import {chooseTake,validRecording} from '../../../src/lib/recordingTakes';
import type {TimelineProject,AudioSource} from '../../../src/types/audio';
const source={id:'captured',duration:10} as AudioSource;
const project=():TimelineProject=>({id:'p',name:'p',duration:6,sampleRate:48000,masterEffects:[],tracks:[{id:'t',name:'Voice',volume:1,pan:0,muted:false,solo:false,takes:[{id:'take',name:'Take 1',sourceId:'captured',sourceOffset:1,startTime:1,duration:4,pass:1,capturedAt:'now',droppedFrames:0,notes:[],latencyMs:0}],segments:[{id:'old',trackId:'t',sourceId:'old-source',name:'Original',startTime:0,duration:6,sourceOffset:0,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear',color:'#fff'}]}]});
it('comp replaces only the selected interval and preserves original takes and project',()=>{
 const p=project(),snapshot=JSON.stringify(p),next=chooseTake(p,'t','take',2,4,0,new Map([['captured',source]]));
 expect(next.tracks[0].segments.map(c=>[c.sourceId,c.startTime,c.duration,c.sourceOffset])).toEqual([['old-source',0,2,0],['captured',2,2,2],['old-source',4,2,4]]);
 expect(JSON.stringify(p)).toBe(snapshot);expect(next.tracks[0].takes).toBe(p.tracks[0].takes);expect(next.tracks[0].compRegions).toHaveLength(1);
});
it('crossfades overlap both boundaries using available source handles',()=>{
 const p=project(),snapshot=JSON.stringify(p),next=chooseTake(p,'t','take',2,4,.2,new Map([['captured',source]])),[left,chosen,right]=next.tracks[0].segments;
 expect(chosen.startTime).toBeCloseTo(1.9);expect(chosen.startTime+chosen.duration).toBeCloseTo(4.1);expect(left.fadeOutDuration).toBeCloseTo(.1);expect(right.fadeInDuration).toBeCloseTo(.1);expect(right.startTime).toBe(4);expect(chosen.fadeInDuration).toBeCloseTo(.1);expect(chosen.fadeOutDuration).toBeCloseTo(.1);expect(JSON.stringify(p)).toBe(snapshot);
});
it('locks and malformed saved takes reject without changing the project',()=>{
 const p=project();expect(validRecording(p,new Set(['captured']))).toBe(true);p.tracks[0].locked=true;expect(()=>chooseTake(p,'t','take',2,4,0,new Map([['captured',source]]))).toThrow(/locked/);p.tracks[0].takes![0].sourceOffset=-1;expect(validRecording(p)).toBe(false);
});
it('changing comp boundaries/crossfades rebuilds from preserved base rather than stacking old crossfade tails',()=>{
 const p=project(),sources=new Map([['captured',source]]),first=chooseTake(p,'t','take',2,4,.2,sources),id=first.tracks[0].compRegions![0].id;
 const next=chooseTake(first,'t','take',2,4,.2,sources,id);expect(next.tracks[0].segments).toHaveLength(3);expect(next.tracks[0].compRegions).toHaveLength(1);expect(next.tracks[0].segments.map(c=>[c.startTime,c.duration,c.fadeInDuration,c.fadeOutDuration])).toEqual(first.tracks[0].segments.map(c=>[c.startTime,c.duration,c.fadeInDuration,c.fadeOutDuration]));
 const narrower=chooseTake(next,'t','take',2.5,3.5,0,sources,id);expect(narrower.tracks[0].segments.map(c=>[c.sourceId,c.startTime,c.duration])).toEqual([['old-source',0,2.5],['captured',2.5,1],['old-source',3.5,2.5]]);
});
it('save reachability keeps alternate takes, comp base and original retime sources without unrelated project media',async()=>{
 const {projectSourceIds}=await import('../../../src/lib/projectFile');const p=project();p.tracks[0].segments[0].retime={rate:1,reverse:false,preservePitch:true,semitones:0,original:{sourceId:'original-retime',offset:0,duration:6}};p.sourceTranscripts=[{id:'record',sourceId:'transcript-original',name:'source',cues:[]}];const ids=projectSourceIds(p);expect([...ids].sort()).toEqual(['captured','old-source','original-retime','transcript-original']);
});
it('removing a region restores the exact base interval and resetting preserves originals',async()=>{
 const {removeCompRegion,resetComp}=await import('../../../src/lib/recordingTakes');
 const p=project(),sources=new Map([['captured',source]]),first=chooseTake(p,'t','take',2,3,.2,sources),next=chooseTake(first,'t','take',3.5,4,.2,sources),id=next.tracks[0].compRegions![0].id;
 const removed=removeCompRegion(next,'t',id,sources);expect(removed.tracks[0].compRegions).toHaveLength(1);expect(removed.tracks[0].segments[0].sourceId).toBe('old-source');expect(removed.tracks[0].segments[0].duration).toBe(3.5);
 const reset=resetComp(removed,'t',sources);expect(reset.tracks[0].segments).toBe(p.tracks[0].segments);expect(reset.tracks[0].takes).toBe(p.tracks[0].takes);expect(reset.tracks[0].compBaseSegments).toBeUndefined();expect(resetComp(reset,'t',sources)).toBe(reset);
 next.tracks[0].locked=true;expect(()=>removeCompRegion(next,'t',id,sources)).toThrow('recording.locked');
});
it('saved comp versions recall choices after reset, remain independent and retime with range edits',async()=>{
 const {saveCompVersion,recallCompVersion,resetComp}=await import('../../../src/lib/recordingTakes'),{recordingRange}=await import('../../../src/lib/recordingRange');
 const p=project(),sources=new Map([['captured',source]]),first=chooseTake(p,'t','take',2,4,.2,sources),saved=saveCompVersion(first,'t','A'),version=saved.tracks[0].compVersions![0];
 expect(version.regions).not.toBe(first.tracks[0].compRegions);expect(recallCompVersion(saved,'t',version.id,sources)).toBe(saved);
 const reset=resetComp(saved,'t',sources),recalled=recallCompVersion(reset,'t',version.id,sources);expect(recalled.tracks[0].segments.map(c=>[c.sourceId,c.startTime,c.duration])).toEqual(first.tracks[0].segments.map(c=>[c.sourceId,c.startTime,c.duration]));
 const shifted=recordingRange(saved.tracks[0],0,1,'insert');expect(shifted.compVersions![0].regions[0].start).toBe(3);expect(shifted.compVersions![0].regions[0].end).toBe(5);
 expect(validRecording(saved)).toBe(true);version.regions[0].takeId='missing';expect(validRecording(saved)).toBe(false);
});
