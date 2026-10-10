import type {EffectConfig} from '../types/audio';
export const EQ_TYPES = ['lowpass','highpass','peaking','lowshelf','highshelf'] as const;
export type EQType = typeof EQ_TYPES[number];
export function isEQ(type:string): type is EQType {return (EQ_TYPES as readonly string[]).includes(type);}
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
export function eqParameters(type:EQType,p:Record<string,number>,sampleRate:number) {
  const freqDefault={lowpass:8000,highpass:200,peaking:1000,lowshelf:200,highshelf:4000}[type];
  return {
    freq:clamp(p.freq??freqDefault,type==='highpass'?10:20,Math.min(type==='lowpass'?22050:type==='highpass'?20000:22000,sampleRate/2)),
    q:clamp(p.q??1,type==='peaking'?.1:.0001,type==='peaking'?20:1000),
    gain:clamp(p.gain??0,-24,24),
  };
}
/** Web Audio biquads. Shelves use S=1; pass-filter Q is dB, bell Q is linear.
 * Reference: https://www.w3.org/TR/webaudio-1.0/#filters-characteristics */
export function eqCoefficients(type:EQType,p:Record<string,number>,sampleRate:number) {
  const {freq,q,gain}=eqParameters(type,p,sampleRate);
  const w=2*Math.PI*freq/sampleRate,c=Math.cos(w),s=Math.sin(w),A=10**(gain/40);
  let b:number[],a:number[];
  if(type==='lowpass'||type==='highpass') {
    const alpha=s/(2*10**(q/20));
    b=type==='lowpass'?[(1-c)/2,1-c,(1-c)/2]:[(1+c)/2,-(1+c),(1+c)/2];
    a=[1+alpha,-2*c,1-alpha];
  } else if(type==='peaking') {
    const alpha=s/(2*q);b=[1+alpha*A,-2*c,1-alpha*A];a=[1+alpha/A,-2*c,1-alpha/A];
  } else {
    const beta=Math.sqrt(2*A)*s;
    if(type==='lowshelf') {
      b=[A*((A+1)-(A-1)*c+beta),2*A*((A-1)-(A+1)*c),A*((A+1)-(A-1)*c-beta)];
      a=[(A+1)+(A-1)*c+beta,-2*((A-1)+(A+1)*c),(A+1)+(A-1)*c-beta];
    } else {
      b=[A*((A+1)+(A-1)*c+beta),-2*A*((A-1)+(A+1)*c),A*((A+1)+(A-1)*c-beta)];
      a=[(A+1)-(A-1)*c+beta,2*((A-1)-(A+1)*c),(A+1)-(A-1)*c-beta];
    }
  }
  return {b:b.map(v=>v/a[0]),a:a.map(v=>v/a[0])};
}
export function eqResponse(effects:EffectConfig[],frequencies:number[],sampleRate:number):number[] {
  const bands=effects.filter(e=>e.enabled&&isEQ(e.type)).map(e=>eqCoefficients(e.type as EQType,e.params,sampleRate));
  return frequencies.map(freq=>bands.reduce((gain,{b,a})=>{
    const w=2*Math.PI*freq/sampleRate;
    const power=(values:number[])=>{
      const re=values.reduce((v,x,i)=>v+x*Math.cos(i*w),0),im=values.reduce((v,x,i)=>v-x*Math.sin(i*w),0);
      return re*re+im*im;
    };
    return gain+10*Math.log10(Math.max(1e-24,power(b))/Math.max(1e-24,power(a)));
  },0));
}
