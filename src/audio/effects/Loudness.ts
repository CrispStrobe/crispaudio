import url from '../worklets/loudnessProcessor.ts?worker&url';
const loaded=new WeakMap<BaseAudioContext,Promise<void>>();
export function prepareLoudness(ctx:BaseAudioContext){
  let result=loaded.get(ctx);if(!result){result=ctx.audioWorklet.addModule(url).catch(error=>{loaded.delete(ctx);throw error;});loaded.set(ctx,result);}return result;
}
export function createLoudness(ctx:BaseAudioContext){return new AudioWorkletNode(ctx,'crispaudio-loudness',{numberOfInputs:1,numberOfOutputs:1,channelCount:2,channelCountMode:'explicit',outputChannelCount:[2]});}
