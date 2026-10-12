import {LoudnessMeter} from '../dsp/loudness';
declare const sampleRate:number;
declare class AudioWorkletProcessor {port:MessagePort;}
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void;
class LoudnessProcessor extends AudioWorkletProcessor {
  private meter=new LoudnessMeter(sampleRate);private count=0;private active=true;
  constructor(){super();this.port.onmessage=e=>{if(e.data?.type==='dispose'){this.active=false;this.port.close();}else if(e.data?.type==='reset')this.meter=new LoudnessMeter(sampleRate);};}
  process(inputs:Float32Array[][],outputs:Float32Array[][]){
    if(!this.active)return false;
    const input=inputs[0],output=outputs[0];if(!output?.length)return true;
    for(let i=0;i<output[0].length;i++){
      const left=input?.[0]?.[i]??0,right=input?.[1]?.[i]??left;
      this.meter.frame(left,right);output[0][i]=left;if(output[1])output[1][i]=right;
    }
    this.count+=output[0].length;
    if(this.count>=sampleRate/5){this.count=0;this.port.postMessage(this.meter.reading());}
    return true;
  }
}
registerProcessor('crispaudio-loudness',LoudnessProcessor);
