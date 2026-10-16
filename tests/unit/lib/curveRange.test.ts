import {expect,it} from 'vitest';
import {copyCurveRange,pasteCurveRange} from '../../../src/lib/curveRange';
import {gainAt} from '../../../src/lib/mixAutomation';
import type {GainPoint} from '../../../src/types/audio';
const points:GainPoint[]=[{time:0,value:.1},{time:2,value:.5,curve:'step'},{time:4,value:.9},{time:8,value:.3}];
it('copies relative endpoints, outgoing Step and independent full-precision points',()=>{
 const result=copyCurveRange(points,.2,1,5,1);expect(result.duration).toBe(4);expect(result.points).toEqual([{time:0,value:gainAt(points,1)},{time:1,value:.5,curve:'step'},{time:3,value:.9},{time:4,value:.75}]);result.points[1].value=.2;expect(points[1].value).toBe(.5);
});
it('captures empty static values and a selected Step interval',()=>{
 expect(copyCurveRange([],1.23456789,2,3,8).points).toEqual([{time:0,value:1.23456789},{time:1,value:1.23456789}]);expect(copyCurveRange(points,.2,2.5,3.5,1).points).toEqual([{time:0,value:.5,curve:'step'},{time:1,value:.5}]);
});
it('stretches time without rescaling values and protects both exterior guards',()=>{
 const envelope=copyCurveRange(points,.2,0,4,1),before:GainPoint[]=[{time:0,value:.8},{time:8,value:.2}],next=pasteCurveRange(before,.2,envelope,2,2,48000,1,8);
 for(const t of [0,1,2-1/48000,4+1/48000,6,8])expect(gainAt(next,t)).toBeCloseTo(gainAt(before,t),12);
 for(const t of [2,2.5,3,3.5,4])expect(gainAt(next,t)).toBeCloseTo(gainAt(points,(t-2)*2),12);expect(next.find(p=>p.time===3)?.curve).toBe('step');expect(before).toEqual([{time:0,value:.8},{time:8,value:.2}]);
});
it('keeps no-op pastes as the original reference, including static empty curves',()=>{
 expect(pasteCurveRange(points,.2,copyCurveRange(points,.2,1,5,1),1,4,48000,1,8)).toBe(points);const empty:GainPoint[]=[];expect(pasteCurveRange(empty,.7,copyCurveRange(empty,.7,0,2,1),3,2,48000,1,8)).toBe(empty);
});
it.each([NaN,-1,Infinity])('rejects invalid clocks %s without changing input',time=>{
 const before=structuredClone(points);expect(()=>copyCurveRange(points,.2,time,5,1)).toThrow();expect(()=>pasteCurveRange(points,.2,{duration:2,points:[{time:0,value:.5},{time:2,value:.9}]},time,2,48000,1,8)).toThrow();expect(points).toEqual(before);
});
it('rejects out-of-bounds values, clocks, short spans and over-limit envelopes',()=>{
 const good=copyCurveRange(points,.2,0,2,1);for(const length of [NaN,0,1/96000,9])expect(()=>pasteCurveRange(points,.2,good,1,length,48000,1,8)).toThrow();expect(()=>pasteCurveRange(points,.2,{duration:2,points:[{time:0,value:2},{time:2,value:.5}]},1,2,48000,1,8)).toThrow();expect(()=>copyCurveRange([{time:0,value:NaN}],.2,0,2,1)).toThrow();expect(()=>copyCurveRange(Array.from({length:100001},(_,i)=>({time:i,value:.5})),.2,0,2,1)).toThrow();
});
