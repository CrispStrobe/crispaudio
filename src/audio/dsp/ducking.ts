import type {DuckingConfig} from '../../types/audio';
export const duckingDefaults={threshold:-24,ratio:4,attack:.01,release:.25,maximum:18};
export function validDucking(config:DuckingConfig){
  return typeof config.source==='string'&&config.source.length>0&&([
    ['threshold',-60,0],['ratio',1,20],['attack',.001,1],['release',.005,3],['maximum',0,60],
  ] as const).every(([key,min,max])=>Number.isFinite(config[key])&&config[key]>=min&&config[key]<=max);
}
/** Peak follower controls only the destination, never adds detector sound. */
export class Ducking {
  envelope=0;
  private sampleRate:number;
  constructor(sampleRate:number){this.sampleRate=sampleRate;}
  gain(detector:number,config:Omit<DuckingConfig,'source'>){
    const coefficient=Math.exp(-1/(this.sampleRate*(detector>this.envelope?config.attack:config.release)));
    this.envelope=coefficient*this.envelope+(1-coefficient)*detector;
    const db=20*Math.log10(Math.max(1e-12,this.envelope));
    const reduction=Math.min(config.maximum,Math.max(0,db-config.threshold)*(1-1/config.ratio));
    return 10**(-reduction/20);
  }
}
