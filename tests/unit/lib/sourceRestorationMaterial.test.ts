import {describe,it,expect} from 'vitest';
import {restoreSource,DEFAULT_RESTORATION} from '../../../src/lib/sourceRestoration';
import {restorationMaterial,improvement,errorEnergy} from '../../fixtures/restorationMaterial';

describe('restoration with nonstationary deterministic material',()=>{
 it.each([8000,44100,48000,96000,192000])('reduces mains on a changing voice-like signal at %i Hz',rate=>{
  const clean=restorationMaterial(rate,'voice'),damaged=clean.map((v,i)=>v+.07*Math.sin(2*Math.PI*50*i/rate)+.04*Math.cos(2*Math.PI*100*i/rate));
  const result=restoreSource([damaged],[{start:0,end:clean.length}],rate,-1,{...DEFAULT_RESTORATION,harmonics:2}).channels[0];
  expect(improvement(damaged,result,clean,rate/2,rate*2.5)).toBeGreaterThan(22);
  expect(result.every(Number.isFinite)).toBe(true);
 });
 it.each(['voice','percussion','chirp'] as const)('reduces band interference while bounding damage on %s',kind=>{
  const rate=48000,clean=restorationMaterial(rate,kind),damaged=clean.map((v,i)=>v+.07*Math.sin(2*Math.PI*3500*i/rate)),range={start:24000,end:120000},settings={...DEFAULT_RESTORATION,kind:'spectral' as const,low:3000,high:4000,reduction:24};
  const result=restoreSource([damaged,clean],[range],rate,0,settings).channels;
  expect(improvement(damaged,result[0],clean,range.start+2400,range.end-2400)).toBeGreaterThan(kind==='percussion'?8:18);
  expect(result[0].subarray(0,range.start)).toEqual(damaged.subarray(0,range.start));expect(result[0].subarray(range.end)).toEqual(damaged.subarray(range.end));expect(result[1]).toEqual(clean);
  const cleanProcessed=restoreSource([clean],[range],rate,-1,settings).channels[0];
  expect(errorEnergy(cleanProcessed,clean)/Math.max(1e-30,errorEnergy(clean,new Float32Array(clean.length)))).toBeLessThan(kind==='percussion'?.08:.008);
 });
 it.each(['voice','percussion','chirp'] as const)('checks reconstruction error on clipped %s',kind=>{
  const rate=48000,clean=restorationMaterial(rate,kind),ceiling=.16,damaged=clean.map(v=>Math.max(-ceiling,Math.min(ceiling,v))),result=restoreSource([damaged],[{start:0,end:clean.length}],rate,-1,{...DEFAULT_RESTORATION,kind:'declip',ceiling:20*Math.log10(ceiling)});
  expect(improvement(damaged,result.channels[0],clean)).toBeGreaterThan(0);
  for(let i=0;i<clean.length;i++)if(Math.abs(damaged[i])<Math.fround(ceiling))expect(result.channels[0][i]).toBe(damaged[i]);
 });
});
