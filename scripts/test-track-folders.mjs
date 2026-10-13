import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {timelineCommand} from './browser-command.mjs';
const {chromium,webkit}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=await(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?webkit:chromium).launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE||process.env.CRISPAUDIO_CHROME_EXECUTABLE});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5191');await page.waitForLoadState('networkidle');
 await page.evaluate(async()=>{const {useUIStore:u}=await import('/src/stores/uiStore.ts'),{useProjectStore:s}=await import('/src/stores/projectStore.ts'),{buildSampleSession}=await import('/src/lib/sampleSessions.ts');window.store=s;u.getState().setActivePanel('timeline');const sample=buildSampleSession('mix',new AudioContext(),key=>key);s.getState().loadProjectState(sample.project,sample.sources);s.temporal.getState().clear();});
 await timelineCommand(page,'Track Folders…');const d=page.getByRole('dialog');await d.getByRole('textbox',{name:'Folder name'}).fill('Music');await d.getByRole('checkbox').nth(0).check();await d.getByRole('checkbox').nth(2).check();await d.getByRole('button',{name:'Apply',exact:true}).click();await d.waitFor({state:'hidden'});
 const folder=page.locator('[data-folder-header]');assert.equal(await folder.count(),1);assert.equal(await page.locator('[data-track-header]').count(),4);
 await folder.getByRole('button',{name:'Mute folder',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.store.getState().project.tracks.map(t=>t.muted)),[true,false,true]);
 await folder.getByRole('button',{name:'Mute folder',exact:true}).click();await folder.getByRole('button',{name:'Select folder clips',exact:true}).click();assert.equal(await page.evaluate(()=>window.store.getState().selection.segmentIds.length),2);
 await page.evaluate(async()=>{const {nudgeSelection}=await import('/src/lib/timelineEditing.ts');nudgeSelection(.25);});assert.deepEqual(await page.evaluate(()=>window.store.getState().project.tracks.map(t=>t.segments[0].startTime)),[.25,0,.25]);await page.evaluate(()=>window.store.temporal.getState().undo());
 await folder.getByRole('button',{name:'Collapse folder',exact:true}).click();assert.equal(await page.locator('[data-track-header]').count(),2);
 // Real click on the remaining audio row must select its clip, not the hidden first track.
 const canvas=page.locator('[data-audio-timeline]'),box=await canvas.boundingBox(),height=await page.evaluate(()=>window.store.getState().trackHeight);await page.mouse.click(box.x+100,box.y+height+height/2);assert.equal(await page.evaluate(()=>{const s=window.store.getState();return s.selection?.segmentIds[0]===s.project.tracks[1].segments[0].id;}),true);
 await folder.getByRole('button',{name:'Expand folder',exact:true}).click();assert.equal(await page.locator('[data-track-header]').count(),4);
 assert.equal(await page.evaluate(async()=>{const {serializeProject,deserializeProject}=await import('/src/lib/projectFile.ts'),s=window.store.getState(),loaded=await deserializeProject(serializeProject(s.project,s.sources),new OfflineAudioContext(2,1,48000));return loaded.project.trackFolders[0].name==='Music'&&loaded.project.trackFolders[0].trackIds.length===2;}),true);
 await folder.getByRole('button',{name:'Folder settings',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i}=await import('/src/i18n/index.ts');await i.changeLanguage('de');});assert.equal(await d.evaluate(e=>e.scrollWidth>e.clientWidth),false);assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);console.log(JSON.stringify({folderMenu:'passed',mute:'passed',groupSelectionNudge:'passed',collapseHitGeometry:'passed',saveReopen:'passed',german390:'passed'}));
}finally{await browser.close();}
