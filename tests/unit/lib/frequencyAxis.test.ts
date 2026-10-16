import {expect,it} from 'vitest';
import {frequencyPosition,positionFrequency} from '../../../src/audio/utils/frequencyAxis';
it.each(['linear','log'] as const)('keeps display, band bounds and pointer selection aligned on a %s frequency axis',scale=>{
 for(const nyquist of [4000,22050,24000,96000]){
  expect(frequencyPosition(0,nyquist,scale)).toBe(0);expect(frequencyPosition(nyquist,nyquist,scale)).toBe(1);
  for(const hz of [0,50,100,1000,Math.min(3500,nyquist),nyquist])expect(positionFrequency(frequencyPosition(hz,nyquist,scale),nyquist,scale)).toBeCloseTo(hz,7);
  expect(positionFrequency(-1,nyquist,scale)).toBe(0);expect(positionFrequency(2,nyquist,scale)).toBeCloseTo(nyquist,7);
 }
});
it('gives low-frequency selections useful screen space without losing DC',()=>{const height=160,nyquist=24000;expect(height*(frequencyPosition(1000,nyquist,'log')-frequencyPosition(100,nyquist,'log'))).toBeGreaterThan(45);expect(frequencyPosition(1000,nyquist,'linear')*height).toBeLessThan(7);});
