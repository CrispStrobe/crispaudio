import url from '../worklets/captureProcessor.ts?worker&url';
import {resumePlaybackContext} from '../../lib/audioOutput';
import {setAudioSessionType} from '../../lib/native';
let inputOwners=0;
const loaded=new WeakMap<AudioContext,Promise<void>>();
export type InputMode='mono'|'right'|'stereo';
export interface CapturedInput {buffer:AudioBuffer;firstFrame:number;droppedFrames:number;notes:string[]}
export class TimelineCapture {
 private ownsInput=false;private byteBudget=240*1024*1024;
 private generation=0;private captureId=0;private expectedFrame?:number;
 private stream?:MediaStream;private node?:AudioWorkletNode;private input?:MediaStreamAudioSourceNode;private monitor?:GainNode;private chunks:{frame:number;left:Float32Array;right:Float32Array}[]=[];private first?:number;private frames=0;private mode:InputMode='mono';private dropped=0;private notes:string[]=[];private stopped?:()=>void;private recording=false;
 private ctx:AudioContext;private output:AudioNode;private meter:(peak:number,channels:number)=>void;private interrupted:(reason:string)=>void;private channels=0;private inputReady?:()=>void;private captureReady?:()=>void;
 constructor(ctx:AudioContext,output:AudioNode,meter:(peak:number,channels:number)=>void,interrupted:(reason:string)=>void){this.ctx=ctx;this.output=output;this.meter=meter;this.interrupted=interrupted;}
 async connect(deviceId:string,mode:InputMode){
  this.disconnect();const generation=this.generation;this.ownsInput=true;if(++inputOwners===1)setAudioSessionType('play-and-record');
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:deviceId?{exact:deviceId}:undefined,channelCount:{ideal:2},echoCancellation:false,noiseSuppression:false,autoGainControl:false}});if(this.generation!==generation){stream.getTracks().forEach(t=>t.stop());throw new DOMException('Input connection cancelled','AbortError');}this.stream=stream;
   let ready=loaded.get(this.ctx);if(!ready){ready=this.ctx.audioWorklet.addModule(url).catch(e=>{loaded.delete(this.ctx);throw e;});loaded.set(this.ctx,ready);}await ready;await resumePlaybackContext(this.ctx);if(this.generation!==generation)throw new DOMException('Input connection cancelled','AbortError');
   this.mode=mode;this.node=new AudioWorkletNode(this.ctx,'crispaudio-capture',{numberOfInputs:1,numberOfOutputs:1,channelCountMode:'max',outputChannelCount:[2]});this.node.port.postMessage({type:'mode',mode});
   this.monitor=this.ctx.createGain();this.monitor.gain.value=0;this.input=this.ctx.createMediaStreamSource(stream);this.input.connect(this.node);this.node.connect(this.monitor);this.monitor.connect(this.output);
   this.node.port.onmessage=e=>{const message=e.data;if(message.type==='meter'){this.channels=message.channels;if(this.channels>0)this.inputReady?.();this.meter(message.peak,message.channels);return;}if(message.type==='stopped'&&message.id===this.captureId){this.stopped?.();this.stopped=undefined;return;}if(message.type==='pcm'&&message.id===this.captureId){
    if(this.first===undefined){this.first=message.firstFrame;this.captureReady?.();}
    if(this.expectedFrame!==undefined&&message.firstFrame!==this.expectedFrame)this.dropped+=Math.abs(message.firstFrame-this.expectedFrame);this.expectedFrame=message.firstFrame+message.left.length;
    this.chunks.push({frame:message.firstFrame,left:message.left,right:message.right});this.frames+=message.left.length;
    if(this.frames*8>this.byteBudget)this.interrupted('recording.budget');
   }};
   if(mode==='right'&&stream.getAudioTracks()[0]?.getSettings().channelCount===1)throw new Error('recording.rightUnavailable');
   if(!this.channels)await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>{this.inputReady=undefined;reject(new Error('recording.notReady'));},1000);this.inputReady=()=>{clearTimeout(timeout);this.inputReady=undefined;resolve();};});
   if(this.generation!==generation)throw new DOMException('Input connection cancelled','AbortError');
   if(mode==='right'&&this.channels<2)throw new Error('recording.rightUnavailable');
   for(const track of stream.getAudioTracks()){track.addEventListener('ended',()=>{this.notes.push('recording.deviceEnded');this.interrupted('recording.deviceEnded');});track.addEventListener('mute',()=>{this.notes.push('recording.deviceMuted');this.interrupted('recording.deviceMuted');});}
  }catch(e){if(this.generation===generation)this.disconnect();throw e;}
 }
 budget(bytes:number){if(this.recording||!Number.isFinite(bytes)||bytes<1024||bytes>240*1024*1024)throw new Error('recording.budget');this.byteBudget=bytes;}
 monitoring(enabled:boolean){this.monitor?.gain.setTargetAtTime(enabled?1:0,this.ctx.currentTime,.005);}
 connected(){return !!this.node;}
 start(frame=Math.ceil(this.ctx.currentTime*this.ctx.sampleRate)){
  if(!this.node||this.recording)throw new Error('recording.notReady');if(this.mode==='right'&&this.channels<2)throw new Error('recording.rightUnavailable');this.chunks=[];this.first=undefined;this.expectedFrame=undefined;this.frames=0;this.dropped=0;this.notes=[];this.recording=true;this.node.port.postMessage({type:'start',id:++this.captureId,mode:this.mode,frame});return frame;
 }
 /** Wait for each input's buffered pre-roll before starting the common playback clock. */
 async waitForFrames(signal:AbortSignal){
  signal.throwIfAborted();if(!this.recording)throw new Error('recording.notReady');if(this.first!==undefined)return;const generation=this.generation;
  await new Promise<void>((resolve,reject)=>{
   const finish=(error?:Error)=>{clearTimeout(timeout);signal.removeEventListener('abort',abort);if(this.captureReady===ready)this.captureReady=undefined;if(error)reject(error);else resolve();};
   const ready=()=>finish(),abort=()=>finish(new DOMException('Capture cancelled','AbortError')),timeout=setTimeout(()=>finish(new Error('recording.notReady')),1000);
   this.captureReady=ready;signal.addEventListener('abort',abort,{once:true});
  });
  signal.throwIfAborted();if(generation!==this.generation||this.first===undefined||!this.recording)throw new Error('recording.notReady');
 }
 async stop(frame=Math.ceil(this.ctx.currentTime*this.ctx.sampleRate)):Promise<CapturedInput|null>{
  if(!this.node||!this.recording)return null;this.recording=false;const node=this.node;
  await new Promise<void>(resolve=>{const timeout=setTimeout(()=>{this.stopped=undefined;this.notes.push('recording.captureStopped');resolve();},1000);this.stopped=()=>{clearTimeout(timeout);resolve();};node.port.postMessage({type:'stop',frame});});
  this.captureId++;if(!this.frames||this.first===undefined)return null;
  const stop=Math.max(...this.chunks.map(c=>c.frame+c.left.length)),length=stop-this.first;
  if(length*8>256*1024*1024)throw new Error('recording.budget');
  const buffer=this.ctx.createBuffer(this.mode==='stereo'?2:1,length,this.ctx.sampleRate);
  for(const chunk of this.chunks){const offset=chunk.frame-this.first;buffer.getChannelData(0).set(chunk.left,offset);if(buffer.numberOfChannels===2)buffer.getChannelData(1).set(chunk.right,offset);}
  const result={buffer,firstFrame:this.first,droppedFrames:this.dropped,notes:this.notes};this.chunks=[];return result;
 }
 disconnect(){this.generation++;this.captureReady?.();this.captureReady=undefined;this.captureId++;this.channels=0;this.inputReady?.();this.inputReady=undefined;this.recording=false;this.stopped?.();this.stopped=undefined;this.input?.disconnect();if(this.node){this.node.port.postMessage({type:'dispose'});this.node.disconnect();this.node.port.onmessage=null;}this.monitor?.disconnect();this.stream?.getTracks().forEach(t=>t.stop());this.stream=undefined;this.node=undefined;this.input=undefined;this.monitor=undefined;this.chunks=[];if(this.ownsInput){this.ownsInput=false;if(--inputOwners===0)setAudioSessionType('playback');}}
}
