import {timelineCommand} from './browser-command.mjs';
// Optional real-browser pan editing and native PCM comparison; owned fixtures only.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const {chromium,webkit}=await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href:'playwright');
const browser=await (process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?webkit:chromium).launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE||process.env.CRISPAUDIO_CHROME_EXECUTABLE});
const temp=await mkdtemp(join(tmpdir(),'crispaudio-pan-'));
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true});
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5190');await page.waitForLoadState('networkidle');
 await page.evaluate(async()=>{
  const {useUIStore}=await import('/src/stores/uiStore.ts');useUIStore.getState().setActivePanel('timeline');
  const {useProjectStore}=await import('/src/stores/projectStore.ts');window.panStore=useProjectStore;
  const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts');window.panStarts=0;
  const play=TimelineEngine.prototype.play;TimelineEngine.prototype.play=function(...args){window.panStarts++;window.panEngine=this;return play.apply(this,args);};
  const ctx=new OfflineAudioContext(2,1,48000),buffer=ctx.createBuffer(2,48000*4,48000);buffer.getChannelData(0).fill(.25);buffer.getChannelData(1).fill(-.125);
  const clip={id:'c',trackId:'t',sourceId:'s',name:'Tone',startTime:0,sourceOffset:0,duration:4,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'};
  useProjectStore.getState().loadProjectState({id:'p',name:'Pan test',sampleRate:48000,duration:4,masterEffects:[],tracks:[{id:'t',name:'Room',volume:1,pan:.6,muted:false,solo:false,segments:[clip]}]},new Map([['s',{id:'s',name:'Tone',buffer,duration:4,sampleRate:48000,channels:2,peaks:[]}]]));useProjectStore.temporal.getState().clear();
 });
 const state=()=>page.evaluate(()=>({project:window.panStore.getState().project,past:window.panStore.temporal.getState().pastStates.length,future:window.panStore.temporal.getState().futureStates.length}));
 await page.getByRole('button',{name:'Automation',exact:true}).click();let lane=page.locator('[data-gain-automation]');await lane.getByRole('combobox',{name:'Parameter'}).selectOption('pan');
 const svg=lane.locator('svg[role="group"]');let box=await svg.boundingBox();await page.mouse.click(box.x+100,box.y+79);
 assert.equal((await state()).project.tracks[0].panAutomation.length,1);assert.ok((await state()).project.tracks[0].panAutomation[0].value<0);
 let point=lane.locator('[data-gain-point]').first();await point.focus();await page.keyboard.press('ArrowUp');const nudged=await state();
 await page.waitForTimeout(50);await page.keyboard.press('ArrowRight');assert.ok((await state()).project.tracks[0].panAutomation[0].time>nudged.project.tracks[0].panAutomation[0].time);
 let input=lane.getByRole('spinbutton',{name:'Point pan (−1…1)'});await input.fill('-1');await input.press('Enter');assert.equal((await state()).project.tracks[0].panAutomation[0].value,-1);
 const before=await state();const pbox=await point.boundingBox();await page.mouse.move(pbox.x+pbox.width/2,pbox.y+pbox.height/2);await page.mouse.down();await page.mouse.move(box.x+140,box.y+10);await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await state(),before);
 // Switching parameters during a keyboard preview cancels without a project edit.
 await point.focus();await page.keyboard.down('ArrowUp');await lane.getByRole('combobox',{name:'Parameter'}).selectOption('gain');await page.keyboard.up('ArrowUp');assert.deepEqual(await state(),before);await lane.getByRole('combobox',{name:'Parameter'}).selectOption('pan');
 await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForFunction(()=>window.panStarts===1);
 point=lane.locator('[data-gain-point]').first();await point.focus();input=lane.getByRole('spinbutton',{name:'Point pan (−1…1)'});await input.fill('1');await input.press('Enter');await page.waitForFunction(()=>{const nodes=window.panEngine.getMeter('t');if(!nodes)return false;const a=new Float32Array(2048);nodes[0].getFloatTimeDomainData(a);return Math.max(...a.map(Math.abs))<1e-5;});assert.equal(await page.evaluate(()=>window.panStarts),1);
 await point.focus();await page.keyboard.press('Delete');await page.waitForFunction(()=>{const nodes=window.panEngine.getMeter('t');const a=new Float32Array(2048);nodes[0].getFloatTimeDomainData(a);return Math.max(...a.map(Math.abs))>.14;});assert.equal(await page.evaluate(()=>window.panStarts),1);await page.getByRole('button',{name:'Stop',exact:true}).click();
 await page.evaluate(()=>window.panStore.temporal.getState().undo());assert.equal((await state()).project.tracks[0].panAutomation[0].value,1);
 const save=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();const saved=join(temp,'saved.crispaudio');await (await save).saveAs(saved);
 await page.evaluate(()=>window.panStore.getState().updateTrack('t',{panAutomation:[]}));const pick=page.waitForEvent('filechooser');await timelineCommand(page,'Open Project…');await (await pick).setFiles(saved);await page.waitForFunction(()=>window.panStore.getState().project.tracks[0].panAutomation?.[0]?.value===1);
 await page.evaluate(()=>window.panStore.getState().updateTrack('t',{locked:true}));const locked=await state();box=await svg.boundingBox();await page.mouse.click(box.x+200,box.y+10);await lane.locator('[data-gain-point]').first().focus();await page.keyboard.press('Delete');assert.deepEqual(await state(),locked);await page.evaluate(()=>window.panStore.getState().updateTrack('t',{locked:false}));
 const audio=[];
 for(const channels of [1,2]){
  const reference=await page.evaluate(async(channels)=>{
   const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts');const state=window.panStore.getState();const ctx=new AudioContext({sampleRate:48000}),buffer=ctx.createBuffer(channels,48000*4,48000);buffer.getChannelData(0).fill(.25);if(channels===2)buffer.getChannelData(1).fill(-.125);
   const project={...state.project,tracks:state.project.tracks.map(t=>({...t,pan:.6,panAutomation:[{time:.5,value:1},{time:.5,value:-1},{time:1.5,value:1},{time:2.5,value:0}]}))};
   const engine=new TimelineEngine(ctx);engine.setSources(new Map([['s',{...state.sources.get('s'),buffer,channels}]]));const full=await engine.renderToBuffer(project),range=await engine.renderToBuffer(project,.75,2.75);let rangeError=0;
   for(let ch=0;ch<2;ch++)for(let i=0;i<range.length;i++)rangeError=Math.max(rangeError,Math.abs(range.getChannelData(ch)[i]-full.getChannelData(ch)[i+36000]));
   await ctx.close();return {project,rangeError,samples:Array.from({length:full.length*2},(_,i)=>full.getChannelData(i%2)[Math.floor(i/2)])};
  },channels);
  // Pan ramps and trigonometry use browser float arithmetic; budget two parts
  // in ten million of full scale for independent seeked ramps (not bit identity).
  assert.ok(reference.rangeError<2e-7,`Range error ${reference.rangeError}`);
  let nativeError;
  if(process.env.CRISPAUDIO_TEST_CLI){
   const source=join(temp,`source-${channels}.wav`),data=Buffer.alloc(48000*4*channels*4);for(let i=0;i<48000*4;i++)for(let ch=0;ch<channels;ch++)data.writeFloatLE(ch===0?.25:-.125,(i*channels+ch)*4);
   const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+data.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(3,20);h.writeUInt16LE(channels,22);h.writeUInt32LE(48000,24);h.writeUInt32LE(48000*channels*4,28);h.writeUInt16LE(channels*4,32);h.writeUInt16LE(32,34);h.write('data',36);h.writeUInt32LE(data.length,40);await writeFile(source,Buffer.concat([h,data]));
   const original={...reference.project,tracks:reference.project.tracks.map(t=>({...t,panAutomation:undefined}))};const input=join(temp,`input-${channels}.crispaudio`),recipe=join(temp,`recipe-${channels}.json`),edited=join(temp,`edited-${channels}.crispaudio`),wav=join(temp,`mix-${channels}.wav`);
   await writeFile(input,JSON.stringify({format:'crispaudio-project',version:3,project:original,sources:[{id:'s',path:source,duration:4,channels,sampleRate:48000}]}));await writeFile(recipe,JSON.stringify([{op:'automation',parameter:'pan',trackId:'t',points:reference.project.tracks[0].panAutomation}]));execFileSync(process.env.CRISPAUDIO_TEST_CLI,['edit-project','--input',input,'--recipe',recipe,'--output',edited]);
   const actual=JSON.parse(await readFile(edited,'utf8'));assert.deepEqual(actual.project.tracks[0].panAutomation,[{time:.5,value:-1},{time:1.5,value:1},{time:2.5,value:0}]);
   execFileSync(process.env.CRISPAUDIO_TEST_CLI,['render-project','--input',edited,'--output',wav,'--backend','apple']);const bytes=await readFile(wav);let pcm;for(let offset=12;offset+8<=bytes.length;){const len=bytes.readUInt32LE(offset+4);if(bytes.toString('ascii',offset,offset+4)==='data'){pcm=bytes.subarray(offset+8,offset+8+len);break;}offset+=8+len+len%2;}
   assert.equal(pcm.length,reference.samples.length*4);nativeError=0;for(let i=0;i<reference.samples.length;i++)nativeError=Math.max(nativeError,Math.abs(pcm.readFloatLE(i*4)-reference.samples[i]));assert.ok(nativeError<2e-7,`Native error ${nativeError}`);
  }
  audio.push({channels,frames:reference.samples.length/2,rangeError:reference.rangeError,nativeError});
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');});box=await svg.boundingBox();await page.touchscreen.tap(box.x+80,box.y+79);assert.ok((await state()).project.tracks[0].panAutomation.length>=2);
 assert.equal(await lane.evaluate(el=>el.scrollWidth>el.clientWidth),false);await page.screenshot({path:'/tmp/crispaudio-pan-de.png'});
 console.log(JSON.stringify({pointerKeyboardCancel:'passed',parameterSwitchCancel:'passed',liveNoRestartAndStaticFallback:'passed',saveOpen:'passed',locks:'passed',germanTouch390:'passed',audio,temp}));
}finally{await browser.close();}
