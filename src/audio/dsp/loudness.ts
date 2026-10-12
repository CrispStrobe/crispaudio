// Stereo ITU-R BS.1770 K weighting / two-stage gate and Annex 2 4x FIR peak.
// Algorithm reference: https://www.itu.int/rec/R-REC-BS.1770-5-202311-I/
export interface LoudnessReading { integrated: number|null; momentary: number|null; shortTerm: number|null; truePeak: number|null }
const db=(power:number)=>power>0?-.691+10*Math.log10(power):null;
const average=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;
const FIR=[
  [.001708984375,-.0291748046875,-.0189208984375,-.00830078125],
  [.010986328125,.029296875,.0330810546875,.014892578125],
  [-.0196533203125,-.0517578125,-.0582275390625,-.026611328125],
  [.033203125,.089111328125,.1015625,.047607421875],
  [-.0594482421875,-.16650390625,-.2003173828125,-.102294921875],
  [.1373291015625,.465087890625,.77978515625,.97216796875],
  [.97216796875,.77978515625,.465087890625,.1373291015625],
  [-.102294921875,-.2003173828125,-.16650390625,-.0594482421875],
  [.047607421875,.1015625,.089111328125,.033203125],
  [-.026611328125,-.0582275390625,-.0517578125,-.0196533203125],
  [.014892578125,.0330810546875,.029296875,.010986328125],
  [-.00830078125,-.0189208984375,-.0291748046875,.001708984375],
];
class Filter {
  private z1=0;private z2=0;
  b:number[];a:number[];
  constructor(b:number[],a:number[]){this.b=b;this.a=a;}
  at(input:number){const out=this.b[0]*input+this.z1;this.z1=this.b[1]*input-this.a[0]*out+this.z2;this.z2=this.b[2]*input-this.a[1]*out;return out;}
}
function weighting(rate:number){
  if(rate===48000)return [new Filter([1.53512485958697,-2.69169618940638,1.19839281085285],[-1.69065929318241,.73248077421585]),new Filter([1,-2,1],[-1.99004745483398,.99007225036621])];
  const k=Math.tan(Math.PI*1681.974450955533/rate),q=.7071752369554196,vh=10**(3.999843853973347/20),vb=vh**.4996667741545416,a0=1+k/q+k*k;
  const head=new Filter([(vh+vb*k/q+k*k)/a0,2*(k*k-vh)/a0,(vh-vb*k/q+k*k)/a0],[2*(k*k-1)/a0,(1-k/q+k*k)/a0]);
  const kh=Math.tan(Math.PI*38.13547087602444/rate),qh=.5003270373238773,den=1+kh/qh+kh*kh;
  return [head,new Filter([1,-2,1],[2*(kh*kh-1)/den,(1-kh/qh+kh*kh)/den])];
}
export class LoudnessMeter {
  private filters:Filter[][];
  private history=[new Float64Array(12),new Float64Array(12)];
  private cursor=0;private peak=0;private energy=0;private count=0;
  private hop:number;private recent:number[]=[];private blocks:number[]=[];
  constructor(sampleRate:number){this.filters=[weighting(sampleRate),weighting(sampleRate)];this.hop=Math.round(sampleRate*.1);}
  private peakFrame(left:number,right:number){
    for(const [channel,value] of [left,right].entries()){
      this.peak=Math.max(this.peak,Math.abs(value));this.history[channel][this.cursor]=value;
      for(let phase=0;phase<4;phase++){let v=0;for(let tap=0;tap<12;tap++)v+=FIR[tap][phase]*this.history[channel][(this.cursor-tap+12)%12];this.peak=Math.max(this.peak,Math.abs(v));}
    }
    this.cursor=(this.cursor+1)%12;
  }
  frame(left:number,right:number){
    if(!Number.isFinite(left)||!Number.isFinite(right))throw new Error('Non-finite audio sample');
    this.peakFrame(left,right);
    for(const [channel,value] of [left,right].entries()){const [head,highpass]=this.filters[channel],weighted=highpass.at(head.at(value));this.energy+=weighted*weighted;}
    if(++this.count===this.hop){
      this.recent.push(this.energy/this.hop);if(this.recent.length>30)this.recent.shift();
      if(this.recent.length>=4)this.blocks.push(average(this.recent.slice(-4)));
      this.energy=0;this.count=0;
    }
  }
  reading():LoudnessReading {
    const absolute=this.blocks.filter(v=>(db(v)??-Infinity)>-70);
    const relative=absolute.length?(db(average(absolute))??-Infinity)-10:Infinity;
    const gated=absolute.filter(v=>(db(v)??-Infinity)>relative);
    return {integrated:gated.length?db(average(gated)):null,momentary:this.recent.length>=4?db(average(this.recent.slice(-4))):null,shortTerm:this.recent.length>=30?db(average(this.recent)):null,truePeak:this.peak?20*Math.log10(this.peak):null};
  }
  finish(){for(let i=0;i<12;i++)this.peakFrame(0,0);return this.reading();}
}

export function finishingGain(reading:LoudnessReading,target:number,ceiling:number){
  if(reading.integrated===null||reading.truePeak===null)throw new Error('loudness.silence');
  if(!Number.isFinite(target)||target< -36||target> -5||!Number.isFinite(ceiling)||ceiling< -12||ceiling>0)throw new Error('loudness.invalid');
  return Math.max(-60,Math.min(20,target-reading.integrated,ceiling-reading.truePeak));
}

export async function measureBuffer(buffer:AudioBuffer,signal?:AbortSignal):Promise<LoudnessReading>{
  signal?.throwIfAborted();
  // Offline analysis always uses the specified 48 kHz filter/FIR coefficients.
  if(buffer.sampleRate!==48000){
    const ctx=new OfflineAudioContext(2,Math.ceil(buffer.duration*48000),48000),source=ctx.createBufferSource();source.buffer=buffer;source.connect(ctx.destination);source.start();buffer=await ctx.startRendering();signal?.throwIfAborted();
  }
  const meter=new LoudnessMeter(48000),left=buffer.getChannelData(0),right=buffer.getChannelData(Math.min(1,buffer.numberOfChannels-1));
  for(let i=0;i<buffer.length;i++){
    meter.frame(left[i],right[i]);
    if(i%16384===16383){signal?.throwIfAborted();await new Promise<void>(resolve=>setTimeout(resolve,0));}
  }
  signal?.throwIfAborted();return meter.finish();
}
