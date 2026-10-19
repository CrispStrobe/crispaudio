// Dynamic reference checks after the actual editor has released its source owner.
// The caller supplies only generated PCM and an explicitly trusted effect ID.
import assert from 'node:assert/strict';
export async function qualifySourceRate(page,spec){
 const result=await page.evaluate(async spec=>{
  const {NativeSourceAudition}=await import('/src/audio/engine/NativeSourceAudition.ts');
  const read=async path=>{const bytes=Uint8Array.from(await window.sourceNative('plugin:fs|read_file',{path}));return new OfflineAudioContext(spec.channels,1,spec.rate).decodeAudioData(bytes.buffer);};
  const original=await read(spec.path),effect={instanceId:'rate-reference',pluginId:spec.id,name:'ADelay',format:'VST3',enabled:true,bypass:false,parameters:{'100':0,'101':0},state:spec.state};
  const render=await window.sourceNative('audio_unit_plugin',{operation:'plugin-render',request:{id:spec.id,path:spec.path,offset:0,duration:1,parameters:effect.parameters,state:effect.state}});
  let fresh;try{fresh=await read(render.path);}finally{await window.sourceNative('plugin:fs|remove',{path:render.path});}
  const convert=async buffer=>{const frames=Math.ceil(buffer.length*48000/buffer.sampleRate)+2,offline=new OfflineAudioContext(2,frames,48000),input=offline.createBuffer(2,buffer.length,buffer.sampleRate);for(let ch=0;ch<2;ch++)input.copyToChannel(buffer.getChannelData(Math.min(ch,buffer.numberOfChannels-1)),ch);const node=offline.createBufferSource();node.buffer=input;node.connect(offline.destination);node.start();return offline.startRendering();};
  const sourceRateReference=await convert(fresh),converted=await convert(original);
  // Verify the intended native pipeline against a fresh 48-kHz helper pass.
  // ADelay has a one-sample minimum even at parameter zero: processing before
  // versus after SRC is measurably different and must not be called parity.
  const {encodeSourceBufferWav}=await import('/src/lib/wavExport.ts'),wav=await encodeSourceBufferWav(converted),convertedPath=await window.sourceNative('persist_recording',Array.from(new Uint8Array(await wav.arrayBuffer())));
  const canonicalRender=await window.sourceNative('audio_unit_plugin',{operation:'plugin-render',request:{id:spec.id,path:convertedPath,offset:0,duration:1,parameters:effect.parameters,state:effect.state}});
  let reference;try{const bytes=Uint8Array.from(await window.sourceNative('plugin:fs|read_file',{path:canonicalRender.path}));reference=await new OfflineAudioContext(2,1,48000).decodeAudioData(bytes.buffer);}finally{await window.sourceNative('plugin:fs|remove',{path:canonicalRender.path});await window.sourceNative('plugin:fs|remove',{path:convertedPath});}
  const range={start:Math.floor(spec.rate*.31)+1,end:Math.floor(spec.rate*.83)-1},startFrame=Math.round(range.start*48000/spec.rate),endFrame=Math.round(range.end*48000/spec.rate),channels=Array.from({length:spec.channels},(_,ch)=>original.getChannelData(ch).slice()),before=channels.map(c=>c.slice()),faults=[],ended=[];
  const audio=new NativeSourceAudition({fault:error=>faults.push(String(error)),ended:()=>ended.push(true)}),wait=async check=>{const epoch=performance.now();while(!await check()){if(performance.now()-epoch>15000)throw new Error('Dynamic source-rate check timed out');await new Promise(resolve=>setTimeout(resolve,10));}};
  let loopError=0,finiteError=0,sourceRateRenderDifference=0;
  try{
   for(const loop of [true,false]){
    await audio.play({channels,sampleRate:spec.rate,effect,range},{loop,muted:true});
    await wait(async()=> (await window.sourceNative('fixture_capture',{})).samples.length===4096);
    const capture=await window.sourceNative('fixture_capture',{});let error=0;for(let i=0;i<2048;i++)for(let ch=0;ch<2;ch++){error=Math.max(error,Math.abs(capture.samples[i*2+ch]-reference.getChannelData(ch)[startFrame+i]));sourceRateRenderDifference=Math.max(sourceRateRenderDifference,Math.abs(capture.samples[i*2+ch]-sourceRateReference.getChannelData(ch)[startFrame+i]));}
    if(loop){loopError=error;await wait(async()=>{await audio.poll();return (await window.sourceNative('fixture_capture',{})).consumedFrames>(endFrame-startFrame)*2;});if(audio.position()<0||audio.position()>(endFrame-startFrame)/48000)throw new Error('Resampled source clock left selected range');await audio.stop();}
    else {finiteError=error;await wait(async()=>{await audio.poll();return ended.length===1;});}
   }
   const finiteMiddleEndedOnce=ended.length===1,edgeCases=[];
   for(const [name,selected] of [['whole',{start:0,end:spec.rate}],['minimum-head',{start:0,end:2048}],['minimum-tail',{start:spec.rate-2048,end:spec.rate}]]){
    const beforeEnd=ended.length,start=Math.round(selected.start*48000/spec.rate),end=Math.round(selected.end*48000/spec.rate);
    try{await audio.play({channels,sampleRate:spec.rate,effect,range:selected},{muted:true});}catch(error){if(error.name!=='AbortError'||ended.length!==beforeEnd+1)throw error;}
    await wait(async()=>{await audio.poll();return ended.length===beforeEnd+1;});await audio.stop();const summary=await window.sourceNative('fixture_summary',{});
    if(summary.status.phase!=='ended'||summary.status.frame!==end||summary.status.renderedFrames!==end-start||!summary.helpersClosed)throw new Error('Finite source-rate edge count/join mismatch: '+JSON.stringify(summary.status));
    edgeCases.push({name,startFrame:start,endFrame:end,renderedFrames:summary.status.renderedFrames,endedOnce:true,helpersClosed:true});
   }
   if(faults.length)throw new Error(faults.join('; '));
   const originalsIntact=channels.every((c,ch)=>c.every((value,i)=>value===before[ch][i]));
   return {sourceRate:spec.rate,outputRate:48000,sourceFrames:original.length,renderedRate:fresh.sampleRate,renderedFrames:fresh.length,convertedFrames:converted.length,outputFrames:reference.length,sourceRateRenderDifference,startSample:range.start,endSample:range.end,startFrame,endFrame,loopError,finiteError,originalsIntact,finiteEndedOnce:finiteMiddleEndedOnce,edgeCases,finiteCompletionCount:ended.length};
  }finally{await audio.stop();}
 },spec);
 assert.equal(result.renderedRate,spec.rate);assert.equal(result.renderedFrames,spec.rate);assert.equal(result.sourceFrames,spec.rate);assert.ok(result.originalsIntact&&result.finiteEndedOnce);assert.ok(result.loopError<1e-6&&result.finiteError<1e-6,JSON.stringify(result));return result;
}
