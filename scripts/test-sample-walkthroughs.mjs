import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {timelineCommand} from './browser-command.mjs';
const {chromium,webkit}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=await(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?webkit:chromium).launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE||process.env.CRISPAUDIO_CHROME_EXECUTABLE});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5191');await page.waitForLoadState('networkidle');await page.evaluate(async()=>{const {useUIStore:u}=await import('/src/stores/uiStore.ts'),{useProjectStore:s}=await import('/src/stores/projectStore.ts');window.store=s;u.getState().setActivePanel('timeline');});
 for(const [kind,tool] of [['recording','Record / takes'],['comp','Record / takes'],['mix','Mixer'],['video',null]]){
  console.log('Exercise',kind);const previous=await page.evaluate(()=>window.store.getState().project.id);
  await timelineCommand(page,'Sample Walkthroughs…');let dialog=page.getByRole('dialog');await dialog.getByRole('combobox').selectOption(kind);await dialog.getByRole('button',{name:'Load sample',exact:true}).click();await dialog.getByRole('button',{name:'Open',exact:true}).click();try{await page.waitForFunction(id=>window.store.getState().project.id!==id,previous);}catch(e){console.log(await page.locator('[role="dialog"]').allTextContents(),errors);throw e;}const guide=page.locator('[data-sample-guide]');await guide.waitFor();assert.match(await guide.textContent(),/1\/4/);const current=await page.evaluate(()=>window.store.getState().project.id);assert.notEqual(current,previous);assert.equal(await page.evaluate(()=>window.store.getState().project.tracks.filter(t=>t.segments.length).length),3);
  if(tool==='Mixer'){await guide.getByRole('button',{name:'Open tool',exact:true}).click();await page.getByRole('complementary',{name:'Mixer',exact:true}).waitFor();}else if(tool){await guide.getByRole('button',{name:'Open tool',exact:true}).click();await page.getByRole('dialog',{name:tool,exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Close panel',exact:true}).click();}
  else assert.equal(await page.evaluate(()=>!!window.store.getState().project.video),true);
  await guide.getByRole('button',{name:'Next step',exact:true}).click();assert.match(await guide.textContent(),/2\/4/);await guide.getByRole('button',{name:'Previous step',exact:true}).click();assert.match(await guide.textContent(),/1\/4/);
  if(kind==='comp')assert.equal(await page.evaluate(()=>window.store.getState().project.tracks[0].takes.length),2);
  if(kind==='video'){await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i}=await import('/src/i18n/index.ts');await i.changeLanguage('de');});assert.equal(await guide.evaluate(e=>e.scrollWidth>e.clientWidth),false);}
  await page.evaluate(()=>window.store.temporal.getState().undo());await guide.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.store.getState().project.id),previous);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({fourOriginalSamples:'passed',modelessCommands:'passed',stepNavigation:'passed',loadUndoAndGuideOwnership:'passed',german390:'passed'}));
}finally{await browser.close();}
