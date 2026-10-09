// Optional actual-WebKit trim dialog, undo and native recipe parity.
import {pathToFileURL} from 'node:url';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const {webkit,chromium}=await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href:'playwright');
const browser=process.env.CRISPAUDIO_CHROME_EXECUTABLE?await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE}):await webkit.launch({headless:true,...(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?{executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE}:{})});
const temp=await mkdtemp(join(tmpdir(),'crispaudio-trim-'));
const clip={id:'a',trackId:'mic',sourceId:'s',linkGroup:'left',startTime:0,sourceOffset:2,duration:5,gain:1,name:'a',color:'#fff',effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'};
const picture={id:'v',linkGroup:'left',startTime:0,sourceOffset:2,duration:5,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0};
const project={id:'p',name:'Trim fixture',sampleRate:48000,duration:10,masterEffects:[],tracks:[{id:'mic',name:'Mic',volume:1,pan:0,muted:false,solo:false,segments:[clip,{...clip,id:'b',linkGroup:'right',startTime:5,sourceOffset:7}]}],video:{path:'v.mp4',duration:20,session:{},clips:[picture,{...picture,id:'w',linkGroup:'right',startTime:5,sourceOffset:7}]}};
function semantic(p){return {duration:p.duration,tracks:p.tracks.map(t=>t.segments.map(c=>({start:c.startTime,length:c.duration,offset:c.sourceOffset}))),picture:p.video.clips.map(c=>({start:c.startTime,length:c.duration,offset:c.sourceOffset,transition:c.transition,transitionDuration:c.transitionDuration}))};}
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5190');await page.waitForLoadState('networkidle');
 await page.evaluate(async p=>{
  const {useUIStore}=await import('/src/stores/uiStore.ts');useUIStore.getState().setActivePanel('timeline');
  const {useProjectStore}=await import('/src/stores/projectStore.ts');const context=new OfflineAudioContext(1,1,48000);
  useProjectStore.getState().loadProjectState(p,new Map([['s',{id:'s',name:'s',duration:20,sampleRate:48000,channels:1,buffer:context.createBuffer(1,20*48000,48000),peaks:[]}]]));
  useProjectStore.getState().setSelection({segmentIds:['a','v'],startTime:0,endTime:5});useProjectStore.temporal.getState().clear();
 },project);
 await page.getByRole('button',{name:'Trim tools',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Move edge by (seconds)').fill('100');assert.equal(await dialog.getByRole('button',{name:'Apply edit'}).isEnabled(),false);
 await dialog.getByLabel('Move edge by (seconds)').fill('0.2');await dialog.getByRole('button',{name:'Apply edit'}).click();await dialog.waitFor({state:'hidden'});
 const edited=await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project;});
 assert.equal(edited.tracks[0].segments[1].startTime,5.2);assert.equal(edited.video.clips[1].startTime,5.2);assert.equal(edited.duration,10);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().undo();});
 const restored=await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project;});assert.deepEqual(semantic(restored),semantic(project));
 await page.getByRole('button',{name:'Next edit point',exact:true}).click();
 assert.equal(await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().playheadPosition;}),5);
 const parity=[];
 if(process.env.CRISPAUDIO_CLI){
  const input=join(temp,'input.crispaudio');await writeFile(input,JSON.stringify({format:'crispaudio-project',version:3,project,sources:[{id:'s',duration:20}]}));
  const operations=[{op:'roll',seconds:.2},{op:'roll',seconds:-.2},...['left','right'].flatMap(side=>[.2,-.2].map(seconds=>({op:'ripple-trim',side,seconds}))),{op:'trim-to-playhead',side:'right',at:4.8},{op:'trim-to-playhead',side:'left',at:.2}];
  for(const [index,op] of operations.entries()){
   const recipe=join(temp,`${index}.json`),output=join(temp,`${index}.crispaudio`);await writeFile(recipe,JSON.stringify([{...op,ids:['a']}]));
   execFileSync(process.env.CRISPAUDIO_CLI,['edit-project','--input',input,'--recipe',recipe,'--output',output]);
   const native=JSON.parse(await readFile(output,'utf8')).project;
   const frontend=await page.evaluate(async({p,op})=>{const {rollCut,rippleTrim,trimToPlayhead}=await import('/src/lib/trimEdits.ts');const s=new Map([['s',{duration:20}]]);return op.op==='roll'?rollCut(p,['a'],op.seconds,s):op.op==='ripple-trim'?rippleTrim(p,['a'],op.side,op.seconds,s):trimToPlayhead(p,['a'],op.side,op.at,s);},{p:project,op});
   assert.deepEqual(semantic(native),semantic(frontend));parity.push(op);
  }
 }
 const slideProject=structuredClone(project);slideProject.duration=15;
 slideProject.tracks[0].segments.push({...clip,id:'c',linkGroup:'last',startTime:10,sourceOffset:12});
 slideProject.video.clips.push({...picture,id:'x',linkGroup:'last',startTime:10,sourceOffset:12});
 await page.evaluate(async p=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.setState({project:p,selection:{segmentIds:['b'],startTime:5,endTime:10}});useProjectStore.temporal.getState().clear();},slideProject);
 await page.getByRole('button',{name:'Trim tools',exact:true}).click();
 await dialog.locator('select').selectOption('slide');
 await dialog.getByLabel('Move edge by (seconds)').fill('0.08');await dialog.getByRole('button',{name:'Apply edit'}).click();await dialog.waitFor({state:'hidden'});
 const slid=await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project;});
 assert.equal(slid.tracks[0].segments[1].startTime,5.08);assert.equal(slid.tracks[0].segments[1].sourceOffset,7);assert.equal(slid.duration,15);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().undo();});
 assert.deepEqual(semantic(await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project;})),semantic(slideProject));
 if(process.env.CRISPAUDIO_CLI){
  const input=join(temp,'slide.crispaudio');await writeFile(input,JSON.stringify({format:'crispaudio-project',version:3,project:slideProject,sources:[{id:'s',duration:20}]}));
  for(const seconds of [.08,-.08]){
   const recipe=join(temp,'slide.json'),output=join(temp,'slid.crispaudio');await rm(output,{force:true});await writeFile(recipe,JSON.stringify([{op:'slide',ids:['b'],seconds}]));
   execFileSync(process.env.CRISPAUDIO_CLI,['edit-project','--input',input,'--recipe',recipe,'--output',output]);
   const native=JSON.parse(await readFile(output,'utf8')).project;
   const frontend=await page.evaluate(async({p,seconds})=>{const {slideClips}=await import('/src/lib/trimEdits.ts');return slideClips(p,['b'],seconds,new Map([['s',{duration:20}]]));},{p:slideProject,seconds});
   assert.deepEqual(semantic(native),semantic(frontend));parity.push({op:'slide',seconds});
  }
 }
 const blendProject=structuredClone(project);blendProject.frameRate=25;
 Object.assign(blendProject.video.clips[1],{startTime:4.6,sourceOffset:6.6,duration:5.4,transition:'fade',transitionDuration:.4});
 await page.evaluate(async p=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.setState({project:p,selection:{segmentIds:['a'],startTime:0,endTime:5}});useProjectStore.temporal.getState().clear();},blendProject);
 await page.getByRole('button',{name:'Trim tools',exact:true}).click();await dialog.getByLabel('Move edge by (seconds)').fill('0.2');await dialog.getByRole('button',{name:'Apply edit'}).click();await dialog.waitFor({state:'hidden'});
 const rolled=await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project;});
 assert.equal(rolled.video.clips[1].transitionDuration,.4);assert.equal(rolled.video.clips[1].startTime,4.8);assert.equal(rolled.tracks[0].segments[1].startTime,5.2);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().undo();});
 assert.deepEqual(semantic(await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project;})),semantic(blendProject));
 if(process.env.CRISPAUDIO_CLI){
  const input=join(temp,'blend.crispaudio');await writeFile(input,JSON.stringify({format:'crispaudio-project',version:3,project:blendProject,sources:[{id:'s',duration:20}]}));
  for(const seconds of [.2,-.2]){
   const recipe=join(temp,'blend.json'),output=join(temp,'rolled.crispaudio');await rm(output,{force:true});await writeFile(recipe,JSON.stringify([{op:'roll',ids:['a'],seconds}]));
   execFileSync(process.env.CRISPAUDIO_CLI,['edit-project','--input',input,'--recipe',recipe,'--output',output]);
   const native=JSON.parse(await readFile(output,'utf8')).project;
   const frontend=await page.evaluate(async({p,seconds})=>{const {rollCut}=await import('/src/lib/trimEdits.ts');return rollCut(p,['a'],seconds,new Map([['s',{duration:20}]]));},{p:blendProject,seconds});
   assert.deepEqual(semantic(native),semantic(frontend));parity.push({op:'roll-blend',seconds});
  }
 }
 console.log(JSON.stringify({blendRoll:'passed',slide:'passed',dialog:'passed',handles:'blocked',undo:'passed',navigation:'passed',cliParity:parity.length}));
}finally{await browser.close();await rm(temp,{recursive:true,force:true});}
