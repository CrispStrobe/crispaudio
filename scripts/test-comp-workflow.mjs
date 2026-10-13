import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=await(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?webkit:chromium).launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE||process.env.CRISPAUDIO_CHROME_EXECUTABLE});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5191');await page.waitForLoadState('networkidle');
 await page.evaluate(async()=>{const {useUIStore:u}=await import('/src/stores/uiStore.ts'),{useProjectStore:s}=await import('/src/stores/projectStore.ts'),{buildSampleSession}=await import('/src/lib/sampleSessions.ts');window.store=s;u.getState().setActivePanel('timeline');const sample=buildSampleSession('takes',new AudioContext(),key=>key);s.getState().loadProjectState(sample.project,sample.sources);s.temporal.getState().clear();window.base=s.getState().project.tracks[0].compBaseSegments;});
 await page.getByRole('button',{name:'Record / takes',exact:true}).click();const d=page.getByRole('dialog');assert.equal(await d.locator('[data-recording-section=takes]').getAttribute('open'),null);assert.equal(await d.getByRole('spinbutton').count(),0);assert.equal(await d.getByRole('checkbox').count(),1);assert.equal(await d.getByRole('combobox').count(),1);await d.screenshot({path:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?'/tmp/record-simple-webkit.png':'/tmp/record-simple-chrome.png'});await d.locator('[data-recording-section=takes] > summary').click();
 await d.getByRole('button',{name:'Audition raw take',exact:true}).first().click();await d.getByRole('button',{name:'Stop audition',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.store.temporal.getState().pastStates.length),0);await d.getByRole('button',{name:'Stop audition',exact:true}).click();
 await d.locator('summary').filter({hasText:'Comp versions'}).click();await d.getByRole('textbox',{name:'Version name'}).fill('A');await d.getByRole('button',{name:'Save version',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.store.getState().project.tracks[0].compVersions.length),1);
 await d.getByRole('combobox',{name:'Replace take',exact:true}).selectOption({index:1});
 await d.getByRole('button',{name:'Remove region',exact:true}).click();assert.equal(await page.evaluate(()=>window.store.getState().project.tracks[0].segments===window.base),true);
 await d.getByRole('button',{name:'A',exact:true}).click();assert.equal(await page.evaluate(()=>window.store.getState().project.tracks[0].compRegions.length),1);
 await d.getByRole('button',{name:'Audition comp',exact:true}).click();await d.getByRole('button',{name:'Stop audition',exact:true}).waitFor();await d.getByRole('button',{name:'Reset comp',exact:true}).click();await d.getByRole('button',{name:'Audition comp',exact:true}).waitFor();
 await page.evaluate(()=>window.store.temporal.getState().undo());assert.equal(await page.evaluate(()=>window.store.getState().project.tracks[0].compRegions.length),1);
 assert.equal(await page.evaluate(async()=>{const {serializeProject,deserializeProject}=await import('/src/lib/projectFile.ts'),s=window.store.getState(),loaded=await deserializeProject(serializeProject(s.project,s.sources),new OfflineAudioContext(2,1,48000));return loaded.project.tracks[0].compVersions.length===1;}),true);
 await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i}=await import('/src/i18n/index.ts');await i.changeLanguage('de');});assert.equal(await d.evaluate(e=>e.scrollWidth>e.clientWidth),false);assert.deepEqual(errors,[]);console.log(JSON.stringify({audition:'passed',regions:'passed',versions:'passed',resetUndo:'passed',saveReopen:'passed',german390:'passed'}));
}finally{await browser.close();}
