import {it,expect} from 'vitest';
import {LoudnessMeter,finishingGain} from '../../../src/audio/dsp/loudness';
function tone(amplitude:number,frequency=1000,seconds=1){const m=new LoudnessMeter(48000);for(let i=0;i<48000*seconds;i++){const sample=amplitude*Math.sin(2*Math.PI*frequency*i/48000);m.frame(sample,sample);}return m.finish();}
it('measures a stereo 1 kHz -23 LUFS reference and scales with gain',()=>{
  const reading=tone(10**(-23/20));expect(reading.integrated).toBeCloseTo(-23,1);expect(Math.abs(reading.truePeak!+23)).toBeLessThan(.2);
  const quieter=tone(10**(-29/20));expect(quieter.integrated!-reading.integrated!).toBeCloseTo(-6,6);
});
it('gates silence, requires a full 400 ms block and excludes quiet programme blocks',()=>{
  const m=new LoudnessMeter(48000);for(let i=0;i<48000;i++)m.frame(0,0);expect(m.finish().integrated).toBeNull();
  expect(tone(.1,1000,.2).integrated).toBeNull();
  const programme=new LoudnessMeter(48000);for(let i=0;i<48000*4;i++){const sample=(i<48000*2?.1:.0001)*Math.sin(2*Math.PI*1000*i/48000);programme.frame(sample,sample);}expect(programme.finish().integrated).toBeCloseTo(tone(.1,1000,2).integrated!,0);
});
it('detects intersample peaks above sample peaks in a quarter-rate tone',()=>{
  const meter=new LoudnessMeter(48000);let samplePeak=0;
  for(let i=0;i<48000;i++){const sample=Math.sin(2*Math.PI*12000*i/48000+Math.PI/4);samplePeak=Math.max(samplePeak,Math.abs(sample));meter.frame(sample,sample);}
  expect(meter.finish().truePeak!).toBeGreaterThan(20*Math.log10(samplePeak)+2.5);
});
it('limits finishing gain by true peak and rejects unmeasurable or invalid targets',()=>{
  const r={integrated:-24,truePeak:-3,momentary:null,shortTerm:null};expect(finishingGain(r,-16,-1)).toBe(2);expect(finishingGain(r,-30,-1)).toBe(-6);
  expect(()=>finishingGain({...r,integrated:null},-16,-1)).toThrow('loudness.silence');expect(()=>finishingGain(r,0,-1)).toThrow('loudness.invalid');
});
it('live K weighting keeps the calibrated 1 kHz reference at 44.1 and 96 kHz',()=>{
 for(const rate of [44100,96000]){const meter=new LoudnessMeter(rate);for(let i=0;i<rate;i++){const sample=10**(-23/20)*Math.sin(2*Math.PI*1000*i/rate);meter.frame(sample,sample);}expect(Math.abs(meter.finish().integrated!+23)).toBeLessThan(.2);}
});
