import {it,expect} from 'vitest';
import {calibrationSignal,measuredLatency} from '../../../src/lib/recordingLatency';
it('measures a delayed quieter loopback to one sample',async()=>{
 const rate=48000,reference=calibrationSignal(rate),samples=new Float32Array(rate),expected=4800,delay=3210;samples.set(reference.map(v=>v*.3),expected+delay);const result=await measuredLatency(samples,reference,expected,rate);expect(result.milliseconds).toBeCloseTo(delay/rate*1000,6);expect(result.confidence).toBeGreaterThan(.99);
});
it('rejects silence and ambiguous repeated responses',async()=>{
 const rate=48000,reference=calibrationSignal(rate),samples=new Float32Array(rate);await expect(measuredLatency(samples,reference,0,rate)).rejects.toThrow(/calibrationMissing/);samples.set(reference,4800);samples.set(reference,14400);await expect(measuredLatency(samples,reference,0,rate)).rejects.toThrow(/calibrationMissing/);
});
