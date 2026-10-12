import {it,expect} from 'vitest';
import {capturedTakes} from '../../../src/lib/capturedTakes';
it('maps input frames to a compensated punch window without changing the original',()=>{
 const takes=capturedTakes({firstFrame:48000,frames:48000*6,sampleRate:48000,passes:[{frame:48000,timeline:0}],sourceId:'s',name:'Take',latencyMs:100,window:{start:2,end:4},notes:[],droppedFrames:0});
 expect(takes).toHaveLength(1);expect(takes[0]).toMatchObject({sourceId:'s',startTime:2,duration:2,sourceOffset:2.1,latencyMs:100});
});
it('splits loop takes at actual audio-clock restart frames and keeps later passes',()=>{
 const takes=capturedTakes({firstFrame:0,frames:48000*3,sampleRate:48000,passes:[{frame:0,timeline:1},{frame:48480,timeline:1},{frame:96000,timeline:1}],sourceId:'s',name:'Take',latencyMs:0,window:{start:1,end:2},notes:['device-change'],droppedFrames:128});
 expect(takes).toHaveLength(3);takes.forEach((take,i)=>expect(take.sourceOffset).toBeCloseTo([0,1.01,2][i],10));expect(takes[0].duration).toBe(1);expect(takes[1].duration).toBeCloseTo(.99);expect(takes[2].notes).toEqual(['device-change']);
});
it('clamps compensated placement at zero while retaining the full capture',()=>{
 const take=capturedTakes({firstFrame:0,frames:48000,sampleRate:48000,passes:[{frame:0,timeline:0}],sourceId:'s',name:'Take',latencyMs:100,notes:[],droppedFrames:0})[0];expect(take.startTime).toBe(0);expect(take.sourceOffset).toBe(.1);expect(take.duration).toBe(.9);
});
