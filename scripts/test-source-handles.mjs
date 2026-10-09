// Optional real-pointer regression; no installed app state or private media touched.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href:'playwright');
const browser=process.env.CRISPAUDIO_CHROME_EXECUTABLE?await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE}):await webkit.launch({headless:true});
const clip={id:'a',trackId:'mic',sourceId:'s',startTime:3,sourceOffset:2,duration:4,gain:1,name:'sound',color:'#fff',effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'};
const project={id:'p',name:'Source handles',sampleRate:48000,duration:7,masterEffects:[],frameRate:25,tracks:[{id:'mic',name:'Mic',volume:1,pan:0,muted:false,solo:false,segments:[clip]}]};
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5190');await page.waitForLoadState('networkidle');
 const load=async(p=project,length=10)=>{await page.evaluate(async({p,length})=>{
  const {useUIStore}=await import('/src/stores/uiStore.ts');useUIStore.getState().setActivePanel('timeline');
  const {useProjectStore}=await import('/src/stores/projectStore.ts');const ctx=new OfflineAudioContext(1,1,48000);const buffer=ctx.createBuffer(1,Math.round(length*48000),48000);
  useProjectStore.getState().loadProjectState(p,new Map([['s',{id:'s',name:'source',duration:length,sampleRate:48000,channels:1,buffer,peaks:[]}]]));
  useProjectStore.setState({zoomLevel:100,scrollOffset:0,trackHeight:128});useProjectStore.temporal.getState().clear();
 },{p,length});await page.locator('[data-audio-timeline]').waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.setState({zoomLevel:100,scrollOffset:0,trackHeight:128});});};
 const state=()=>page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return {project:useProjectStore.getState().project,past:useProjectStore.temporal.getState().pastStates.length};});
 const canvas=page.locator('[data-audio-timeline]');
 await load();await canvas.waitFor();let box=await canvas.boundingBox();
 await page.mouse.move(box.x+698,box.y+50);await page.mouse.down();await page.mouse.move(box.x+1200,box.y+50,{steps:5});
 await page.getByRole('complementary',{name:'Source handles'}).waitFor();await page.getByText('Source or timeline limit reached.',{exact:false}).waitFor();
 assert.equal((await state()).project.tracks[0].segments[0].duration,8);await page.mouse.up();
 await page.getByRole('complementary',{name:'Source handles'}).waitFor({state:'hidden'});assert.equal((await state()).past,1);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().undo();});assert.equal((await state()).project.tracks[0].segments[0].duration,4);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().redo();});assert.equal((await state()).project.tracks[0].segments[0].duration,8);
 await load();box=await canvas.boundingBox();await page.mouse.move(box.x+302,box.y+50);await page.mouse.down();await page.mouse.move(box.x+5,box.y+50,{steps:4});
 let c=(await state()).project.tracks[0].segments[0];assert.equal(c.startTime,1);assert.equal(c.sourceOffset,0);assert.equal(c.duration,6);
 await page.mouse.move(box.x+342,box.y+50,{steps:3});c=(await state()).project.tracks[0].segments[0];assert.ok(Math.abs(c.startTime-3.4)<1e-7);assert.ok(Math.abs(c.sourceOffset-2.4)<1e-7);assert.ok(Math.abs(c.duration-3.6)<1e-7);
 await page.mouse.up();assert.equal((await state()).past,1);
 // Picture + sound use the same tight source handle, including inward frame limits.
 const linked=structuredClone(project);linked.tracks[0].segments[0].linkGroup='av';linked.video={path:'camera.mp4',duration:6.075,session:{},clips:[{id:'v',linkGroup:'av',startTime:3,sourceOffset:2,duration:4,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0}]};
 await load(linked);box=await canvas.boundingBox();await page.mouse.move(box.x+698,box.y+50);await page.mouse.down();await page.mouse.move(box.x+900,box.y+50,{steps:4});
 let result=(await state()).project;assert.ok(Math.abs(result.tracks[0].segments[0].duration-4.04)<1e-7);assert.equal(result.video.clips[0].duration,result.tracks[0].segments[0].duration);await page.mouse.up();
 await load(linked);const video=page.locator('[data-video-track]');box=await video.boundingBox();await page.mouse.move(box.x+698,box.y+65);await page.mouse.down();await page.mouse.move(box.x+900,box.y+65,{steps:4});
 result=(await state()).project;assert.ok(Math.abs(result.video.clips[0].duration-4.04)<1e-7);assert.equal(result.tracks[0].segments[0].duration,result.video.clips[0].duration);
 await page.keyboard.press('Escape');await page.getByRole('complementary',{name:'Source handles'}).waitFor({state:'hidden'});await page.mouse.up();assert.equal((await state()).past,0);assert.equal((await state()).project.video.clips[0].duration,4);
 // German feedback uses a viewport-wide portal even with tiny track rows.
 await load();await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.setState({zoomLevel:20,trackHeight:24});});
 box=await canvas.boundingBox();await page.mouse.move(box.x+138,box.y+17);await page.mouse.down();await page.mouse.move(box.x+180,box.y+17,{steps:4});
 const tip=page.getByRole('complementary',{name:'Quellreserven'});await tip.waitFor();const bounds=await tip.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);await page.mouse.up();await tip.waitFor({state:'hidden'});
 console.log(JSON.stringify({audioSourceBounds:'passed',leftSourceClock:'passed',limitRecovery:'passed',linkedFrameLimit:'passed',videoPointer:'passed',undoRedo:'passed',escapeCleanup:'passed',germanSmallRows:'passed'}));
}finally{await browser.close();}
