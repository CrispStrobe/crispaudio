import url from '../worklets/frameDelayProcessor.ts?worker&url';
const loaded=new WeakMap<BaseAudioContext,Promise<void>>();
export function prepareGraphCompensation(ctx:BaseAudioContext){let result=loaded.get(ctx);if(!result){result=ctx.audioWorklet.addModule(url).catch(error=>{loaded.delete(ctx);throw error;});loaded.set(ctx,result);}return result;}
/** Caller owns the returned nodes and must dispose them with the graph. */
export function compensatedConnection(ctx:BaseAudioContext,input:AudioNode,output:AudioNode,frames:number,owned:Set<AudioWorkletNode>,outputInput=0){
 if(!Number.isSafeInteger(frames)||frames<0||frames>ctx.sampleRate*180)throw new Error('Invalid compensation delay');if(!frames){input.connect(output,0,outputInput);return;}
 const delay=new AudioWorkletNode(ctx,'crispaudio-frame-delay',{numberOfInputs:1,numberOfOutputs:1,channelCount:2,channelCountMode:'explicit',outputChannelCount:[2],processorOptions:{channels:2,frames}});owned.add(delay);input.connect(delay);delay.connect(output,0,outputInput);
}
export function disposeCompensation(nodes:Set<AudioWorkletNode>){for(const node of nodes){node.port.postMessage({type:'dispose'});node.disconnect();}nodes.clear();}
