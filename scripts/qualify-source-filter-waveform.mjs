import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE,args:['--mute-audio']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5197');await page.waitForLoadState('networkidle');
 const report=await page.evaluate(async()=>{
  const {LatestPreview}=await import('/src/lib/latestPreview.ts'),{renderSourceFilter,sourceFilterRenderPlan}=await import('/src/audio/engine/SourceFilter.ts'),{SOURCE_FILTER_WAVEFORM_BYTES:budgetBytes}=await import('/src/hooks/useSourceFilterWaveform.ts');
  const rate=48000,seconds=20,frames=rate*seconds,channels=[new Float32Array(frames),new Float32Array(frames)],ranges=[{start:0,end:frames}],settings={highpass:120,lowpass:5000,gainDb:-6};
  for(let i=0;i<frames;i++){channels[0][i]=.2*Math.sin(2*Math.PI*317*i/rate)+.1*Math.sin(2*Math.PI*7800*i/rate);channels[1][i]=channels[0][i]*.5;}
  const calls=[];
  const ActualOffline=window.OfflineAudioContext;
  window.OfflineAudioContext=class extends ActualOffline {constructor(...args){const at=performance.now();super(...args);calls.push({operation:'OfflineAudioContext constructor',ms:performance.now()-at});}};
  const restored=[];
  for(const [prototype,methods] of [[BaseAudioContext.prototype,['createBuffer','createBufferSource','createGain','createBiquadFilter']],[AudioBuffer.prototype,['getChannelData','copyToChannel']]])for(const name of methods){const original=prototype[name];prototype[name]=function(...args){const at=performance.now();try{return original.apply(this,args);}finally{calls.push({operation:name,ms:performance.now()-at});}};restored.push(()=>{prototype[name]=original;});}
  const longTasks=[],observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())longTasks.push({start:entry.startTime,duration:entry.duration});});observer.observe({entryTypes:['longtask']});
  const plan=sourceFilterRenderPlan(channels,ranges,-1,rate,settings,budgetBytes),allocations=[],starts=[],finished=[],published=[];let active=0,maxActive=0,nativeActive=0,maxNativeActive=0,invalidated=false,lastTick=performance.now(),maxHeartbeatGapMs=0;
  const heartbeat=setInterval(()=>{const at=performance.now();maxHeartbeatGapMs=Math.max(maxHeartbeatGapMs,at-lastTick);lastTick=at;},10);
  await new Promise(resolve=>setTimeout(resolve,500));const baselineHeartbeatGapMs=maxHeartbeatGapMs;maxHeartbeatGapMs=0;longTasks.length=0;
  let complete;const done=new Promise(resolve=>{complete=resolve;}),started=performance.now();
  const nativeRender=OfflineAudioContext.prototype.startRendering;
  OfflineAudioContext.prototype.startRendering=function(){nativeActive++;maxNativeActive=Math.max(maxNativeActive,nativeActive);const at=performance.now(),result=nativeRender.call(this);calls.push({operation:'startRendering',ms:performance.now()-at});if(!invalidated){invalidated=true;queueMicrotask(()=>{for(const value of [-3,-4,-5,-6,-7,-8,-9])scheduler.schedule(value);});}return result.finally(()=>{nativeActive--;});};
  const scheduler=new LatestPreview(async(request,signal)=>{active++;maxActive=Math.max(maxActive,active);const start=performance.now();starts.push(request);allocations.push(plan.allocationBytes);try{const rendering=renderSourceFilter(channels,ranges,-1,rate,{...settings,gainDb:request},signal,budgetBytes);return await rendering;}finally{active--;finished.push({gainDb:request,ms:performance.now()-start});}},(request,result)=>{published.push({gainDb:request,channels:result.length,frames:result[0].length});complete();},(_request,error)=>{throw error;});
  // First render is in flight before newer settings invalidate it; the replacements debounce to one render.
  scheduler.schedule(-2,0);
  const timeout=setTimeout(()=>complete(),20000);await done;clearTimeout(timeout);await scheduler.cancelAndWait();scheduler.close();OfflineAudioContext.prototype.startRendering=nativeRender;await new Promise(resolve=>setTimeout(resolve,20));clearInterval(heartbeat);observer.disconnect();for(const restore of restored)restore();window.OfflineAudioContext=ActualOffline;
  // A larger window must fail admission before any OfflineAudioContext is allocated.
  const tooLarge=[new Float32Array(rate*40),new Float32Array(rate*40)];let rejected=false;try{sourceFilterRenderPlan(tooLarge,[{start:0,end:rate*40}],-1,rate,settings,budgetBytes);}catch(e){rejected=e.message==='sourceFilter.limit';}
  return {baselineHeartbeatGapMs,longTasks,calls,rate,seconds,channels:channels.length,budgetBytes,allocationEstimateBytes:plan.allocationBytes,maxActive,maxNativeActive,starts,finished,published,elapsedMs:performance.now()-started,maxHeartbeatGapMs,overBudgetRejected:rejected,peakResidentMemoryMeasured:false};
 });
 await page.evaluate(async()=>{
  const {useProjectStore:store}=await import('/src/stores/projectStore.ts'),{computeWaveformPeaks}=await import('/src/audio/utils/audioBufferUtils.ts');
  const frames=48000*20,buffer=new AudioBuffer({numberOfChannels:2,length:frames,sampleRate:48000});for(let ch=0;ch<2;ch++)for(let i=0;i<frames;i++)buffer.getChannelData(ch)[i]=.2*Math.sin(2*Math.PI*317*i/48000);
  store.getState().loadProjectState({...store.getInitialState().project,tracks:[]},new Map());store.getState().importAudioSource({id:'waveform-performance',name:'Generated 20-second fixture',buffer,duration:20,sampleRate:48000,channels:2,peaks:computeWaveformPeaks(buffer.getChannelData(0),1000)});store.getState().selectSegment(store.getState().project.tracks[0].segments[0].id);store.temporal.getState().clear();window.waveformQualification={store,project:store.getState().project};
 });
 await page.waitForFunction(async()=>{const {runTimelineTool}=await import('/src/hooks/useTimelineTool.ts');await runTimelineTool('source-editor');return !!document.querySelector('[data-source-editor]');});
 const body=page.locator('[data-source-editor]'),panel=body.locator('[data-source-live-filter]');await panel.getByText('Live filter',{exact:true}).click();await panel.getByRole('checkbox',{name:'Enabled',exact:true}).check();await page.waitForFunction(()=>document.querySelector('[data-source-waveform]').dataset.sourcePreviewState==='ready');
 await page.evaluate(()=>{const h=window.waveformQualification;h.longTasks=[];h.observer=new PerformanceObserver(list=>{for(const e of list.getEntries())h.longTasks.push(e.duration);});h.observer.observe({entryTypes:['longtask']});h.at=performance.now();h.last=h.at;h.gap=0;h.timer=setInterval(()=>{const at=performance.now();h.gap=Math.max(h.gap,at-h.last);h.last=at;},10);});
 const output=panel.getByRole('spinbutton',{name:'Output',exact:true});await output.fill('-12');await output.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-source-waveform]').dataset.sourcePreviewState==='ready');
 const ui=await page.evaluate(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));await new Promise(resolve=>setTimeout(resolve,20));const h=window.waveformQualification;clearInterval(h.timer);h.observer.disconnect();return {seconds:20,elapsedMs:performance.now()-h.at,maxHeartbeatGapMs:h.gap,longTasksMs:h.longTasks,projectUnchanged:h.store.getState().project===h.project,undo:h.store.temporal.getState().pastStates.length,status:document.querySelector('[data-source-waveform]').dataset.sourcePreviewState};});
 assert.equal(ui.projectUnchanged,true);assert.equal(ui.undo,0);assert.equal(ui.status,'ready');
 assert.equal(report.maxActive,1);assert.equal(report.maxNativeActive,1);assert.deepEqual(report.starts,[-2,-9]);assert.deepEqual(report.published.map(p=>p.gainDb),[-9]);assert.equal(report.overBudgetRejected,true);assert.ok(report.allocationEstimateBytes<=report.budgetBytes);assert.deepEqual(errors,[]);console.log(JSON.stringify({rendering:report,editor:ui}));
}finally{await browser.close();}
