import workletURL from '../worklets/limiterProcessor.ts?worker&url';
import {limiterParameters,type OutputLimiterConfig} from '../dsp/samplePeakLimiter';
const loaded=new WeakMap<BaseAudioContext,Promise<void>>();
export function prepareOutputLimiter(ctx:BaseAudioContext):Promise<void> {
  let promise=loaded.get(ctx);
  if(!promise){
    if(!ctx.audioWorklet)return Promise.reject(new Error('Output limiter needs AudioWorklet support'));
    promise=ctx.audioWorklet.addModule(workletURL).catch(error=>{loaded.delete(ctx);throw error;});loaded.set(ctx,promise);
  }
  return promise;
}
export function createOutputLimiter(ctx:BaseAudioContext,config:OutputLimiterConfig):AudioWorkletNode {
  const p=limiterParameters(config);
  return new AudioWorkletNode(ctx,'crispaudio-output-limiter',{numberOfInputs:1,numberOfOutputs:1,channelCount:2,channelCountMode:'explicit',outputChannelCount:[2],parameterData:p});
}
