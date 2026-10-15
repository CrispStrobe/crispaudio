export {};
declare const currentFrame:number;
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void;
declare class AudioWorkletProcessor {port:MessagePort;constructor(options?:unknown);}
class RenderedCapture extends AudioWorkletProcessor {
 private origin=Infinity;private pcm:Float32Array[];private frames:number;
 constructor(options:{processorOptions:{frames:number}}){super();this.frames=options.processorOptions.frames;this.pcm=[new Float32Array(this.frames),new Float32Array(this.frames)];this.port.onmessage=event=>{this.origin=event.data;};}
 process(inputs:Float32Array[][]){
  for(let i=0;i<128;i++){const position=currentFrame+i-this.origin;if(position>=0&&position<this.frames)for(let channel=0;channel<2;channel++)this.pcm[channel][position]=inputs[0]?.[channel]?.[i]??0;}
  if(currentFrame+128>=this.origin+this.frames){this.port.postMessage(this.pcm,this.pcm.map(channel=>channel.buffer));return false;}return true;
 }
}
registerProcessor('crispaudio-rendered-capture',RenderedCapture);
