export interface OutputLimiterConfig {enabled:boolean;ceiling?:number;release?:number}
export function limiterParameters(config?:OutputLimiterConfig) {
  return {ceiling:Math.max(-24,Math.min(0,config?.ceiling??-1)),release:Math.max(.01,Math.min(2,config?.release??.1))};
}
export function validOutputLimiter(value:unknown):boolean {
  if(value===undefined)return true;
  if(!value||typeof value!=='object')return false;
  const v=value as Record<string,unknown>;
  return typeof v.enabled==='boolean'&&['ceiling','release'].every(key=>v[key]===undefined||(typeof v[key]==='number'&&Number.isFinite(v[key])));
}
/** Zero latency, stereo-linked gain limiting. Release approaches unity;
 * instantaneous attack always respects the current sample peak ceiling. */
export class SamplePeakLimiter {
  gain=1;
  ceiling=1;
  coefficient=0;
  private previousCeiling=NaN;
  private previousRelease=NaN;
  private sampleRate:number;
  constructor(sampleRate:number) {this.sampleRate=sampleRate;this.configure(-1,.1);}
  configure(ceiling:number,release:number) {
    if(ceiling===this.previousCeiling&&release===this.previousRelease)return;
    const p=limiterParameters({enabled:true,ceiling,release});
    this.ceiling=10**(p.ceiling/20);this.coefficient=-Math.expm1(-1/(p.release*this.sampleRate));
    this.previousCeiling=ceiling;this.previousRelease=release;
  }
  step(left:number,right:number):number {
    const peak=Math.max(Math.abs(left),Math.abs(right));
    const target=peak>this.ceiling?this.ceiling/peak:1;
    this.gain=Math.min(target,this.gain+(1-this.gain)*this.coefficient);
    return this.gain;
  }
  get reduction():number {return -20*Math.log10(Math.max(1e-12,this.gain));}
}
