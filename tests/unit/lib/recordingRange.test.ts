import {it,expect} from 'vitest';
import {recordingRange} from '../../../src/lib/recordingRange';
import type {TimelineTrack} from '../../../src/types/audio';
it('extract maps comp source placements and retains the complete original capture extent',()=>{
 const track={takes:[{id:'take',name:'pass',sourceId:'s',startTime:0,sourceOffset:1,duration:4,pass:1,capturedAt:'now',latencyMs:0,droppedFrames:0,notes:[]}],compRegions:[{id:'comp',takeId:'take',start:0,end:4,crossfade:.04}],compBaseSegments:[]} as unknown as TimelineTrack;
 const next=recordingRange(track,1,2,'extract');expect(next.takes).toHaveLength(2);expect(next.takes![1].startTime).toBe(1);expect(next.takes![1].sourceOffset).toBe(3);expect(next.takes![1].originalPlacement!.duration).toBe(4);expect(next.compRegions![1].takeId).toBe(next.takes![1].id);expect(next.compRegions![1].end).toBe(3);
 const removed=recordingRange(track,0,4,'lift');expect(removed.takes![0].inactive).toBe(true);expect(removed.compRegions).toHaveLength(0);
});
it('an unaffected or locked original placement does not gain metadata merely from a later range edit',()=>{
 const take={id:'take',name:'pass',sourceId:'s',startTime:0,sourceOffset:1,duration:1,pass:1,capturedAt:'now',latencyMs:0,droppedFrames:0,notes:[]};const next=recordingRange({takes:[take]} as unknown as TimelineTrack,2,3,'extract');expect(next.takes![0]).toBe(take);expect(next.takes![0].originalPlacement).toBeUndefined();
});
