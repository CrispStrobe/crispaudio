import {describe,it,expect} from 'vitest';
import {signalLevels} from '../../../src/lib/mixer';
describe('signal meters',()=>{
  it('measures signed peak and RMS without cancelling opposite samples',()=>{
    const result=signalLevels(new Float32Array([1,-1,0,0]));
    expect(result.peak).toBe(1);expect(result.rms).toBeCloseTo(Math.sqrt(.5));
  });
  it('handles silence and empty buffers',()=>{
    expect(signalLevels(new Float32Array())).toEqual({peak:0,rms:0});
    expect(signalLevels(new Float32Array(2048))).toEqual({peak:0,rms:0});
  });
});
