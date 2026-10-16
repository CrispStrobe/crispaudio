/** Original deterministic test signals, not recordings of speech or instruments. */
export function restorationMaterial(rate:number,kind:'voice'|'percussion'|'chirp',seconds=3){
 let phase=0,seed=193;return Float32Array.from({length:Math.round(rate*seconds)},(_,i)=>{
  const t=i/rate,syllable=t%.37,envelope=Math.sin(Math.PI*Math.min(1,syllable/.28))**2*(syllable<.28?1:0);
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;
  if(kind==='voice'){phase+=2*Math.PI*(145+28*Math.sin(2*Math.PI*2.3*t))/rate;return envelope*(.2*Math.sin(phase)+.075*Math.sin(phase*3)+.035*Math.sin(phase*7))+.008*noise*envelope;}
  if(kind==='percussion'){const beat=t%.31;return .34*Math.exp(-beat*42)*Math.sin(2*Math.PI*(680*beat+3*(1-Math.exp(-beat*35))))+.08*noise*Math.exp(-beat*110);}
  // Sweeps avoid the separately injected 3–4 kHz interference band.
  phase+=2*Math.PI*(350+1100*(t/seconds)**2)/rate;return .27*Math.sin(phase)*Math.sin(Math.PI*t/seconds)**2;
 });
}
export function errorEnergy(actual:Float32Array,reference:Float32Array,start=0,end=actual.length){let sum=0;for(let i=start;i<end;i++)sum+=(actual[i]-reference[i])**2;return sum;}
export function improvement(before:Float32Array,after:Float32Array,reference:Float32Array,start=0,end=before.length){return 10*Math.log10(errorEnergy(before,reference,start,end)/Math.max(1e-30,errorEnergy(after,reference,start,end)));}
