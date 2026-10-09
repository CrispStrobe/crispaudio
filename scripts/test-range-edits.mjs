// Optional real-WebKit dialog/undo and native CLI semantic parity check.
import {pathToFileURL} from 'node:url';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const {webkit}=await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href:'playwright');
const browser=await webkit.launch({headless:true,...(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?{executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE}:{})});
const temp=await mkdtemp(join(tmpdir(),'crispaudio-range-'));
const clip={id:'a',trackId:'mic',sourceId:'s',linkGroup:'av',startTime:0,duration:10,sourceOffset:0,gain:1,name:'sound',color:'#fff',effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'};
const project={id:'p',name:'Range fixture',sampleRate:48000,duration:15,minimumDuration:15,masterEffects:[],editRange:{start:3,end:5},markers:[{id:'m',time:8,name:'end'}],transcript:[{id:'cue',start:7,end:9,text:'answer'}],tracks:[
 {id:'mic',name:'Mic',volume:1,pan:0,muted:false,solo:false,automation:[{time:0,value:0},{time:10,value:1}],segments:[clip]},
 {id:'music',name:'Music',rippleEnabled:false,volume:1,pan:0,muted:false,solo:false,segments:[{...clip,id:'music-clip',trackId:'music',linkGroup:undefined}]}],video:{path:'video.mp4',duration:10,session:{},clips:[{id:'v',linkGroup:'av',startTime:0,duration:10,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0}]}};
// IDs are intentionally generated independently; compare positions and link membership.
function semantic(p){return {duration:p.duration,minimumDuration:p.minimumDuration,markers:p.markers,transcript:p.transcript,editRange:p.editRange??null,tracks:p.tracks.map(t=>({id:t.id,automation:t.automation??null,segments:t.segments.map(c=>({start:c.startTime,duration:c.duration,offset:c.sourceOffset,linked:!!c.linkGroup}))})),video:p.video.clips.map(c=>({start:c.startTime,duration:c.duration,offset:c.sourceOffset,linked:!!c.linkGroup}))};}
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5190');await page.waitForLoadState('networkidle');
 await page.evaluate(async p=>{
  const {useUIStore}=await import('/src/stores/uiStore.ts');useUIStore.getState().setActivePanel('timeline');
  const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.getState().loadProjectState(p,new Map());useProjectStore.temporal.getState().clear();
 },project);
 await page.getByRole('button',{name:'Edit time range',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Video',{exact:true}).uncheck();
 assert.equal(await dialog.getByRole('button',{name:'Apply edit'}).isEnabled(),false);
 await dialog.getByLabel('Video',{exact:true}).check();
 await dialog.getByRole('button',{name:'Save scope'}).click();
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().clear();});
 await dialog.getByRole('button',{name:'Apply edit'}).click();
 await dialog.waitFor({state:'hidden'});
 const edited=await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project;});
 assert.equal(edited.duration,13);assert.equal(edited.tracks[1].segments[0].duration,10);
 assert.equal(edited.video.clips[1].linkGroup,edited.tracks[0].segments[1].linkGroup);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().undo();});
 const undo=await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project;});
 assert.deepEqual(semantic(undo),semantic(project));assert.equal(undo.tracks[1].rippleEnabled,false);
 const results=[];
 if(process.env.CRISPAUDIO_CLI){
  const input=join(temp,'input.crispaudio');await writeFile(input,JSON.stringify({format:'crispaudio-project',version:3,project,sources:[]}));
  for(const operation of ['lift','extract','insert']){
   const recipe=join(temp,`${operation}.json`),output=join(temp,`${operation}.crispaudio`);
   await writeFile(recipe,JSON.stringify([{op:'range-edit',operation,start:3,end:5}]));
   execFileSync(process.env.CRISPAUDIO_CLI,['edit-project','--input',input,'--recipe',recipe,'--output',output]);
   const native=JSON.parse(await readFile(output,'utf8')).project;
   const frontend=await page.evaluate(async({p,operation})=>{const {editTimeRange}=await import('/src/lib/rangeEdits.ts');return editTimeRange(p,3,5,operation);},{p:project,operation});
   assert.deepEqual(semantic(native),semantic(frontend));results.push({operation,duration:native.duration});
  }
 }
 let realProject;
 if(process.env.CRISPAUDIO_CLI&&process.env.CRISPAUDIO_PROJECT){
  const document=JSON.parse(await readFile(process.env.CRISPAUDIO_PROJECT,'utf8'));
  const recipe=join(temp,'real.json'),output=join(temp,'real.crispaudio');
  await writeFile(recipe,JSON.stringify([{op:'range-edit',operation:'extract',start:45,end:47}]));
  execFileSync(process.env.CRISPAUDIO_CLI,['edit-project','--input',process.env.CRISPAUDIO_PROJECT,'--recipe',recipe,'--output',output]);
  const native=JSON.parse(await readFile(output,'utf8')).project;
  const frontend=await page.evaluate(async p=>{const {editTimeRange}=await import('/src/lib/rangeEdits.ts');return editTimeRange(p,45,47,'extract');},document.project);
  assert.deepEqual(semantic(native),semantic(frontend));realProject={name:native.name,before:document.project.duration,after:native.duration};
 }
 console.log(JSON.stringify({dialog:'passed',partialLinks:'blocked',undo:'passed',cliParity:results,realProject}));
}finally{await browser.close();await rm(temp,{recursive:true,force:true});}
