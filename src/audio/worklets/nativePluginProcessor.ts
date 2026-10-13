import {PluginBlockBuffer} from '../plugins/PluginBlockBuffer';
declare const currentFrame:number;
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void;
declare class AudioWorkletProcessor {port:MessagePort;constructor(options?:unknown);}
class NativePluginProcessor extends AudioWorkletProcessor {
 private buffer:PluginBlockBuffer;
 constructor(options:{processorOptions:{channels:number;blockFrames:number;delayBlocks:number;startFrame:number;acknowledge?:boolean}}){super();const p=options.processorOptions;this.buffer=new PluginBlockBuffer(p.channels,p.blockFrames,p.delayBlocks,p.startFrame,block=>this.port.postMessage({type:'block',...block},block.samples.map(s=>s.buffer)),reason=>this.port.postMessage({type:'fault',reason,frame:currentFrame}));this.port.onmessage=e=>{if(e.data?.type==='block'){this.buffer.accept(e.data);if(p.acknowledge&&this.buffer.active)this.port.postMessage({type:'block-accepted',offset:e.data.offset});}else if(e.data?.type==='barrier')this.port.postMessage({type:'barrier',id:e.data.id,active:this.buffer.active});else if(e.data?.type==='dispose'){this.buffer.dispose();this.port.close();}else if(e.data?.type==='fault')this.buffer.dispose();};}
 process(inputs:Float32Array[][],outputs:Float32Array[][]){return this.buffer.process(inputs[0]??[],outputs[0]??[],currentFrame);}
}
registerProcessor('crispaudio-native-plugin',NativePluginProcessor);
