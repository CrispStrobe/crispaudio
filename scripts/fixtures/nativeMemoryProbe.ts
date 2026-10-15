import probeUrl from './nativeWorkerProbe.ts?worker&url';
import captureUrl from './nativeCapture.ts?worker&url';
export async function nativeMemoryProbe(){
 const ctx=new AudioContext({sampleRate:48000}),worker=new Worker(probeUrl,{type:'module'});
 try{
  await ctx.resume();await ctx.audioWorklet.addModule(captureUrl);
  const node=new AudioWorkletNode(ctx,'crispaudio-native-validation-capture',{processorOptions:{frames:128,capabilities:true}});
  const receive=(target:Worker|MessagePort)=>new Promise<unknown>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Memory capability probe timed out')),3000);target.onmessage=event=>{clearTimeout(timer);resolve(event.data);};});
  const worklet=receive(node.port),thread=receive(worker);worker.postMessage({capabilities:true});
  const [workerCapabilities,workletCapabilities]=await Promise.all([thread,worklet]);
  const result={window:{sharedArrayBuffer:typeof SharedArrayBuffer==='function',isolated:globalThis.crossOriginIsolated,secure:globalThis.isSecureContext},worker:workerCapabilities,worklet:workletCapabilities};
  node.port.close();node.disconnect();return result;
 }finally{worker.terminate();await ctx.close();}
}
