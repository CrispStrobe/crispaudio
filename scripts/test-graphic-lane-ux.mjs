import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const touch=!!process.env.CRISPAUDIO_UX_TOUCH;
const browser=await(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?webkit:chromium).launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE||process.env.CRISPAUDIO_CHROME_EXECUTABLE});
try {
 const page=await browser.newPage({viewport:{width:touch?390:1440,height:touch?844:1000},isMobile:touch,hasTouch:touch}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5191');await page.waitForLoadState('networkidle');
 await page.evaluate(async()=>{
  const {useProjectStore:s}=await import('/src/stores/projectStore.ts'),{useUIStore:u}=await import('/src/stores/uiStore.ts'),{useSettingsStore:p}=await import('/src/stores/settingsStore.ts'),{buildSampleSession}=await import('/src/lib/sampleSessions.ts'),{TITLE_PRESETS}=await import('/src/lib/graphics.ts');
  window.store=s;window.ui=u;u.getState().setActivePanel('timeline');p.getState().setTimelineAutoFit(false);
  const sample=buildSampleSession('picture',new AudioContext(),k=>k),v=sample.project.video;
  v.graphics[0].id='titles';v.graphics[0].name='Titles';v.graphics[0].clips[0].id='title';v.graphics[0].clips[0].startTime=.4;
  v.captions={id:'captions',name:'Captions',visible:true,locked:false,rippleEnabled:true,burnIn:false,style:{...TITLE_PRESETS.caption},cues:[{id:'cue',start:.4,end:2.4,text:'Hello'}]};
  sample.project.tracks=sample.project.tracks.slice(0,1);s.getState().loadProjectState(sample.project,sample.sources);s.getState().setTrackHeight(80);s.getState().setZoomLevel(80);s.temporal.getState().clear();
 });
 const header=id=>page.locator(`[data-graphic-header=${id}]`),clip=id=>page.locator(`[data-graphic-clip=${id}]`);
 for(const height of [24,48,80,120]){
  await page.evaluate(h=>window.store.getState().setTrackHeight(h),height);
  for(const id of ['titles','captions']){
   const h=await header(id).boundingBox(),lane=await page.locator(`[data-graphic-lane=${id}]`).boundingBox();assert.ok(Math.abs(h.y-lane.y)<=1,JSON.stringify({id,height,h,lane}));assert.ok((await header(id).locator('[data-graphic-track-name]').boundingBox()).width>=40,JSON.stringify({id,height,name:await header(id).locator('[data-graphic-track-name]').boundingBox()}));
   for(const button of await header(id).getByRole('button').all()){const b=await button.boundingBox();assert.ok(b.y>=h.y-1&&b.y+b.height<=h.y+h.height+1);assert.equal(await button.locator('svg').count(),1);}
   const b=await clip(id==='titles'?'title':'cue').boundingBox();assert.ok(b.height>=16&&b.height<=height,JSON.stringify({id,height,b}));
  }
  const videoHeader=await page.locator('[data-picture-header=picture]').boundingBox(),videoLane=await page.locator('[data-video-track]').boundingBox();assert.ok(Math.abs(videoHeader.y-videoLane.y)<=1,JSON.stringify({height,videoHeader,videoLane}));
 }
 await page.evaluate(()=>{window.store.getState().setTrackHeight(48);window.store.temporal.getState().clear();});
 const timing=()=>page.evaluate(()=>{const v=window.store.getState().project.video;return [v.graphics[0].clips[0].startTime,v.captions.cues[0].start,v.captions.cues[0].end];});
 const drag=async(id,delta,ending='up')=>{
  await clip(id).scrollIntoViewIfNeeded();const b=await clip(id).boundingBox();await page.mouse.move(b.x+12,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+12+delta,b.y+b.height/2,{steps:5});
  if(ending==='escape')await page.keyboard.press('Escape');
  if(ending==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  if(ending==='lost')await clip(id).evaluate(e=>{e.releasePointerCapture(1);});
  if(ending==='cancel')await clip(id).dispatchEvent('pointercancel',{pointerId:1});
  await page.mouse.up();
 };
 const toggle=page.locator('.touch-arrange-toggle');if(await toggle.getAttribute('aria-pressed')==='true')await toggle.click();await drag('title',80);assert.equal((await timing())[0],.4);assert.equal(await page.evaluate(()=>window.store.temporal.getState().pastStates.length),0);if(touch)await toggle.tap();else await toggle.click();
 await drag('title',80);assert.equal((await timing())[0],1.4);assert.equal(await page.evaluate(()=>window.store.temporal.getState().pastStates.length),1);
 await page.evaluate(()=>window.store.temporal.getState().undo());assert.equal((await timing())[0],.4);
 for(const ending of ['escape','lost','cancel','blur']){
  await drag('title',40,ending);assert.equal((await timing())[0],.4);assert.equal(await page.evaluate(()=>window.store.temporal.getState().pastStates.length),0);assert.equal(await page.evaluate(()=>window.store.temporal.getState().futureStates.length),1);
 }
 await page.evaluate(()=>window.store.temporal.getState().redo());assert.equal((await timing())[0],1.4);await page.evaluate(()=>{window.store.temporal.getState().undo();window.store.temporal.getState().clear();});
 await drag('cue',80);assert.deepEqual((await timing()).slice(1),[1.4,3.4]);assert.equal(await page.evaluate(()=>window.store.temporal.getState().pastStates.length),1);await page.evaluate(()=>{window.store.temporal.getState().undo();window.store.temporal.getState().clear();});
 await clip('title').click();assert.equal(await page.evaluate(()=>window.store.temporal.getState().pastStates.length),0);
 await header('titles').getByRole('button',{name:'Titles: Locked',exact:true})[touch?'tap':'click']();assert.equal(await header('titles').getByRole('button',{name:'Titles: Visible',exact:true}).isDisabled(),true);await drag('title',80);assert.equal((await timing())[0],.4);await header('titles').getByRole('button',{name:'Titles: Locked',exact:true})[touch?'tap':'click']();
 await page.evaluate(()=>window.beforeConcurrent=window.store.getState().project);await clip('title').scrollIntoViewIfNeeded();const c=await clip('title').boundingBox();await page.mouse.move(c.x+12,c.y+c.height/2);await page.mouse.down();await page.mouse.move(c.x+92,c.y+c.height/2,{steps:5});await page.evaluate(()=>{const s=window.store.getState();window.store.setState({project:{...s.project,name:'Concurrent edit'}});});await clip('title').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();assert.equal(await page.evaluate(()=>window.store.getState().project.name),'Concurrent edit');assert.equal((await timing())[0],1.4);await page.evaluate(()=>{window.store.setState({project:window.beforeConcurrent});window.store.temporal.getState().clear();});
 await clip('title').dblclick();const dialog=page.getByRole('dialog',{name:'Titles and captions',exact:true});await dialog.waitFor();
 await page.evaluate(()=>{window.store.temporal.getState().clear();window.ui.setState({timelineRecording:true});window.store.setState({isPlaying:true,playheadPosition:2});window.frozenProject=window.store.getState().project;});
 assert.equal(await dialog.getByRole('textbox',{name:'Title text',exact:true}).isDisabled(),true);
 await dialog.getByRole('button',{name:'Close panel',exact:true}).click();
 for(const id of ['titles','captions'])for(const b of await header(id).getByRole('button').all())assert.equal(await b.isDisabled(),true);
 assert.equal(await clip('title').isDisabled(),true);assert.equal(await clip('cue').isDisabled(),true);
 await clip('title').dispatchEvent('pointerdown',{button:0,pointerId:1});await clip('cue').dispatchEvent('pointerdown',{button:0,pointerId:1});
 assert.equal(await page.evaluate(()=>window.store.getState().project===window.frozenProject&&window.store.getState().isPlaying&&window.store.getState().playheadPosition===2),true);
 assert.equal(await page.evaluate(()=>window.store.temporal.getState().pastStates.length),0);
 await page.evaluate(async()=>{window.ui.setState({timelineRecording:false});window.store.setState({isPlaying:false});const {default:i}=await import('/src/i18n/index.ts');await i.changeLanguage('de');});
 assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth>innerWidth),false);
 await page.evaluate(()=>{const s=window.store.getState();window.store.setState({project:{...s.project,video:{...s.project.video,tracks:[{id:'picture',name:'Camera',visible:true,locked:false,rippleEnabled:true}]}}});});
 for(const id of ['titles','captions']){const h=await header(id).boundingBox(),lane=await page.locator(`[data-graphic-lane=${id}]`).boundingBox();assert.ok(Math.abs(h.y-lane.y)<=1);}
 const pictureHeader=await page.locator('[data-picture-header=picture]').boundingBox(),pictureLane=await page.locator('[data-video-track]').boundingBox();assert.ok(Math.abs(pictureHeader.y-pictureLane.y)<=1);
 assert.deepEqual(errors,[]);
 await page.screenshot({path:touch?'/tmp/graphic-lane-touch.png':'/tmp/graphic-lane-desktop.png'});
 console.log(JSON.stringify({headersMatchLanes:'passed',editingMode:'passed',compactHeaders:'passed',compactClips:'passed',titleDragOneUndo:'passed',captionDurationPreserved:'passed',cancelRestoresRedo:'passed',concurrentEditPreserved:'passed',noClickUndo:'passed',lockedTitle:'passed',recordingFreeze:'passed',dialogFreeze:'passed',german:'passed',physicalTouch:'untested'}));
} finally {await browser.close();}
