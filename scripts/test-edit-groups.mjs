// Optional actual-WebKit groups/command search and native recipe parity.
import {pathToFileURL} from 'node:url';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const {webkit}=await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href:'playwright');
const browser=await webkit.launch({headless:true,...(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?{executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE}:{})});
const temp=await mkdtemp(join(tmpdir(),'crispaudio-groups-'));
const clip={id:'a',trackId:'t',sourceId:'s',linkGroup:'av',startTime:0,duration:2,sourceOffset:0,gain:1,name:'Mic',color:'#fff',effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'};
const project={id:'p',name:'Groups fixture',sampleRate:48000,duration:6,masterEffects:[],tracks:[{id:'t',name:'Track',muted:false,solo:false,volume:1,pan:0,segments:[clip,{...clip,id:'b',linkGroup:undefined,startTime:4}]}],video:{path:'v.mp4',duration:20,session:{},clips:[{id:'v',linkGroup:'av',startTime:0,duration:2,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0}]}};
function semantic(p){return {enabled:p.groupEditingEnabled??true,clips:[...p.tracks.flatMap(t=>t.segments),...p.video.clips].map(c=>({id:c.id,start:c.startTime,duration:c.duration,link:c.linkGroup??null,group:c.editGroup?.name??null}))};}
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5190');await page.waitForLoadState('networkidle');
 await page.evaluate(async p=>{const {useUIStore}=await import('/src/stores/uiStore.ts');useUIStore.getState().setActivePanel('timeline');const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.getState().loadProjectState(p,new Map());useProjectStore.getState().setSelection({segmentIds:['a','b'],startTime:0,endTime:6});},project);
 await page.getByRole('button',{name:'Named edit groups',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Group name',{exact:true}).fill('Section');await dialog.getByRole('button',{name:'Create / rename group from selection',exact:true}).click();
 const grouped=await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.getState().selectSegment('a');return {p:useProjectStore.getState().project,selection:useProjectStore.getState().selection};});
 assert.deepEqual(grouped.selection.segmentIds,['a','b','v']);assert.equal(grouped.p.video.clips[0].editGroup.name,'Section');
 await dialog.getByLabel('Enable group editing',{exact:true}).uncheck();
 const single=await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.getState().selectSegment('a');return useProjectStore.getState().selection;});assert.deepEqual(single.segmentIds,['a','v']);
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 await page.keyboard.press('Control+k');const search=page.getByRole('dialog');await search.getByRole('textbox',{name:'Search commands…'}).fill('Add Audio Track');await page.keyboard.press('Enter');await search.waitFor({state:'hidden'});
 await page.waitForFunction(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project.tracks.length===2;});
 await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');});
 await page.getByRole('button',{name:'Benannte Schnittgruppen',exact:true}).click();
 const overflow=await page.getByRole('dialog').evaluate(el=>[...el.querySelectorAll('button,input')].filter(child=>{const r=child.getBoundingClientRect();return r.width>0&&(r.left<0||r.right>innerWidth+1||child.scrollWidth>child.clientWidth+2);}).map(el=>el.textContent));assert.deepEqual(overflow,[]);
 await page.keyboard.press('Escape');
 let parity=0;
 if(process.env.CRISPAUDIO_CLI){
  const input=join(temp,'input.crispaudio');await writeFile(input,JSON.stringify({format:'crispaudio-project',version:3,project,sources:[{id:'s',duration:20}]}));
  for(const [index,tail] of [[],[{op:'move',ids:['a'],seconds:1}],[{op:'unlink',ids:['a']}],[{op:'group-editing',enabled:false},{op:'move',ids:['b'],seconds:1}]].entries()){
   const recipe=join(temp,`${index}.json`),output=join(temp,`${index}.crispaudio`);await writeFile(recipe,JSON.stringify([{op:'edit-group',ids:['a','b'],name:'Section'},...tail]));execFileSync(process.env.CRISPAUDIO_CLI,['edit-project','--input',input,'--recipe',recipe,'--output',output]);
   const native=JSON.parse(await readFile(output,'utf8')).project;
   const frontend=await page.evaluate(async({p,tail})=>{const {nameEditGroup,moveClips,linkClips}=await import('/src/lib/projectEdits.ts');let out=nameEditGroup(p,['a','b'],'Section');for(const op of tail){if(op.op==='move')out=moveClips(out,op.ids,op.seconds);if(op.op==='unlink')out=linkClips(out,op.ids,true);if(op.op==='group-editing')out={...out,groupEditingEnabled:op.enabled};}return out;},{p:project,tail});assert.deepEqual(semantic(native),semantic(frontend));parity++;
  }
 }
 console.log(JSON.stringify({groupUI:'passed',disableKeepsAVLinks:'passed',commandSearch:'passed',germanPhoneLayout:'passed',cliParity:parity}));
}finally{await browser.close();await rm(temp,{recursive:true,force:true});}
