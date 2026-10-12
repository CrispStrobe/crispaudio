import {timelineCommand} from './browser-command.mjs';
// Real audio graph and pointer regression; no installed project/media touched.
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href:'playwright');
const browser=await (process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?webkit:chromium).launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE||process.env.CRISPAUDIO_CHROME_EXECUTABLE});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true});
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5190');await page.waitForLoadState('networkidle');
 await page.evaluate(async()=>{
  const {useUIStore}=await import('/src/stores/uiStore.ts');useUIStore.getState().setActivePanel('timeline');
  const {useProjectStore}=await import('/src/stores/projectStore.ts');window.automationStore=useProjectStore;
  const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts');
  window.mixerStarts=0;const play=TimelineEngine.prototype.play;TimelineEngine.prototype.play=function(...args){window.mixerStarts++;window.mixerEngine=this;return play.apply(this,args);};
  const ctx=new OfflineAudioContext(2,1,48000),buffer=ctx.createBuffer(2,48000*20,48000);
  buffer.getChannelData(0).fill(.25);buffer.getChannelData(1).fill(-.25);
  const clip={id:'c',trackId:'t',sourceId:'s',name:'Tone',startTime:0,sourceOffset:0,duration:20,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'};
  useProjectStore.getState().loadProjectState({id:'p',name:'Mixer test',sampleRate:48000,duration:20,masterEffects:[],tracks:[{id:'t',name:'Room',muted:false,solo:false,volume:1,pan:0,segments:[clip]}]},new Map([['s',{id:'s',name:'tone',buffer,duration:20,sampleRate:48000,channels:2,peaks:[]}]]));useProjectStore.temporal.getState().clear();
 });

 await page.getByRole('button',{name:'Automation',exact:true}).click();
 const lane=page.locator('[data-gain-automation]'),svg=lane.locator('svg[role="group"]');await svg.waitFor();
 let box=await svg.boundingBox();
 const state=()=>page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return {points:useProjectStore.getState().project.tracks[0].automation,past:useProjectStore.temporal.getState().pastStates.length,future:useProjectStore.temporal.getState().futureStates.length};});
 await page.mouse.click(box.x+200,box.y+30);
 assert.equal((await state()).points.length,1);
 const point=lane.locator('[data-gain-point]').first();let pbox=await point.boundingBox();
 await page.mouse.move(pbox.x+pbox.width/2,pbox.y+pbox.height/2);await page.mouse.down();await page.mouse.move(box.x+250,box.y+50,{steps:4});
 assert.equal((await state()).past,1);await page.mouse.up();assert.equal((await state()).past,2);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().undo();});
 const before=await state();pbox=await point.boundingBox();
 await page.mouse.move(pbox.x+pbox.width/2,pbox.y+pbox.height/2);await page.mouse.down();await page.mouse.move(box.x+260,box.y+80,{steps:4});await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await state(),before);
 await point.focus();await page.keyboard.press('ArrowRight');assert.ok((await state()).points[0].time>before.points[0].time);assert.equal((await state()).past,2);
 await page.waitForTimeout(50);const firstNudge=(await state()).points[0].time;await page.keyboard.press('ArrowRight');assert.ok((await state()).points[0].time>firstNudge);
 const input=lane.getByRole('spinbutton',{name:'Point time (s)'});await input.fill('3');await input.press('Enter');assert.equal((await state()).points[0].time,3);
 const gain=lane.getByRole('spinbutton',{name:'Point gain (dB)'});await gain.fill('-6');await gain.press('Enter');assert.ok(Math.abs((await state()).points[0].value-10**(-6/20))<1e-12);
 await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForFunction(()=>window.mixerStarts===1);
 await gain.fill('-12');await gain.press('Enter');await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.mixerStarts),1);
 await page.waitForFunction(()=>{const channels=window.mixerEngine.getMeter('t');if(!channels)return false;const a=new Float32Array(2048);channels[0].getFloatTimeDomainData(a);const peak=Math.max(...a.map(Math.abs));return peak>.06&&peak<.065;});
 await page.getByRole('button',{name:'Stop',exact:true}).click();
 const verification=await page.evaluate(async()=>{
  const {useProjectStore}=await import('/src/stores/projectStore.ts');const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts');const {serializeProject,deserializeProject}=await import('/src/lib/projectFile.ts');const {editTimeRange}=await import('/src/lib/rangeEdits.ts');
  const state=useProjectStore.getState(),engine=new TimelineEngine(new AudioContext());engine.setSources(state.sources);
  const p={...state.project,tracks:state.project.tracks.map(t=>({...t,automation:[{time:0,value:0},{time:2,value:1},{time:4,value:.5},{time:20,value:0}]}))};
  const saved=await serializeProject(p,state.sources),loaded=await deserializeProject(saved,new OfflineAudioContext(2,1,48000));
  const full=await engine.renderToBuffer(p,0,5),section=await engine.renderToBuffer(p,1,3);
  let error=0;for(let c=0;c<2;c++)for(let i=0;i<section.length;i++)error=Math.max(error,Math.abs(section.getChannelData(c)[i]-full.getChannelData(c)[i+48000]));
  const edited=editTimeRange(p,2,3,'extract');useProjectStore.getState().loadProjectState(loaded.project,loaded.sources);
  return {error,points:loaded.project.tracks[0].automation,edited:edited.tracks[0].automation};
 });assert.ok(verification.error<1e-7);assert.equal(verification.points.length,4);assert.ok(verification.edited.length>=4);

 const savedState=await state(),temp=await mkdtemp(join(tmpdir(),'crispaudio-automation-'));
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();const savedPath=join(temp,'saved.crispaudio');await (await download).saveAs(savedPath);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.getState().updateTrack('t',{automation:[]});});
 const choose=page.waitForEvent('filechooser');await timelineCommand(page,'Open Project…');await (await choose).setFiles(savedPath);
 await page.waitForFunction(()=>window.automationStore.getState().project.tracks[0].automation?.length===4);
 assert.deepEqual((await state()).points,savedState.points);
 // A release without movement and a cancelled blank-space addition retain redo/history.
 const noOp=await state();box=await svg.boundingBox();pbox=await lane.locator('[data-gain-point]').first().boundingBox();
 await page.mouse.move(pbox.x+pbox.width/2,pbox.y+pbox.height/2);await page.mouse.down();await page.mouse.up();assert.deepEqual(await state(),noOp);
 await page.mouse.move(box.x+125,box.y+80);await page.mouse.down();await page.mouse.move(box.x+140,box.y+70);await svg.dispatchEvent('pointercancel');await page.mouse.up();assert.deepEqual(await state(),noOp);
 await lane.locator('[data-gain-point]').first().focus();await page.keyboard.press('Delete');assert.equal((await state()).points.length,3);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().undo();});assert.deepEqual((await state()).points,noOp.points);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.getState().updateTrack('t',{locked:true});});
 const locked=await state();await page.mouse.click(box.x+100,box.y+70);assert.deepEqual(await state(),locked);
 await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');});
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.getState().updateTrack('t',{locked:false});});
 box=await svg.boundingBox();const touchBefore=await state();await page.touchscreen.tap(box.x+80,box.y+85);assert.equal((await state()).points.length,touchBefore.points.length+1);
 const bounds=await lane.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
 const overflow=await lane.evaluate(el=>el.scrollWidth>el.clientWidth);assert.equal(overflow,false);
 await page.screenshot({path:'/tmp/crispaudio-automation-de.png'});
 console.log(JSON.stringify({pointerCommit:'passed',cancelRedo:'passed',keyboard:'passed',numeric:'passed',touchAdd:'passed',pointerCancel:'passed',noOp:'passed',deleteUndo:'passed',liveEnvelope:'passed',noRestart:'passed',saveOpen:'passed',rangeError:verification.error,locks:'passed',german390:'passed'}));
} finally {await browser.close();}
