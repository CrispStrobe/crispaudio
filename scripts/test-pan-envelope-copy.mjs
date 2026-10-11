// Optional actual pan envelope copy/paste + native recipe/render audit. Own fixtures only.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href:'playwright');
const browser=await (process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?webkit:chromium).launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE||process.env.CRISPAUDIO_CHROME_EXECUTABLE});
const temp=await mkdtemp(join(tmpdir(),'crispaudio-pan-envelope-'));
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true});
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5190');await page.waitForLoadState('networkidle');
 await page.evaluate(async()=>{
  const {useUIStore}=await import('/src/stores/uiStore.ts');useUIStore.getState().setActivePanel('timeline');
  const {useProjectStore}=await import('/src/stores/projectStore.ts');window.envelopeStore=useProjectStore;
  const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts');window.envelopeStarts=0;const play=TimelineEngine.prototype.play;TimelineEngine.prototype.play=function(...args){window.envelopeStarts++;return play.apply(this,args);};
  const ctx=new OfflineAudioContext(2,1,48000),buffer=ctx.createBuffer(2,48000*20,48000);buffer.getChannelData(0).fill(.25);buffer.getChannelData(1).fill(-.125);
  const clip={id:'c',trackId:'a',sourceId:'s',name:'Tone',startTime:0,sourceOffset:0,duration:20,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'};
  useProjectStore.getState().loadProjectState({id:'p',name:'Envelope copy',sampleRate:48000,duration:20,masterEffects:[],markers:[{id:'m',name:'Marker',time:10}],tracks:[
   {id:'a',name:'Source',locked:true,muted:true,solo:false,volume:1,pan:0,segments:[clip],panAutomation:[{time:0,value:-1},{time:4,value:1},{time:8,value:-1},{time:20,value:-1}]},
   {id:'b',name:'Destination',muted:false,solo:false,volume:1,pan:0,segments:[{...clip,id:'d',trackId:'b'}],panAutomation:[{time:0,value:-.5},{time:20,value:.5}]},
  ]},new Map([['s',{id:'s',name:'tone',buffer,duration:20,sampleRate:48000,channels:2,peaks:[]}]]));
  useProjectStore.getState().setEditRange(1,7);window.envelopeOriginal=useProjectStore.getState().project;useProjectStore.temporal.getState().clear();
 });
 const state=()=>page.evaluate(()=>({project:window.envelopeStore.getState().project,past:window.envelopeStore.temporal.getState().pastStates.length,future:window.envelopeStore.temporal.getState().futureStates.length}));
 await page.getByRole('button',{name:'Automation',exact:true}).click();const lane=page.locator('[data-gain-automation]');await lane.getByRole('combobox',{name:'Parameter'}).selectOption('pan');
 await lane.getByRole('button',{name:'Copy pan envelope / selected range',exact:true}).click();assert.equal((await state()).past,0);
 const copied=await page.evaluate(()=>window.envelopeStore.getState().panClipboard);assert.deepEqual(copied.points,[{time:0,value:-.5},{time:3,value:1},{time:6,value:-.5}]);
 await lane.getByRole('combobox',{name:'Automation track'}).selectOption('b');
 const open=()=>lane.getByRole('button',{name:'Paste pan envelope',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Paste pan envelope'});
 const bounds=async(time,duration)=>{await dialog.getByRole('spinbutton',{name:'Destination time (s)'}).fill(time);await dialog.getByRole('spinbutton',{name:'Destination length (s)'}).fill(duration);};
 await open();await bounds('4','3');await page.keyboard.press('Escape');assert.equal((await state()).past,0);assert.equal(await dialog.count(),0);
 await open();await bounds('19','3');assert.equal(await dialog.getByRole('button',{name:'Paste',exact:true}).isEnabled(),false);await bounds('4','3');
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForFunction(()=>window.envelopeStarts===1);await open();await bounds('4','3');
 await dialog.getByRole('button',{name:'Paste',exact:true}).click();assert.equal((await state()).past,1);assert.equal(await page.evaluate(()=>window.envelopeStarts),1);
 await page.getByRole('button',{name:'Stop',exact:true}).click();const pasted=await state();
 const result=await page.evaluate(async()=>{
  const {panAt}=await import('/src/lib/mixAutomation.ts');const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts');const state=window.envelopeStore.getState();const before=window.envelopeOriginal,after=state.project;
  const engine=new TimelineEngine(new AudioContext());engine.setSources(state.sources);const a=await engine.renderToBuffer(before,0,10),b=await engine.renderToBuffer(after,0,10);
  let outside=0,inside=0;for(let c=0;c<2;c++)for(let i=0;i<a.length;i++){const error=Math.abs(a.getChannelData(c)[i]-b.getChannelData(c)[i]);if(i<4*48000-1||i>7*48000+1)outside=Math.max(outside,error);else inside=Math.max(inside,error);}
  return {outside,inside,middle:panAt(after.tracks[1].panAutomation,5.5),left:panAt(after.tracks[1].panAutomation,4),right:panAt(after.tracks[1].panAutomation,7)};
 });assert.ok(result.outside<2e-7);assert.ok(result.inside>.1);assert.equal(result.middle,1);assert.equal(result.left,-.5);assert.equal(result.right,-.5);
 await page.evaluate(()=>window.envelopeStore.temporal.getState().undo());assert.deepEqual((await state()).project.tracks[1].panAutomation,[{time:0,value:-.5},{time:20,value:.5}]);

 const undone=await state();await open();await bounds('4','3');await page.keyboard.press('Escape');assert.deepEqual(await state(),undone);
 await page.evaluate(()=>window.envelopeStore.temporal.getState().redo());assert.deepEqual((await state()).project,pasted.project);
 const save=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();const saved=join(temp,'saved.crispaudio');await (await save).saveAs(saved);
 await page.evaluate(()=>window.envelopeStore.getState().updateTrack('b',{panAutomation:[]}));const pick=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open project',exact:true}).click();await (await pick).setFiles(saved);
 await page.waitForFunction(()=>window.envelopeStore.getState().project.tracks[1].panAutomation?.length===7);assert.deepEqual((await state()).project.tracks[1].panAutomation,pasted.project.tracks[1].panAutomation);
 // Dialog snapshots reject changes while it is open, including an indirect lock.
 await open();await page.evaluate(()=>window.envelopeStore.getState().updateTrack('b',{locked:true}));assert.equal(await dialog.getByRole('button',{name:'Paste',exact:true}).isEnabled(),false);await page.keyboard.press('Escape');assert.equal(await lane.getByRole('button',{name:'Paste pan envelope',exact:true}).isEnabled(),false);
 await page.evaluate(()=>window.envelopeStore.getState().updateTrack('b',{locked:false}));
 let native;
 if(process.env.CRISPAUDIO_TEST_CLI){
  const project=await page.evaluate(()=>window.envelopeOriginal),source=join(temp,'source.wav');
  const samples=Buffer.alloc(48000*20*8);for(let i=0;i<48000*20;i++){samples.writeFloatLE(.25,i*8);samples.writeFloatLE(-.125,i*8+4);}
  const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+samples.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(3,20);header.writeUInt16LE(2,22);header.writeUInt32LE(48000,24);header.writeUInt32LE(384000,28);header.writeUInt16LE(8,32);header.writeUInt16LE(32,34);header.write('data',36);header.writeUInt32LE(samples.length,40);await writeFile(source,Buffer.concat([header,samples]));
  const doc={format:'crispaudio-project',version:3,project,sources:[{id:'s',path:source,duration:20,sampleRate:48000,channels:2}]};
  const input=join(temp,'native.crispaudio'),recipe=join(temp,'recipe.json'),edited=join(temp,'edited.crispaudio');await writeFile(input,JSON.stringify(doc));await writeFile(recipe,JSON.stringify([{op:'paste-automation',parameter:'pan',trackId:'b',sourceTrackId:'a',sourceStart:1,sourceEnd:7,time:4,duration:3}]));
  execFileSync(process.env.CRISPAUDIO_TEST_CLI,['edit-project','--input',input,'--recipe',recipe,'--output',edited]);const actual=JSON.parse(await readFile(edited,'utf8'));
  assert.deepEqual(actual.project,pasted.project);
  // The portable clipboard form must produce the same result as copying in the recipe.
  const portable=join(temp,'portable.crispaudio');await writeFile(recipe,JSON.stringify([{op:'paste-automation',parameter:'pan',trackId:'b',envelope:copied,time:4,duration:3}]));execFileSync(process.env.CRISPAUDIO_TEST_CLI,['edit-project','--input',input,'--recipe',recipe,'--output',portable]);assert.deepEqual(JSON.parse(await readFile(portable,'utf8')).project,pasted.project);
  const wav=join(temp,'mix.wav');execFileSync(process.env.CRISPAUDIO_TEST_CLI,['render-project','--input',edited,'--output',wav,'--backend','apple']);const bytes=await readFile(wav);let pcm;
  for(let offset=12;offset+8<=bytes.length;){const length=bytes.readUInt32LE(offset+4);if(bytes.toString('ascii',offset,offset+4)==='data'){pcm=bytes.subarray(offset+8,offset+8+length);break;}offset+=8+length+length%2;}assert.ok(pcm);assert.equal(pcm.length,48000*20*8);
  const indices=[0,1,48000,4*48000-1,4*48000,4*48000+1,5.5*48000,7*48000-1,7*48000,7*48000+1,9*48000,20*48000-1];
  const reference=await page.evaluate(async(indices)=>{const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts');const state=window.envelopeStore.getState(),engine=new TimelineEngine(new AudioContext());engine.setSources(state.sources);const output=await engine.renderToBuffer(state.project);return indices.map(i=>[output.getChannelData(0)[i],output.getChannelData(1)[i]]);},indices);
  let error=0;indices.forEach((i,n)=>{for(let ch=0;ch<2;ch++)error=Math.max(error,Math.abs(pcm.readFloatLE((i*2+ch)*4)-reference[n][ch]));});assert.ok(error<2e-7);native={recipeParity:'passed',portableParity:'passed',frames:48000*20,sampleError:error};
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');});await lane.getByRole('button',{name:'Panoramakurve einfügen',exact:true}).tap();
 const german=page.getByRole('dialog',{name:'Panoramakurve einfügen'}),rect=await german.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=390);assert.equal(await german.evaluate(el=>el.scrollWidth>el.clientWidth),false);await page.waitForTimeout(250);await page.screenshot({path:'/tmp/crispaudio-pan-envelope-copy-de.png'});
 console.log(JSON.stringify({copyBoundaryValues:'passed',crossTrackStretch:'passed',bounds:'passed',cancelRedo:'passed',pasteUndoRedo:'passed',liveNoRestart:'passed',saveOpen:'passed',locksAndStaleDialog:'passed',germanTouch390:'passed',audio:result,native,temp}));
} finally {await browser.close();}
