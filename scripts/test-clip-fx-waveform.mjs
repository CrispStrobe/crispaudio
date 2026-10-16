import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE,args:['--mute-audio']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5197');await page.waitForLoadState('networkidle');
 const pcm=await page.evaluate(async()=>{
  const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts'),{useProjectStore:store}=await import('/src/stores/projectStore.ts'),{useUIStore:ui}=await import('/src/stores/uiStore.ts');
  const ctx=new OfflineAudioContext(2,24000,48000),buffer=ctx.createBuffer(2,48000,48000);
  for(let ch=0;ch<2;ch++)for(let i=0;i<buffer.length;i++)buffer.getChannelData(ch)[i]=.25*Math.sin(2*Math.PI*6000*i/48000)*(ch?-.7:1);
  const source={id:'s',name:'6 kHz stereo',buffer,duration:1,sampleRate:48000,channels:2,peaks:{min:new Float32Array(200).fill(-.25),max:new Float32Array(200).fill(.25)}};
  const base={id:'c',trackId:'t',sourceId:'s',name:'FX waveform',startTime:3,sourceOffset:.1,duration:.5,gain:.8,color:'#3b82f6',fadeInDuration:.02,fadeOutDuration:.03,fadeInCurve:'linear',fadeOutCurve:'scurve',effects:[]};
  const makeProject=c=>({...store.getInitialState().project,id:'waveform-test',name:'FX waveform',duration:5,sampleRate:48000,masterVolume:1,masterEffects:[],outputLimiter:undefined,tracks:[{id:'t',name:'FX',volume:1,pan:0,muted:false,solo:false,effects:[],segments:[c]}]});
  const cases=[['lowpass',{freq:200,q:1}],['highpass',{freq:8000,q:1}],['peaking',{freq:6000,q:1,gain:-12}],['lowshelf',{freq:8000,gain:-12}],['highshelf',{freq:1000,gain:-12}],['distortion',{drive:.8,mix:.9}],['compressor',{threshold:-30,ratio:8}],['delay',{time:.02,feedback:.3,mix:.8}],['reverb',{size:.1,decay:.2,mix:.8}],['chorus',{rate:1.5,depth:.4,mix:.5}],['ringmod',{freq:300,mix:.8}],['bitcrush',{bits:3,mix:.9}]];
  const results=[];
  for(const [type,params]of cases){
   const c={...base,effects:[{type,enabled:true,params,automation:['delay','ringmod'].includes(type)?{mix:[{time:3,value:0},{time:3.5,value:1}]}:undefined}]};
   const processed=await TimelineEngine.renderClipWaveform(source,c),engine=new TimelineEngine(ctx);engine.setSources(new Map([['s',source]]));
   const expected=await engine.renderToBuffer(makeProject(c),3,3.5);let error=0,energy=0;
   for(let ch=0;ch<2;ch++)for(let i=0;i<processed.length;i++){const v=processed.getChannelData(ch)[i];if(!Number.isFinite(v))throw Error('Nonfinite '+type);error=Math.max(error,Math.abs(v-expected.getChannelData(ch)[i]));energy+=v*v;}
   results.push({type,error,rms:Math.sqrt(energy/(processed.length*2)),frames:processed.length});
  }
  const clip={...base,startTime:0,sourceOffset:0,effects:[{instanceId:'lp',type:'lowpass',enabled:true,params:{freq:18000,q:1}}]};
  ui.getState().setActivePanel('timeline');store.getState().loadProjectState(makeProject(clip),new Map([['s',source]]));store.setState({zoomLevel:600,scrollOffset:0,trackHeight:140});store.getState().selectSegment('c');store.temporal.getState().clear();
  window.fxTest={store,ui,source,clip,makeProject};
  const React=await import('/node_modules/.vite/deps/react.js'),client=await import('/node_modules/.vite/deps/react-dom_client.js'),{SegmentEffectsPanel}=await import('/src/components/timeline/SegmentEffectsPanel.tsx');
  const host=document.createElement('div');host.id='waveform-test-inspector';host.style='position:fixed;right:0;top:0;width:340px;max-height:90vh;overflow:auto;z-index:10000;background:#111827;padding:12px';document.body.append(host);(client.createRoot??client.default.createRoot)(host).render((React.createElement??React.default.createElement)(SegmentEffectsPanel));
  return results;
 });
 for(const result of pcm){assert.equal(result.frames,24000);assert.ok(result.rms>0);assert.ok(result.error<1e-6,JSON.stringify(result));}
 const canvas=page.locator('[data-audio-timeline]');
 const ready=()=>page.waitForFunction(()=>JSON.parse(document.querySelector('[data-audio-timeline]').dataset.fxWaveforms).some(([id,state])=>id==='c'&&state==='ready'));
 await ready();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.fxTest.store.temporal.getState().pastStates.length),0);
 const pixels=()=>canvas.evaluate(c=>{const data=c.getContext('2d').getImageData(10*devicePixelRatio,45*devicePixelRatio,200*devicePixelRatio,65*devicePixelRatio).data;let sum=0;for(let i=0;i<data.length;i++)sum+=data[i];return sum;});
 const before=await pixels();
 const inspector=page.locator('#waveform-test-inspector');await inspector.locator('[data-clip-section="effects"] > summary').click();await inspector.getByRole('button',{name:'Expand',exact:true}).click();
 // Actual inspector slider: changing cutoff must affect the canvas before Apply/close.
 const cutoff=inspector.getByRole('slider',{name:'Cutoff',exact:true});const labels=await inspector.getByRole('slider').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label')||n.id));
 const slider=cutoff;
 await slider.evaluate(n=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(n,'200');n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.waitForFunction(()=>window.fxTest.store.getState().project.tracks[0].segments[0].effects[0].params.freq===200);
 await ready();await page.waitForTimeout(100);const after=await pixels();assert.notEqual(before,after);
 const baseline=await page.evaluate(()=>({sourceUnchanged:window.fxTest.source.buffer.getChannelData(0)[2],history:window.fxTest.store.temporal.getState().pastStates.length}));
 assert.equal(baseline.sourceUnchanged,.25);assert.equal(baseline.history,1);
 // Keep moving the real slider: waveform pixels must change before movement ends.
 const continuous=await slider.evaluate(async n=>{
  const canvas=document.querySelector('[data-audio-timeline]'),setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  const samples=[],historyBefore=window.fxTest.store.temporal.getState().pastStates.length;let tick=0;
  n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,pointerType:'mouse'}));
  const edits=setInterval(()=>{tick++;setter.call(n,String(tick%2?200+tick:17500+tick));n.dispatchEvent(new Event('input',{bubbles:true}));},35);
  try{for(let i=0;i<16;i++){
   await new Promise(resolve=>setTimeout(resolve,90));
   const pixels=canvas.getContext('2d').getImageData(10*devicePixelRatio,45*devicePixelRatio,200*devicePixelRatio,65*devicePixelRatio).data;
   let sum=0;for(const v of pixels)sum+=v;
   const state=JSON.parse(canvas.dataset.fxWaveforms).find(([id])=>id==='c');samples.push({sum,processed:state[2],state:state[1]});
  }}finally{clearInterval(edits);n.dispatchEvent(new Event('change',{bubbles:true}));window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,pointerType:'mouse'}));}
  return{historyEntries:window.fxTest.store.temporal.getState().pastStates.length-historyBefore,edits:tick,processedShapes:new Set(samples.filter(s=>s.processed).map(s=>s.sum)).size,samples};
 });
 assert.equal(continuous.historyEntries,1);assert.ok(continuous.edits>20,JSON.stringify(continuous));assert.ok(Math.max(...continuous.samples.map(s=>s.sum))-Math.min(...continuous.samples.map(s=>s.sum))>10000,JSON.stringify(continuous));assert.ok(continuous.processedShapes>=2,JSON.stringify(continuous));await ready();
 // Rapid edits, bypass and Undo must never display an old processed version.
 await page.evaluate(()=>{const s=window.fxTest.store;for(const freq of [9000,3000,150])s.getState().setSegmentEffects('c',[{type:'lowpass',enabled:true,params:{freq,q:1}}]);});await ready();
 await page.evaluate(()=>window.fxTest.store.getState().setSegmentEffects('c',[{type:'lowpass',enabled:false,params:{freq:150,q:1}}]));
 await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-audio-timeline]').dataset.fxWaveforms)[0][1]==='dry');
 await page.evaluate(()=>window.fxTest.store.temporal.getState().undo());await ready();
 // A trim must never borrow the preceding processed waveform's source coordinates.
 const trimFallback=await page.evaluate(async()=>{
  const s=window.fxTest.store,state=s.getState();s.setState({project:{...state.project,tracks:state.project.tracks.map(t=>({...t,segments:t.segments.map(c=>({...c,sourceOffset:.2}))}))}});
  await new Promise(resolve=>requestAnimationFrame(resolve));
  return JSON.parse(document.querySelector('[data-audio-timeline]').dataset.fxWaveforms)[0];
 });assert.equal(trimFallback[1],'pending');assert.equal(trimFallback[2],false);await ready();
 await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');document.querySelector('#waveform-test-inspector').style.width='330px';});await ready();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({pcm,canvasChangedWithInspector:before!==after,sliderLabels:labels,baseline,continuous,trimDoesNotReuseOldShape:true,rapidEditsBypassUndo:true,smallGermanViewport:true,physicalAudio:false}));
}finally{await browser.close();}
