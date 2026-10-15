declare const currentFrame:number;
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void;
declare class AudioWorkletProcessor {port:MessagePort;constructor(options?:unknown);}
class Capture extends AudioWorkletProcessor {
 private origin=Infinity;
 private frames:number;
 private peaks=Array.from({length:3},()=>({peak:0,index:-1}));
 constructor(options:{processorOptions:{frames:number;capabilities?:boolean}}){super();this.frames=options.processorOptions.frames;if(options.processorOptions.capabilities){this.port.postMessage({sharedArrayBuffer:typeof SharedArrayBuffer==='function',isolated:typeof crossOriginIsolated==='boolean'?crossOriginIsolated:null});return;}this.port.onmessage=event=>{if(event.data==='ping')this.port.postMessage('pong');else this.origin=event.data;};}
 process(inputs:Float32Array[][]){
  for(let i=0;i<128;i++){const position=currentFrame+i-this.origin;if(position>=0&&position<this.frames)for(let channel=0;channel<3;channel++){const value=inputs[channel<2?0:1]?.[channel<2?channel:0]?.[i]??0;if(Math.abs(value)>Math.abs(this.peaks[channel].peak))this.peaks[channel]={peak:value,index:position};}}
  if(currentFrame+128>=this.origin+this.frames){this.port.postMessage(this.peaks);return false;}return true;
 }
}
registerProcessor('crispaudio-native-validation-capture',Capture);
