// Frontend adapter -> test wire -> production snapshots/worker/helper DSP.
// No Tauri app, device route, microphone or AudioQueue. Not a physical clock test.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {nativeSourceBridge,verifyNativeSourceBridge} from './fixtures/nativeSourceBridge.mjs';
const binary=process.env.CRISPAUDIO_TEST_NULL_BRIDGE,au=process.env.CRISPAUDIO_TEST_MEDIA_HELPER,vst=process.env.CRISPAUDIO_TEST_VST3_HELPER,folder=process.env.CRISPAUDIO_TEST_PLUGIN_FOLDER;
assert.ok(binary&&au&&vst&&folder,'Set explicit null test binary, AU/VST3 helpers and trusted fixture folder');
verifyNativeSourceBridge(binary);
const call=(helper,operation,request)=>JSON.parse(execFileSync(helper,[operation,JSON.stringify(request)],{timeout:20000,maxBuffer:2*1024*1024}));
const limiter=call(au,'plugin-scan',{}).find(p=>p.name==='AUPeakLimiter'),delay=call(vst,'plugin-scan',{path:join(folder,'adelay.vst3')}).find(p=>p.name==='ADelay');assert.ok(limiter&&delay);
const effects=[{...limiter,parameters:{'0':.004,'1':.01,'2':-3}},{...delay,parameters:{'100':.02,'101':0}}].map(item=>({instanceId:'source-effect',pluginId:item.id,name:item.name,format:item.format,enabled:true,bypass:false,parameters:item.parameters,state:call(item.format==='AU'?au:vst,'plugin-info',{id:item.id,parameters:item.parameters}).state}));
const summaries=[];let session,finalReport,gateCommand,releaseGate,held=false;
const {chromium}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href),browser=await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE,args:['--mute-audio']});
const bridge=nativeSourceBridge({binary,ids:effects.map(e=>e.pluginId)});
try{
 assert.deepEqual(await bridge.native('bridge_stats'),{snapshots:0,bytes:0,sessions:0,started:0,closed:0,hardware:false});
 await assert.rejects(bridge.native('native_recording_inputs'),/Unsupported/);
 await assert.rejects(bridge.native('native_playback_start',{muted:false}),/Hardware/);
 await assert.rejects(bridge.native('native_playback_start',{muted:true,device:'forbidden'}),/Hardware/);
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.exposeFunction('sourceNative',async(command,args)=>{
  if(command==='fixture_hold'){gateCommand=args.command;held=false;return null;}
  if(command==='fixture_gate_state')return held;
  if(command==='fixture_release'){gateCommand=undefined;releaseGate?.();held=false;return null;}
  if(command==='fixture_fault')return bridge.native('bridge_fault',{session,kind:'helper'});
  const result=await bridge.native(command,args);if(command==='native_playback_start')session=result;if(command==='native_playback_close')summaries.push(result);if(command===gateCommand){held=true;await new Promise(resolve=>{releaseGate=resolve;});}return result;
 });
 await page.addInitScript(()=>{window.__TAURI_INTERNALS__={invoke:(command,args)=>window.sourceNative(command,command==='native_snapshot_write'?Array.from(new Uint8Array(args)):args)};});
 const url=process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5197';
 await page.route('**/source-clock-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated source clock fixture</title>'}));
 await page.goto(url+'/source-clock-fixture');
 const report=await page.evaluate(async effects=>{
  const {NativeSourceAudition}=await import('/src/audio/engine/NativeSourceAudition.ts'),{nativeSourceOwner}=await import('/src/audio/engine/NativeSourceOwner.ts');
  const assert=(condition,message)=>{if(!condition)throw new Error(message);};
  const wait=async(check,message)=>{const first=performance.now();while(!await check()){if(performance.now()-first>8000)throw new Error(message);await new Promise(resolve=>setTimeout(resolve,15));}};
  const stats=()=>window.sourceNative('bridge_stats',{}),rows=[];
  for(const effect of effects){
   const channels=[new Float32Array(48000).fill(.25),new Float32Array(48000).fill(-.125)],input={channels,sampleRate:48000,effect},faults=[],ended=[];
   const audio=new NativeSourceAudition({fault:error=>faults.push(String(error)),ended:()=>ended.push(true)});
   try{
    await audio.play(input,{loop:true,muted:true});
    await wait(async()=>{await audio.poll();return audio.status?.phase==='playing'&&audio.status.appliedRevision>=1;},'Initial native controls not applied');
    const revision=audio.status.appliedRevision;
    await audio.update({parameters:effect.parameters,bypass:true,levelDb:-6});
    await wait(async()=>{await audio.poll();return audio.status?.appliedRevision>revision&&Math.abs(audio.status.peaks[0]-.25*10**(-6/20))<1e-4;},'Warm bypass/monitor gain did not reach consumer');
    assert(audio.position()>=0&&audio.position()<1,'Source clock outside loop');
    const live=await stats();assert(live.sessions===1&&live.started-live.closed===1,'Multiple output owners');
    const replacement=new NativeSourceAudition({fault:error=>faults.push(String(error))});
    await replacement.play(input,{loop:true,muted:true});assert(!audio.active,'Replacement retained old source owner');
    await nativeSourceOwner.stop();const joined=await stats();assert(joined.sessions===0&&joined.snapshots===0&&joined.bytes===0,'External handoff did not join/release');
    await audio.play(input,{loop:true,muted:true});window.dispatchEvent(new Event('crispaudio-output-changed'));await audio.stop();
    assert((await stats()).sessions===0,'Device-change event retained output');
    const controller=new AbortController(),opening=audio.play(input,{signal:controller.signal,muted:true});controller.abort();
    const pending=await Promise.allSettled([opening]);assert(pending[0].status==='rejected'&&pending[0].reason.name==='AbortError','Cancelled start completed');await audio.stop();
    for(const command of ['native_snapshot_write','native_playback_start']){
     await window.sourceNative('fixture_hold',{command});const abort=new AbortController(),late=audio.play(input,{loop:true,muted:true,signal:abort.signal}),settled=Promise.allSettled([late]);
     await wait(()=>window.sourceNative('fixture_gate_state',{}),'Pending native boundary was not reached');abort.abort();let joined=false;const stop=audio.stop().then(()=>{joined=true;});await new Promise(resolve=>setTimeout(resolve,20));assert(!joined,'Stop returned before pending native reply joined');await window.sourceNative('fixture_release',{});const result=await settled;await stop;assert(result[0].status==='rejected'&&result[0].reason.name==='AbortError','Late native start was published');const clean=await stats();assert(clean.sessions===0&&clean.snapshots===0&&clean.bytes===0,'Late native boundary leaked');
    }
    await audio.play(input,{loop:true,muted:true});await wait(async()=>{await audio.poll();return audio.status?.phase==='playing';},'Fault fixture not playing');
    await window.sourceNative('fixture_fault',{});await wait(async()=>{await audio.poll();return faults.length>0;},'Helper loss was not reported');await audio.stop();
    assert(faults.length===1,'Helper fault reported more than once');
    await audio.play(input,{muted:true});await wait(async()=>{await audio.poll();return ended.length===1;},'Finite source did not end');await audio.stop();
    assert(channels[0][0]===.25&&channels[1][0]===-.125,'Original PCM changed');
    rows.push({format:effect.format,name:effect.name,liveControls:true,warmBypass:true,monitorLevel:true,replacementJoined:true,externalHandoff:true,outputChangeStopped:true,cancelledStart:true,pendingUploadJoined:true,lateStartJoined:true,helperFaultJoined:true,finiteEndedOnce:true});
   }finally{await audio.stop();await nativeSourceOwner.stop();}
  }
  const cleanStats=await stats(),abandoned=new NativeSourceAudition({fault:()=>{}});await abandoned.play({channels:[new Float32Array(48000).fill(.1),new Float32Array(48000).fill(-.1)],sampleRate:48000,effect:effects[0]},{loop:true,muted:true});await wait(async()=>{await abandoned.poll();return abandoned.status?.phase==='playing';},'EOF fixture not playing');
  return {rows,stats:cleanStats,activeBeforeEof:await stats(),hardware:false,scope:'Browser production source adapter and snapshot binary upload through test dispatch to production realtime worker/DSP; synthetic null clock'};
 },effects);
 assert.deepEqual(errors,[]);assert.equal(report.stats.sessions,0);assert.equal(report.stats.snapshots,0);assert.equal(report.stats.bytes,0);assert.equal(report.stats.started,report.stats.closed);
 assert.ok(summaries.length>=8);assert.ok(summaries.every(result=>result.helpersClosed&&result.queueBuffers===0&&result.muted));
 assert.equal(report.activeBeforeEof.sessions,1);finalReport={...report,joinedSummaries:summaries.length,commands:bridge.commands(),allHelpersClosed:true};
}finally{releaseGate?.();await browser.close();const eof=await bridge.close();if(finalReport)console.log(JSON.stringify({...finalReport,eof}));}
