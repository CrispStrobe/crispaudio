import {FrameDelay} from '../dsp/frameDelay';
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void;
declare class AudioWorkletProcessor {port:MessagePort;constructor(options?:unknown);}
class FrameDelayProcessor extends AudioWorkletProcessor {
 private delay:FrameDelay;private active=true;
 constructor(options:{processorOptions:{channels:number;frames:number}}){super();const p=options.processorOptions;this.delay=new FrameDelay(p.channels,p.frames);this.port.onmessage=e=>{if(e.data?.type==='dispose'){this.active=false;this.port.close();}};}
 process(inputs:Float32Array[][],outputs:Float32Array[][]){if(!this.active){for(const channel of outputs[0]??[])channel.fill(0);return false;}this.delay.process(inputs[0]??[],outputs[0]??[]);return true;}
}
registerProcessor('crispaudio-frame-delay',FrameDelayProcessor);
