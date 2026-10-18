import {describe,it,expect} from 'vitest';
import {matchSourceAudition} from '../../src/audio/engine/SourceAuditionMatch';
const rate=48000;
const tone=(gain:number,seconds=.5)=>Float32Array.from({length:rate*seconds},(_,i)=>gain*Math.sin(2*Math.PI*440*i/rate));
const compare=(a:Float32Array[],b:Float32Array[],signal=new AbortController().signal)=>matchSourceAudition(a,b,[{start:0,end:a[0].length}],rate,signal);
describe('monitor-only source loudness matching',()=>{
 it('attenuates the louder version without modifying either source',async()=>{const a=tone(.2),b=tone(.4),copy=b.slice(),result=(await compare([a],[b]))!;expect(result.original).toBe(1);expect(result.preview).toBeCloseTo(.5,5);expect(b).toEqual(copy);});
 it('shares peak headroom so the comparison remains matched',async()=>{const result=(await compare([tone(2)],[tone(4)]))!;expect(result.original/result.preview).toBeCloseTo(2);expect(2*result.original).toBeCloseTo(10**(-1/20));expect(4*result.preview).toBeCloseTo(10**(-1/20));});
 it('measures selected ranges only and preserves stereo balance',async()=>{const a=tone(.1,1),b=a.slice();b.fill(10,rate/2);const result=await matchSourceAudition([a,a],[b,b],[{start:0,end:rate/2}],rate,new AbortController().signal);expect(result).toEqual({original:1,preview:1});});
 it('does not boost silence, sub-gate signals, short selections or unsupported layouts',async()=>{expect(await compare([tone(.2)],[tone(0)])).toBeNull();expect(await compare([tone(.2)],[tone(1e-8)])).toBeNull();expect(await compare([tone(.2,.1)],[tone(.4,.1)])).toBeNull();expect(await compare([tone(.1),tone(.1),tone(.1)],[tone(.2),tone(.2),tone(.2)])).toBeNull();});
 it('rejects non-finite PCM and mismatched channel lengths',async()=>{const broken=tone(.2);broken[10]=NaN;await expect(compare([broken],[tone(.2)])).rejects.toThrow('Non-finite');await expect(compare([tone(.2)],[tone(.2,.1)])).rejects.toThrow('invalidPcm');});
 it('cancels between chunks rather than publishing a stale result',async()=>{const controller=new AbortController(),job=compare([tone(.2,2)],[tone(.4,2)],controller.signal);controller.abort();await expect(job).rejects.toMatchObject({name:'AbortError'});});
});
