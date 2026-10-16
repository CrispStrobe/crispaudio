import {expect,it} from 'vitest';
import {shapeEnvelopeSegment} from '../../../src/lib/shapeEnvelope';
import {reviewedShapeForPoint} from '../../../src/lib/automationShapeMetadata';
import type {GainPoint} from '../../../src/types/audio';
const bounds={rate:48000,minimum:0,maximum:2000,endTime:10};
it('shapes raw Hz without changing outside segments or endpoint metadata and reopens intact interiors',()=>{
 const points:GainPoint[]=[{time:0,value:100,curve:'step'},{time:2,value:200},{time:4,value:1800,curve:'step'},{time:8,value:900}],copy=structuredClone(points),next=shapeEnvelopeSegment(points,2,'ease-in',bounds);expect(next[0]).toBe(points[0]);expect(next.at(-2)).toBe(points[2]);expect(next.at(-1)).toBe(points[3]);expect(next[9].value).toBe(600);expect(reviewedShapeForPoint(next,8)?.b).toBe(points[2]);expect(points).toEqual(copy);
});
it('keeps linear and flat no-ops by reference and rejects bad bounds/custom controls',()=>{
 const points=[{time:1,value:200},{time:3,value:1800}];expect(shapeEnvelopeSegment(points,1,'linear',bounds)).toBe(points);const flat=[{time:1,value:200},{time:3,value:200}];expect(shapeEnvelopeSegment(flat,1,'s-curve',bounds)).toBe(flat);for(const bad of [{...bounds,rate:0},{...bounds,endTime:2},{...bounds,maximum:100},{...bounds,minimum:NaN}])expect(()=>shapeEnvelopeSegment(points,1,'ease-out',bad)).toThrow();expect(()=>shapeEnvelopeSegment(points,1,'custom',bounds,{x1:.9,x2:.2,y1:0,y2:1})).toThrow('invalidShapeControls');
});
it('rejects cap overflow and sub-two-sample spans atomically',()=>{
 const points=Array.from({length:100000},(_,i)=>({time:i/1000,value:i%2?200:1800}));expect(()=>shapeEnvelopeSegment(points,1,'ease-in',{...bounds,endTime:100})).toThrow('recordLimit');expect(points).toHaveLength(100000);expect(()=>shapeEnvelopeSegment([{time:0,value:0},{time:1/48000,value:1}],0,'ease-in',{...bounds,maximum:1})).toThrow('shapeBounds');
});
