// The recorder receives microphone input only; monitor output never feeds capture.
declare const currentFrame:number;
declare class AudioWorkletProcessor {port:MessagePort;}
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void;
class CaptureProcessor extends AudioWorkletProcessor {
 private id=0;private active=true;private capturing=false;private mode='mono';private start=0;private stop=Infinity;private first=0;private used=0;private sequence=0;private left=new Float32Array(2048);private right=new Float32Array(2048);private meter=0;private peak=0;
 constructor(){super();this.port.onmessage=e=>{const command=e.data;if(command.type==='start'){this.flush();this.id=command.id;this.mode=command.mode;this.start=command.frame;this.stop=Infinity;this.sequence=0;this.capturing=true;}else if(command.type==='stop'){this.stop=command.frame;}else if(command.type==='mode')this.mode=command.mode;else if(command.type==='dispose'){this.flush();this.active=false;this.port.close();}};}
 private flush(){if(!this.used)return;const left=this.left.slice(0,this.used),right=this.right.slice(0,this.used);this.port.postMessage({type:'pcm',id:this.id,firstFrame:this.first,sequence:this.sequence++,left,right},[left.buffer,right.buffer]);this.used=0;}
 process(inputs:Float32Array[][],outputs:Float32Array[][]){
  if(!this.active)return false;const input=inputs[0],output=outputs[0],count=output[0]?.length??128;
  for(let i=0;i<count;i++){
   const frame=currentFrame+i,rawLeft=input?.[0]?.[i]??0,rawRight=input?.[1]?.[i]??rawLeft,left=this.mode==='right'?rawRight:rawLeft,right=this.mode==='stereo'?rawRight:left;
   if(output[0])output[0][i]=left;if(output[1])output[1][i]=right;this.peak=Math.max(this.peak,Math.abs(left),Math.abs(right));
   if(this.capturing&&frame>=this.stop){this.flush();this.capturing=false;this.port.postMessage({type:'stopped',id:this.id,frame});}
   if(this.capturing&&frame>=this.start){if(!this.used)this.first=frame;this.left[this.used]=left;this.right[this.used]=right;this.used++;if(this.used===this.left.length)this.flush();}
  }
  this.meter+=count;if(this.meter>=2048){this.port.postMessage({type:'meter',peak:this.peak,channels:input?.length??0});this.peak=0;this.meter=0;}
  return true;
 }
}
registerProcessor('crispaudio-capture',CaptureProcessor);
