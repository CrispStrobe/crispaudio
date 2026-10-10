// Real browser response/DSP and editing regression. Synthetic sources only.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE});
try {
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5190');await page.waitForLoadState('networkidle');
 const accuracy=await page.evaluate(async()=>{
  const {eqResponse}=await import('/src/lib/equalizer.ts');let maxError=0,count=0;
  for(const rate of [32000,44100,48000]){
   const ctx=new OfflineAudioContext(2,1,rate);
   const frequencies=Float32Array.from([20,100,1000,5000,rate*.45]);
   for(const type of ['lowpass','highpass','peaking','lowshelf','highshelf'])for(const gain of [-24,0,24]) {
    const node=ctx.createBiquadFilter();node.type=type;node.frequency.value=1000;node.Q.value=2;node.gain.value=gain;
    const magnitudes=new Float32Array(frequencies.length),phase=new Float32Array(frequencies.length);node.getFrequencyResponse(frequencies,magnitudes,phase);
    const expected=eqResponse([{type,enabled:true,params:{freq:1000,q:2,gain}}],Array.from(frequencies),rate);
    expected.forEach((value,i)=>{maxError=Math.max(maxError,Math.abs(value-20*Math.log10(magnitudes[i])));count++;});
   }
  }
  return {maxError,count};
 });
 assert.ok(accuracy.maxError<.0001,JSON.stringify(accuracy));
 await page.evaluate(async()=>{
  const {useUIStore}=await import('/src/stores/uiStore.ts');useUIStore.getState().setActivePanel('timeline');
  const {useProjectStore}=await import('/src/stores/projectStore.ts');const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts');
  window.eqStarts=0;const play=TimelineEngine.prototype.play;TimelineEngine.prototype.play=function(...args){window.eqStarts++;return play.apply(this,args);};
  const ctx=new OfflineAudioContext(1,1,48000),buffer=ctx.createBuffer(1,20*48000,48000);buffer.getChannelData(0).fill(.2);
  const effects=[{type:'peaking',enabled:true,params:{freq:1000,gain:0,q:1}},{type:'lowshelf',enabled:true,params:{freq:200,gain:-3}},{type:'highshelf',enabled:false,params:{freq:4000,gain:6}}];
  const clip={id:'c',trackId:'t',sourceId:'s',name:'Tone',startTime:0,sourceOffset:0,duration:20,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'};
  useProjectStore.getState().loadProjectState({id:'p',name:'EQ test',sampleRate:48000,duration:20,masterEffects:[],tracks:[{id:'t',name:'Mic',muted:false,solo:false,volume:1,pan:0,effects,segments:[clip]}]},new Map([['s',{id:'s',name:'tone',buffer,duration:20,sampleRate:48000,channels:1,peaks:[]}]]));useProjectStore.temporal.getState().clear();
 });
 await page.getByRole('button',{name:'Mixer',exact:true}).click();
 const mixer=page.getByRole('complementary',{name:'Mixer'});
 await mixer.getByRole('region',{name:'Mic',exact:true}).getByRole('button',{name:'Inserts · 3'}).click();
 const graph=mixer.locator('[data-equalizer]');await graph.waitFor();
 await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForFunction(()=>window.eqStarts===1);
 const point=graph.getByRole('button',{name:/Bell EQ 1:/});await point.scrollIntoViewIfNeeded();const box=await point.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+30,box.y+box.height/2-10,{steps:6});await page.mouse.up();
 const state=()=>page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return {effect:useProjectStore.getState().project.tracks[0].effects[0],past:useProjectStore.temporal.getState().pastStates.length,starts:window.eqStarts};});
 let result=await state();assert.ok(result.effect.params.freq>1000);assert.ok(result.effect.params.gain>0);assert.equal(result.past,1);assert.equal(result.starts,1);
 await point.focus();await page.keyboard.press('ArrowRight');result=await state();assert.equal(result.starts,1);assert.equal(result.past,2);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().undo();useProjectStore.temporal.getState().undo();});
 assert.deepEqual((await state()).effect.params,{freq:1000,gain:0,q:1});
 const gain=graph.getByRole('spinbutton',{name:'Gain (dB)'});await gain.fill('4.5');await gain.blur();
 assert.equal((await state()).effect.params.gain,4.5);assert.equal((await state()).starts,1);
 const frequency=graph.getByRole('spinbutton',{name:'Frequency (Hz)'});await frequency.fill('22000');await frequency.blur();assert.equal((await state()).effect.params.freq,22000);await point.focus();await page.keyboard.press('ArrowRight');assert.equal((await state()).effect.params.freq,22000);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.getState().updateTrack('t',{locked:true});});
 await point.focus();await page.keyboard.press('ArrowUp');assert.equal((await state()).effect.params.gain,4.5);
 await page.getByRole('button',{name:'Stop',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');});await graph.scrollIntoViewIfNeeded();
 const bounds=await graph.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
 await page.screenshot({path:'/tmp/crispaudio-eq-de.png'});
 console.log(JSON.stringify({response:accuracy,pointDrag:'passed',keyboard:'passed',oneUndoPerGesture:'passed',liveNoRestart:'passed',undoRestore:'passed',numeric:'passed',lock:'passed',germanNarrow:'passed'}));
} finally {await browser.close();}
