import type {RecordingTake} from '../types/audio';
export interface CapturePass {frame:number;timeline:number}
/** Convert captured audio frames to timeline takes; physical latency is explicit. */
export function capturedTakes(options:{firstFrame:number;frames:number;sampleRate:number;passes:CapturePass[];sourceId:string;name:string;latencyMs:number;recordStart?:number;window?:{start:number;end:number};notes:string[];droppedFrames:number}):RecordingTake[]{
 const {firstFrame,frames,sampleRate,passes,latencyMs,window}=options,lastFrame=firstFrame+frames,latency=latencyMs/1000;
 return passes.flatMap((pass,i)=>{
  const a=Math.max(firstFrame,pass.frame),b=Math.min(lastFrame,passes[i+1]?.frame??lastFrame);if(b<=a)return [];
  const from=pass.timeline+(a-pass.frame)/sampleRate-latency,to=pass.timeline+(b-pass.frame)/sampleRate-latency,start=Math.max(0,options.recordStart??0,window?.start??0,from),end=Math.min(window?.end??Infinity,to);
  if(end-start<.01)return [];
  return [{id:crypto.randomUUID(),name:`${options.name} ${i+1}`,sourceId:options.sourceId,sourceOffset:(a-firstFrame)/sampleRate+start-from,startTime:start,duration:end-start,pass:i+1,capturedAt:new Date().toISOString(),droppedFrames:options.droppedFrames,notes:[...options.notes],latencyMs}];
 });
}
