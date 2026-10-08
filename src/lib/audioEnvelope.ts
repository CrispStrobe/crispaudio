import type {FadeCurve} from '../types/audio';
export function fadeValue(progress:number,curve:FadeCurve):number {
  const p=Math.max(0,Math.min(1,progress));
  return curve==='exponential'?(Math.exp(6*p)-1)/(Math.exp(6)-1):curve==='scurve'?p*p*(3-2*p):p;
}
export function envelopeValue(time:number,duration:number,fadeIn:number,fadeOut:number,inCurve:FadeCurve,outCurve:FadeCurve):number {
  if(time<0||time>duration)return 0;
  return (fadeIn>0?fadeValue(time/fadeIn,inCurve):1)*(fadeOut>0?fadeValue((duration-time)/fadeOut,outCurve):1);
}
/** Curve sampling resumes at the actual gain, including overlapping fades. */
export function scheduleEnvelope(param:AudioParam,start:number,offset:number,duration:number,fadeIn:number,fadeOut:number,inCurve:FadeCurve,outCurve:FadeCurve) {
  param.setValueAtTime(envelopeValue(offset,duration,fadeIn,fadeOut,inCurve,outCurve),start);
  const end=duration-offset;
  if(end<=0||(!fadeIn&&!fadeOut))return;
  const boundaries=[0,Math.max(0,fadeIn-offset),Math.max(0,duration-fadeOut-offset),end].filter(t=>t>=0&&t<=end).sort((a,b)=>a-b);
  for(let j=1;j<boundaries.length;j++){
    const a=boundaries[j-1],b=boundaries[j];
    const fading=offset+a<fadeIn||offset+b>duration-fadeOut;
    const steps=fading?Math.min(4096,Math.max(1,Math.ceil((b-a)*100))):1;
    for(let i=1;i<=steps;i++){const t=a+(b-a)*i/steps;param.linearRampToValueAtTime(envelopeValue(offset+t,duration,fadeIn,fadeOut,inCurve,outCurve),start+t);}
  }
}
