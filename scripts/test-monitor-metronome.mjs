// Real Web Audio PCM and synthetic microphone capture; no physical input/output.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE,args:['--mute-audio']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5197');await page.waitForLoadState('networkidle');
 const pcm=await page.evaluate(async()=>{
  const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts'),{TimelineMetronome}=await import('/src/audio/engine/TimelineMetronome.ts'),{DEFAULT_MUSIC}=await import('/src/lib/musicalTime.ts');
  const ctx=new OfflineAudioContext(2,48000,48000),monitor=ctx.createGain();monitor.connect(ctx.destination);
  const backing=ctx.createBuffer(2,9600,48000),engine=new TimelineEngine(ctx,monitor);engine.playRenderedPreview(backing,0,.2,0);
  const clock=engine.monitorPlaybackClock();let now=0;
  const scheduled=new Proxy(ctx,{get(target,key){if(key==='currentTime')return now;const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}});
  const click=new TimelineMetronome(scheduled,monitor,{...DEFAULT_MUSIC,tempo:300,metronome:true},clock.anchor,clock.end,clock.loop);
  for(now=0;now<1;now+=.025)click.pump();
  const output=await ctx.startRendering(),samples=output.getChannelData(0),onsets=[];
  for(let onset=clock.anchor.frame;onset+1920<samples.length;onset+=9600){
   let peak=0,idle=0;for(let i=onset;i<onset+1920;i++)peak=Math.max(peak,Math.abs(samples[i]));
   for(let i=onset+2400;i<Math.min(onset+8000,samples.length);i++)idle=Math.max(idle,Math.abs(samples[i]));
   onsets.push({frame:onset,peak,idle});
  }
  click.stop();engine.stop();return{onsets,backingSilent:backing.getChannelData(0).every(v=>v===0),stopped:engine.monitorPlaybackClock()===undefined};
 });
 assert.equal(pcm.onsets.length,5);assert.ok(pcm.onsets.every(v=>v.peak>.025&&v.peak<.041&&v.idle<1e-6));assert.equal(pcm.backingSilent,true);assert.equal(pcm.stopped,true);
 // Mount the actual recording controller with a prepared synthetic wet backing.
 // Native plug-in DSP is a test seam; input capture and click scheduling are real.
 await page.evaluate(async()=>{
  const {default:React}=await import('/node_modules/.vite/deps/react.js'),client=await import('/node_modules/.vite/deps/react-dom_client.js'),{TimelineRecording}=await import('/src/components/timeline/TimelineRecording.tsx'),{TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts'),{useTimelineMetronome}=await import('/src/hooks/useTimelineMetronome.ts'),{useProjectStore:store}=await import('/src/stores/projectStore.ts'),{useUIStore:ui}=await import('/src/stores/uiStore.ts'),{DEFAULT_MUSIC}=await import('/src/lib/musicalTime.ts'),{default:i18n}=await import('/src/i18n/index.ts');
  await i18n.changeLanguage('en');
  Object.defineProperty(navigator,'platform',{configurable:true,value:'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,value:0});
  window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>1,convertFileSrc:p=>p,invoke:async cmd=>cmd==='persist_recording'?'/tmp/synthetic-monitor-take.wav':undefined};
  const ctx=new AudioContext({sampleRate:48000}),monitor=ctx.createGain();monitor.gain.value=0;monitor.connect(ctx.destination);
  const clicks=[],inputs=[],original=ctx.createOscillator.bind(ctx);
  ctx.createOscillator=()=>{const node=original(),record={when:0,frequency:0,disconnected:false},start=node.start.bind(node),disconnect=node.disconnect.bind(node);node.start=when=>{record.when=when;record.frequency=node.frequency.value;clicks.push(record);start(when);};node.disconnect=()=>{record.disconnected=true;disconnect();};return node;};
  Object.defineProperty(navigator.mediaDevices,'enumerateDevices',{configurable:true,value:async()=>[]});
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{const input=new AudioContext({sampleRate:48000}),osc=input.createOscillator(),gain=input.createGain(),out=input.createMediaStreamDestination();osc.frequency.value=317;gain.gain.value=.2;osc.connect(gain).connect(out);osc.start();await input.resume();inputs.push({ctx:input,osc,stream:out.stream});return out.stream;}});
  const engine=new TimelineEngine(ctx,monitor),backing=ctx.createBuffer(2,9600,48000);let anchor;
  engine.renderMixRange=async()=>backing;const play=engine.playRenderedPreview.bind(engine);engine.playRenderedPreview=(...args)=>{play(...args);anchor=engine.playbackAnchor();};
  const p={...store.getInitialState().project,id:'record-click',sampleRate:48000,duration:.2,minimumDuration:.2,music:{...DEFAULT_MUSIC,tempo:300,metronome:true},nativeEffects:[{instanceId:'fx',pluginId:'au:synthetic',format:'AU',name:'Synthetic backing',enabled:true,bypass:false,parameters:{},state:''}],tracks:[{id:'mic',name:'Microphone',volume:1,pan:0,muted:false,solo:false,recordArmed:true,segments:[],recordingInput:{deviceId:'',channel:'mono',monitor:false,countIn:0,latencyMs:0}}]};
  store.getState().loadProjectState(p,new Map());store.temporal.getState().clear();ui.setState({timelineRecording:false});
  const host=document.createElement('div');document.body.append(host);const root=(client.createRoot??client.default.createRoot)(host),ref={current:engine},audio={getContext:()=>ctx,masterGain:monitor,analyser:ctx.createAnalyser(),resume:()=>ctx.resume()};
  function Harness(){useTimelineMetronome(ref,audio);return React.createElement(TimelineRecording,{engine:ref,audio});}
  root.render(React.createElement(Harness));window.clickHarness={ctx,engine,clicks,inputs,store,ui,root,backing,anchor:()=>anchor,host};
 });
 const controls=page.locator('[data-recording-controls]');await controls.getByRole('button',{name:'Record',exact:true}).click();
 await page.waitForFunction(()=>window.clickHarness.store.getState().isPlaying);await page.waitForTimeout(1050);
 const running=await page.evaluate(()=>{const h=window.clickHarness;return{clicks:h.clicks.map(v=>({...v})),anchor:h.anchor(),backingEnded:h.engine.monitorPlaybackClock()===undefined};});
 assert.equal(running.backingEnded,true);assert.ok(running.clicks.length>=4);assert.ok(running.clicks.at(-1).when>running.anchor.frame/48000+.6);
 assert.equal(new Set(running.clicks.map(v=>Math.round(v.when*48000))).size,running.clicks.length);assert.ok(running.clicks.every(v=>[800,1200].includes(v.frequency)));
 await controls.getByRole('button',{name:'Stop recording',exact:true}).click();await page.waitForFunction(()=>!window.clickHarness.ui.getState().timelineRecording);
 const stopped=await page.evaluate(()=>{const h=window.clickHarness,s=h.store.getState(),source=[...s.sources.values()][0],data=source.buffer.getChannelData(0);const amplitude=f=>{let re=0,im=0;for(let n=0;n<data.length;n++){const phase=2*Math.PI*f*n/source.buffer.sampleRate;re+=data[n]*Math.cos(phase);im+=data[n]*Math.sin(phase);}return 2*Math.hypot(re,im)/data.length;};return{clicks:h.clicks.length,disconnected:h.clicks.every(v=>v.disconnected),inputsStopped:h.inputs.every(i=>i.stream.getTracks().every(t=>t.readyState==='ended')),takes:s.project.tracks[0].takes.length,undo:h.store.temporal.getState().pastStates.length,dryAmplitude:amplitude(317),clickLeak:Math.max(amplitude(800),amplitude(1200))};});
 assert.equal(stopped.disconnected,true);assert.equal(stopped.inputsStopped,true);assert.equal(stopped.takes,1);assert.equal(stopped.undo,1);assert.ok(stopped.dryAmplitude>.15);assert.ok(stopped.clickLeak<.002);
 await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.clickHarness.clicks.length),stopped.clicks);
 // Cancelling preparation does not open input or create a click.
 await page.evaluate(()=>{const h=window.clickHarness;h.engine.renderMixRange=()=>new Promise(resolve=>{h.release=resolve;});});
 await controls.getByRole('button',{name:'Record',exact:true}).click();await page.waitForFunction(()=>!!window.clickHarness.release);
 await controls.getByRole('button',{name:'Stop recording',exact:true}).click();await page.evaluate(()=>{const h=window.clickHarness;h.release(h.backing);});await page.waitForFunction(()=>!window.clickHarness.ui.getState().timelineRecording);
 assert.equal(await page.evaluate(()=>window.clickHarness.clicks.length),stopped.clicks);assert.equal(await page.evaluate(()=>window.clickHarness.inputs.length),1);
 // Unmount stops the session click and releases input too.
 await page.evaluate(()=>{const h=window.clickHarness;h.engine.renderMixRange=async()=>h.backing;});
 await controls.getByRole('button',{name:'Record',exact:true}).click();await page.waitForFunction(()=>window.clickHarness.store.getState().isPlaying);await page.waitForTimeout(250);
 await page.evaluate(()=>window.clickHarness.root.unmount());await page.waitForFunction(()=>!window.clickHarness.ui.getState().timelineRecording);
 assert.equal(await page.evaluate(()=>window.clickHarness.clicks.every(v=>v.disconnected)&&window.clickHarness.inputs.every(i=>i.stream.getTracks().every(t=>t.readyState==='ended'))),true);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({offlinePreviewPCM:pcm,recording:stopped,afterBackingEnd:true,noDoubleClick:true,cancelBeforeInput:true,unmountCleanup:true,physicalAudio:false,nativeDSP:'synthetic prepared buffer; not requalified'}));
 await page.evaluate(async()=>{const h=window.clickHarness;await h.ctx.close();for(const i of h.inputs){i.osc.stop();await i.ctx.close();}});
}finally{await browser.close();}
