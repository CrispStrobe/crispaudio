import { describe, expect, it } from 'vitest';
import { audibleTracks, timelineDuration } from '../../src/lib/timelineView';
import { analysisTrack, shiftedTrack, syncPayload } from '../../src/lib/trackSync';
import type { TimelineTrack, TimelineProject, AudioSource } from '../../src/types/audio';
const track=(id:string,muted=false,solo=false)=>({id,muted,solo,segments:[]} as unknown as TimelineTrack);
describe('generic timeline behavior',()=>{
  it('solo temporarily overrides mute and restores saved mix afterward',()=>{
    const a=track('a'),b=track('b',true,true),c=track('c',false,true);
    expect(audibleTracks([a,b,c])).toEqual([b,c]);expect(b.muted).toBe(true);
    b.solo=false;c.solo=false;expect(audibleTracks([a,b,c])).toEqual([a,c]);
  });
  it('fits picture and the longest audio clip, without trusting stale duration',()=>{
    expect(timelineDuration({duration:1,video:{duration:20},tracks:[{segments:[{startTime:18,duration:12}]}]} as TimelineProject)).toBe(30);
  });
  it('moves target audio earlier by offset, trims before zero, and preserves source audio',()=>{
    const original={...track('a'),segments:[{id:'clip',startTime:1,sourceOffset:3,duration:5,fadeInDuration:1,fadeOutDuration:1}]} as TimelineTrack;
    const shifted=shiftedTrack(original,2);
    expect(shifted.segments[0]).toMatchObject({startTime:0,sourceOffset:4,duration:4});
    expect(original.segments[0].startTime).toBe(1);
  });
  it('analyzes clip positions and source trims before mute or gain',()=>{
    const t={...track('a',true),segments:[{sourceId:'s',startTime:.002,sourceOffset:.001,duration:.002}]} as TimelineTrack;
    const source={buffer:{getChannelData:()=>new Float32Array([1,2,3,4])},sampleRate:1000} as unknown as AudioSource;
    expect([...analysisTrack(t,new Map([['s',source]]))]).toEqual([0,0,2,3]);
    const bytes=syncPayload(new Float32Array([1,-1]),new Float32Array([.5]));const view=new DataView(bytes.buffer);
    expect(view.getUint32(0,true)).toBe(2);expect(view.getFloat32(12,true)).toBe(.5);
  });
});
