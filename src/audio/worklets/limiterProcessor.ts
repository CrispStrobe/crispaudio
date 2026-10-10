import {SamplePeakLimiter} from '../dsp/samplePeakLimiter';
declare const sampleRate:number;
declare class AudioWorkletProcessor {port:MessagePort;}
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void;
class OutputLimiterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [{name:'ceiling',defaultValue:-1,minValue:-24,maxValue:0,automationRate:'k-rate'},{name:'release',defaultValue:.1,minValue:.01,maxValue:2,automationRate:'k-rate'}];}
  private limiter=new SamplePeakLimiter(sampleRate);
  private frames=0;
  private minimumGain=1;
  private active=true;
  constructor(){super();this.port.onmessage=e=>{if(e.data?.type==='dispose'){this.active=false;this.port.close();}};}
  process(inputs:Float32Array[][],outputs:Float32Array[][],parameters:Record<string,Float32Array>) {
    if(!this.active)return false;
    const input=inputs[0],output=outputs[0];if(!output?.length)return true;
    this.limiter.configure(parameters.ceiling[0],parameters.release[0]);
    for(let i=0;i<output[0].length;i++){
      const left=input?.[0]?.[i]??0,right=input?.[1]?.[i]??left;
      const gain=this.limiter.step(left,right);
      output[0][i]=left*gain;if(output[1])output[1][i]=right*gain;
      this.minimumGain=Math.min(this.minimumGain,gain);
    }
    this.frames+=output[0].length;
    if(this.frames>=sampleRate/25){this.port.postMessage({reduction:-20*Math.log10(Math.max(1e-12,this.minimumGain))});this.frames=0;this.minimumGain=1;}
    return true;
  }
}
registerProcessor('crispaudio-output-limiter',OutputLimiterProcessor);
