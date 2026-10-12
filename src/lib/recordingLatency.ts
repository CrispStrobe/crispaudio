/** A short tapered chirp gives an identifiable round-trip calibration reference. */
export function calibrationSignal(rate:number):Float32Array<ArrayBuffer>{
 const length=Math.round(rate*.08),signal=new Float32Array(length);
 for(let i=0;i<length;i++){const t=i/rate,window=Math.sin(Math.PI*i/(length-1))**2;signal[i]=.06*window*Math.sin(2*Math.PI*(700*t+.5*(1700/.08)*t*t));}return signal;
}
/** Normalized correlation rejects absent/ambiguous loopback instead of guessing. */
export async function measuredLatency(samples:Float32Array,reference:Float32Array,expected:number,rate:number,signal?:AbortSignal):Promise<{milliseconds:number;confidence:number}>{
 const stride=4,start=Math.max(0,Math.round(expected-rate*.025)),end=Math.min(samples.length-reference.length,Math.round(expected+rate*.75));
 if(end<=start)throw new Error('recording.calibrationMissing');
 const correlation=(offset:number,step:number)=>{let dot=0,a=0,b=0;for(let i=0;i<reference.length;i+=step){const x=reference[i],y=samples[offset+i];dot+=x*y;a+=x*x;b+=y*y;}return a&&b?Math.abs(dot)/Math.sqrt(a*b):0;};
 const candidates:{offset:number;score:number}[]=[];let best={offset:start,score:0};
 for(let offset=start;offset<=end;offset+=stride){signal?.throwIfAborted();const score=correlation(offset,stride);candidates.push({offset,score});if(score>best.score)best={offset,score};if((offset-start)%(stride*512)===0)await new Promise(resolve=>setTimeout(resolve,0));}
 for(let offset=Math.max(start,best.offset-stride);offset<=Math.min(end,best.offset+stride);offset++){const score=correlation(offset,1);if(score>best.score)best={offset,score};}
 const alternate=Math.max(0,...candidates.filter(c=>Math.abs(c.offset-best.offset)>rate*.004).map(c=>c.score));
 if(best.score<.35||best.score-alternate<.03)throw new Error('recording.calibrationMissing');
 return {milliseconds:(best.offset-expected)/rate*1000,confidence:best.score};
}
