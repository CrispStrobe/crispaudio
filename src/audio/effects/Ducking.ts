import url from '../worklets/duckingProcessor.ts?worker&url';
import type {DuckingConfig} from '../../types/audio';
const loaded=new WeakMap<BaseAudioContext,Promise<void>>();
export function prepareDucking(ctx:BaseAudioContext){
  let result=loaded.get(ctx);if(!result){result=ctx.audioWorklet.addModule(url).catch(error=>{loaded.delete(ctx);throw error;});loaded.set(ctx,result);}return result;
}
export function createDucking(ctx:BaseAudioContext,config:DuckingConfig){
  const {source:_,...parameterData}=config;void _;
  return new AudioWorkletNode(ctx,'crispaudio-ducking',{numberOfInputs:2,numberOfOutputs:1,channelCount:2,channelCountMode:'explicit',outputChannelCount:[2],parameterData});
}
