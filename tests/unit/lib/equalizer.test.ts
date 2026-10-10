import {describe,it,expect} from 'vitest';
import {eqResponse,eqParameters} from '../../../src/lib/equalizer';
import type {EffectConfig} from '../../../src/types/audio';
const band=(type:EffectConfig['type'],params:Record<string,number>):EffectConfig=>({type,enabled:true,params});
describe('Web Audio EQ response',()=>{
 it('bell centre matches requested boost and cut',()=>{
  for(const gain of [-24,-6,0,6,24])expect(eqResponse([band('peaking',{freq:1000,gain,q:.7})],[1000],48000)[0]).toBeCloseTo(gain,8);
 });
 it('equal boost/cut bell pairs cancel at every frequency',()=>{
  for(const f of [20,100,500,1000,3000,20000])expect(eqResponse([band('peaking',{freq:500,gain:12,q:2}),band('peaking',{freq:500,gain:-12,q:2})],[f],48000)[0]).toBeCloseTo(0,8);
 });
 it('shelves have the specified asymptotic gain and fixed slope',()=>{
  const lows=band('lowshelf',{freq:1000,gain:12}),highs=band('highshelf',{freq:1000,gain:12});
  expect(eqResponse([lows],[1],48000)[0]).toBeCloseTo(12,5);
  expect(eqResponse([highs],[23999],48000)[0]).toBeCloseTo(12,5);
  expect(eqResponse([lows],[1000],48000)[0]).toBeCloseTo(6,8);
  expect(eqResponse([highs],[1000],48000)[0]).toBeCloseTo(6,8);
 });
 it('preserves pass filter dB Q and omits bypassed/unrelated effects',()=>{
  expect(eqResponse([band('lowpass',{freq:1000,q:6})],[1000],48000)[0]).toBeCloseTo(6,8);
  expect(eqResponse([{...band('peaking',{gain:12}),enabled:false},band('delay',{mix:1})],[100,1000],48000)).toEqual([0,0]);
 });
 it('clamps new parameters and obeys sample-rate Nyquist',()=>{
  expect(eqParameters('peaking',{freq:30000,gain:40,q:0},32000)).toEqual({freq:16000,gain:24,q:.1});
 });
});
