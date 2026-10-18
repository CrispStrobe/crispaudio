// Internal source plan + actual helper DSP. Offline only: no native output queue,
// microphone, realtime clock, user app bundle, or source-editor UI activation.
// Default is a strict parity gate. CRISPAUDIO_NATIVE_SOURCE_CHARACTERIZE=1 writes
// a report of known differences without accepting them or enabling the UI.
import assert from 'node:assert/strict';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {nativeFreezeBridge} from './fixtures/nativeFreezeBridge.mjs';
const auHelper=process.env.CRISPAUDIO_TEST_MEDIA_HELPER,vstHelper=process.env.CRISPAUDIO_TEST_VST3_HELPER,folder=process.env.CRISPAUDIO_TEST_PLUGIN_FOLDER;
assert.ok(auHelper&&vstHelper&&folder,'Set explicit repo-built AU/VST3 helpers and fixture folder');
const scan=(helper,request)=>JSON.parse(execFileSync(helper,['plugin-scan',JSON.stringify(request)],{timeout:10000}));
const vst=scan(vstHelper,{path:join(folder,'adelay.vst3')}).find(p=>p.name==='ADelay'),aus=scan(auHelper,{}),band=aus.find(p=>p.name==='AUBandpass'),limiter=aus.find(p=>p.name==='AUPeakLimiter');assert.ok(vst&&band&&limiter);
const root=mkdtempSync(join(tmpdir(),'crispaudio-native-source-')),ids=new Set([vst.id,band.id,limiter.id]),bridge=nativeFreezeBridge({root,auHelper,vstHelper,ids}),execute=promisify(execFile);
const {chromium}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href),browser=await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE,args:['--mute-audio']});let sequence=0,deadline;
try{
 const page=await browser.newPage(),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(String(e)));
 await page.exposeFunction('sourceNative',async(command,args)=>{
  if(command==='source_render_fixture'){
   assert.ok(ids.has(args.effect.pluginId));assert.ok(args.bytes.length<1000000);const serial=++sequence,path=join(root,`source-${serial}.wav`),output=join(root,`render-${serial}.wav`);writeFileSync(path,Buffer.from(args.bytes));
   const effect=args.effect,request={id:effect.pluginId,state:effect.state,parameters:effect.parameters,path,output,offset:0,duration:args.duration,bypass:false};
   const rendered=JSON.parse((await execute(effect.format==='VST3'?vstHelper:auHelper,['plugin-render',JSON.stringify(request)],{timeout:30000,maxBuffer:2*1024*1024})).stdout);
   assert.equal(rendered.path,output);return {bytes:[...readFileSync(output)],latency:rendered.latency};
  }
  return bridge.native(command,args);
 });
 await page.addInitScript(()=>{window.__TAURI_INTERNALS__={metadata:{currentWebview:{label:'main'},currentWindow:{label:'main'}},transformCallback:()=>1,convertFileSrc:p=>p,invoke:async(command,args)=>{if(command==='plugin_stream_process_binary'){const data=new Uint8Array(args);let text='';for(let i=0;i<data.length;i+=8192)text+=String.fromCharCode(...data.subarray(i,i+8192));return Uint8Array.from(atob(await window.sourceNative(command,btoa(text))),c=>c.charCodeAt(0)).buffer;}return window.sourceNative(command,args);}};window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};});
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5197');await page.waitForLoadState('networkidle');
 const task=page.evaluate(async({vst,band,limiter})=>{
  const {nativeSourcePlan}=await import('/src/audio/engine/NativeSourceAudition.ts'),{TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts'),{NativePluginStream}=await import('/src/audio/plugins/NativePluginStream.ts'),{encodeSourceBufferWav}=await import('/src/lib/wavExport.ts');
  const rate=48000,frames=16384,results=[];
  for(const channelCount of [1,2]){
   const channels=Array.from({length:channelCount},(_,ch)=>{const pcm=new Float32Array(frames);pcm[4090]=ch?-.3:.5;pcm[frames-10]=ch?-.1:.2;for(let i=7000;i<10000;i++)pcm[i]=.08*Math.sin(2*Math.PI*(ch?317:997)*i/rate);return pcm;});
   for(const item of [{plugin:vst,parameters:{'100':.02,'101':0}},{plugin:band,parameters:{'0':800,'1':1200}},{plugin:limiter,parameters:{'0':.004,'1':.01,'2':-3}}]){
    const stream=await NativePluginStream.open({id:item.plugin.id,sampleRate:rate,channels:2,parameters:item.parameters,processMode:'offline'});let state,latency;try{const saved=await stream.snapshot();state=saved.metadata.state;latency=stream.info.latencySamples;}finally{await stream.close();}if(!state)throw new Error('Missing saved plug-in state');
    const effect={instanceId:'source-effect',pluginId:item.plugin.id,name:item.plugin.name,format:item.plugin.format,enabled:true,bypass:false,parameters:item.parameters,state},plan=nativeSourcePlan({channels,sampleRate:rate,effect}),original=new AudioBuffer({numberOfChannels:channelCount,length:frames,sampleRate:rate});channels.forEach((pcm,ch)=>original.copyToChannel(pcm,ch));const bytes=[...new Uint8Array(await (await encodeSourceBufferWav(original)).arrayBuffer())];
    const helper=await window.sourceNative('source_render_fixture',{effect,bytes,duration:frames/rate}),decoded=await new OfflineAudioContext(channelCount,1,rate).decodeAudioData(Uint8Array.from(helper.bytes).buffer);
    const renderer=new TimelineEngine(new OfflineAudioContext(2,1,rate));renderer.setSources(plan.sources);const rendered=await renderer.renderToBuffer(plan.project);
    if(rendered.length!==frames||decoded.length!==frames)throw new Error('Source duration changed');let error=0,peak=0,first=-1;
    for(let ch=0;ch<2;ch++)for(let i=0;i<frames;i++){const value=rendered.getChannelData(ch)[i];error=Math.max(error,Math.abs(value-decoded.getChannelData(Math.min(ch,decoded.numberOfChannels-1))[i]));peak=Math.max(peak,Math.abs(value));if(ch===0&&Math.abs(value)>1e-6&&first<0)first=i;}
    const dry=await renderer.renderToBuffer({...plan.project,nativeEffects:[{...effect,bypass:true}]});let bypassError=0;for(let ch=0;ch<2;ch++)for(let i=0;i<frames;i++)bypassError=Math.max(bypassError,Math.abs(dry.getChannelData(ch)[i]-channels[Math.min(ch,channelCount-1)][i]));
    results.push({bypassError,format:item.plugin.format,name:item.plugin.name,channels:channelCount,frames,latencySamples:latency,helperLatencySeconds:helper.latency,error,peak,first,stateSupplied:true,estimatedBytes:plan.estimatedBytes});
   }
  }
  return {results,physicalAudio:false,scope:'Internal source plan vs existing helper-rendered Prepare, actual helper DSP, production offline graph; no realtime source/UI qualification'};
 },{vst,band,limiter});
 const report=await Promise.race([task,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('Native source qualification exceeded five minutes')),300000);})]);
 assert.deepEqual(errors,[]);for(const result of report.results){assert.ok(result.bypassError<2e-6,JSON.stringify(result));assert.ok(result.peak>1e-5);assert.equal(result.frames,16384);if(result.name==='ADelay')assert.equal(result.first,4090+Math.floor(.02*48000));if(result.name==='AUPeakLimiter'){assert.ok(result.latencySamples>0);assert.equal(result.first,4090);}}
 const helperStats=bridge.stats();assert.equal(helperStats.sessions,0);assert.equal(helperStats.children,0);const parityAccepted=report.results.every(result=>result.error<2e-6);console.log(JSON.stringify({...report,parityAccepted,helperStats}));if(process.env.CRISPAUDIO_NATIVE_SOURCE_CHARACTERIZE!=='1')assert.ok(parityAccepted,'Native source UI stays gated: AU helper-render vs stream parity is unresolved; see report above');
}finally{clearTimeout(deadline);await browser.close();await bridge.close();rmSync(root,{recursive:true,force:true});}
