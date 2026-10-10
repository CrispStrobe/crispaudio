import {describe,it,expect} from 'vitest';
import {SamplePeakLimiter,limiterParameters,validOutputLimiter} from '../../../src/audio/dsp/samplePeakLimiter';
describe('stereo sample-peak output limiter',()=>{
 it('limits isolated transients immediately and preserves stereo ratio',()=>{
  const limiter=new SamplePeakLimiter(48000);const gain=limiter.step(4,-1);
  expect(4*gain).toBeCloseTo(10**(-1/20),12);expect(4*gain/(-gain)).toBe(-4);expect(limiter.reduction).toBeGreaterThan(12);
 });
 it('leaves under-ceiling audio unchanged without delaying it',()=>{
  const limiter=new SamplePeakLimiter(48000);expect(limiter.step(.1,-.2)).toBe(1);
 });
 it('releases exponentially and bounds changing peaks at different rates',()=>{
  for(const rate of [32000,44100,48000]) {
   const limiter=new SamplePeakLimiter(rate);const initial=limiter.step(4,1);
   for(let i=0;i<rate/10;i++)limiter.step(0,0);
   expect(limiter.gain).toBeCloseTo(1-(1-initial)*Math.exp(-1),10);
   for(let i=0;i<rate;i++){const left=3*Math.sin(i*.17),right=2*Math.cos(i*.11),gain=limiter.step(left,right);expect(Math.max(Math.abs(left*gain),Math.abs(right*gain))).toBeLessThanOrEqual(limiter.ceiling+1e-12);}
  }
 });
 it('clamps supported controls and rejects malformed saved configs',()=>{
  expect(limiterParameters({enabled:true,ceiling:3,release:0})).toEqual({ceiling:0,release:.01});
  expect(validOutputLimiter(undefined)).toBe(true);expect(validOutputLimiter({enabled:true})).toBe(true);
  for(const value of [null,[],{enabled:'true'},{enabled:true,ceiling:NaN},{enabled:true,release:'slow'}])expect(validOutputLimiter(value)).toBe(false);
 });
});
