import {Ducking} from '../dsp/ducking';
declare const sampleRate:number;
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void;
declare class AudioWorkletProcessor {port:MessagePort; constructor(options?:unknown); }
class DuckingProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [
    {name:'threshold',defaultValue:-24,minValue:-60,maxValue:0,automationRate:'k-rate'},
    {name:'ratio',defaultValue:4,minValue:1,maxValue:20,automationRate:'k-rate'},
    {name:'attack',defaultValue:.01,minValue:.001,maxValue:1,automationRate:'k-rate'},
    {name:'release',defaultValue:.25,minValue:.005,maxValue:3,automationRate:'k-rate'},
    {name:'maximum',defaultValue:18,minValue:0,maxValue:60,automationRate:'k-rate'},
  ];}
  private active=true;
  constructor(){super();this.port.onmessage=e=>{if(e.data?.type==='dispose'){this.active=false;this.port.close();}};}
  private follower=new Ducking(sampleRate);
  process(inputs:Float32Array[][],outputs:Float32Array[][],params:Record<string,Float32Array>){
    if(!this.active)return false;
    const config={threshold:params.threshold[0],ratio:params.ratio[0],attack:params.attack[0],release:params.release[0],maximum:params.maximum[0]};
    for(let i=0;i<outputs[0][0].length;i++){
      let detector=0;for(const channel of inputs[1]??[])detector=Math.max(detector,Math.abs(channel[i]??0));
      const gain=this.follower.gain(detector,config);
      for(let ch=0;ch<outputs[0].length;ch++)outputs[0][ch][i]=(inputs[0]?.[ch]?.[i]??inputs[0]?.[0]?.[i]??0)*gain;
    }
    return true;
  }
}
registerProcessor('crispaudio-ducking',DuckingProcessor);
