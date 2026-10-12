// Synthetic decoder/canvas/UI audit; no private footage or microphone permissions.
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=await(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?webkit:chromium).launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE||process.env.CRISPAUDIO_CHROME_EXECUTABLE});
const root=mkdtempSync(join(tmpdir(),'crispaudio-picture-browser-'));
try{
 const urls={};for(const color of ['red','blue']){const path=join(root,`${color}.mp4`);execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=${color}:s=320x180:r=25:d=4`,'-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',path]);urls[color]=`data:video/mp4;base64,${readFileSync(path).toString('base64')}`;}
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(urls=>{window.__TAURI_INTERNALS__={metadata:{currentWebview:{label:'main'},currentWindow:{label:'main'}},transformCallback:()=>1,convertFileSrc:path=>urls[path],invoke:async(command,args)=>{if(command==='prepare_video_preview')return args.path;if(command==='desktop_media_available')return true;if(command==='take_opened_files')return [];if(command==='plugin:event|listen')return 1;return undefined;}};window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};},urls);
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5191');await page.waitForLoadState('networkidle');
 await page.evaluate(async urls=>{
  window.__TAURI_INTERNALS__={convertFileSrc:path=>urls[path],invoke:async(command,args)=>{if(command==='prepare_video_preview')return args.path;if(command==='take_opened_files')return [];if(command==='desktop_media_available')return true;return undefined;}};
  const {useProjectStore}=await import('/src/stores/projectStore.ts'),{useUIStore}=await import('/src/stores/uiStore.ts');window.pictureStore=useProjectStore;useUIStore.getState().setActivePanel('timeline');
  const clip=(id,lane,source)=>({id,videoTrackId:lane,sourceId:source,startTime:0,duration:4,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0});
  const p={...useProjectStore.getInitialState().project,id:'picture',duration:4,frameRate:25,tracks:[],video:{path:'red',duration:4,width:320,height:180,sources:[{id:'blue',path:'blue',name:'Blue',duration:4}],tracks:['upper','picture'].map(id=>({id,name:id,visible:true,locked:false,rippleEnabled:true})),clips:[clip('base','picture'),{...clip('top','upper','blue'),composition:{x:0,y:0,scale:.5,rotation:0,opacity:1,crop:{left:0,top:0,right:0,bottom:0}}}]}};
  useProjectStore.getState().loadProjectState(p,new Map());useProjectStore.getState().setPlayheadPosition(1);useProjectStore.getState().setSelection({startTime:0,endTime:4,segmentIds:['top']});useProjectStore.temporal.getState().clear();
 },urls);
 await page.waitForFunction(()=>{const c=document.querySelector('[data-picture-composition]');if(!c)return false;const p=c.getContext('2d').getImageData(160,90,1,1).data;return p[2]>220;});
 const pixels=await page.locator('[data-picture-composition]').evaluate(c=>{const ctx=c.getContext('2d');return {center:[...ctx.getImageData(160,90,1,1).data],edge:[...ctx.getImageData(20,20,1,1).data]};});assert.ok(pixels.center[2]>220&&pixels.edge[0]>220,JSON.stringify(pixels));
 const handle=page.getByRole('button',{name:'Move picture (Escape cancels)',exact:true}),box=await handle.boundingBox();assert.ok(box);await page.mouse.move(box.x+22,box.y+22);await page.mouse.down();await page.mouse.move(box.x+52,box.y+32,{steps:3});await page.mouse.up();
 const history=await page.evaluate(()=>({past:window.pictureStore.temporal.getState().pastStates.length,x:window.pictureStore.getState().project.video.clips[1].composition.x}));assert.equal(history.past,1);assert.ok(history.x>0);
 await page.evaluate(()=>window.pictureStore.temporal.getState().undo());assert.equal(await page.evaluate(()=>window.pictureStore.getState().project.video.clips[1].composition.x),0);
 const before=await page.evaluate(()=>JSON.stringify(window.pictureStore.getState().project));const moved=await handle.boundingBox();await page.mouse.move(moved.x+22,moved.y+22);await page.mouse.down();await page.mouse.move(moved.x+62,moved.y+22);await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.evaluate(()=>JSON.stringify(window.pictureStore.getState().project)),before);
 const roundtrip=await page.evaluate(async()=>{const {serializeProject,deserializeProject}=await import('/src/lib/projectFile.ts');const s=window.pictureStore.getState();const loaded=await deserializeProject(serializeProject(s.project,s.sources),new OfflineAudioContext(2,1,48000));return JSON.stringify(loaded.project)===JSON.stringify(s.project);});assert.equal(roundtrip,true);
 await page.evaluate(()=>{const s=window.pictureStore.getState();window.pictureStore.setState({project:{...s.project,video:{...s.project.video,tracks:s.project.video.tracks.map(t=>t.id==='upper'?{...t,visible:false}:t)}}});});await page.waitForFunction(()=>document.querySelector('[data-picture-composition]').getContext('2d').getImageData(160,90,1,1).data[0]>220);
 await page.getByRole('button',{name:'Titles and captions',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Title',exact:true}).click();
 await page.getByRole('textbox',{name:'Title text',exact:true}).fill('Grüße aus München');
 await page.getByRole('textbox',{name:'Title text',exact:true}).press('Tab');
 assert.equal(await page.evaluate(()=>window.pictureStore.getState().project.video.graphics[0].clips[0].text),'Grüße aus München');
 await page.getByRole('button',{name:'Save title preset',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.pictureStore.getState().project.video.titlePresets.length),1);
 await page.getByRole('dialog').getByRole('button',{name:'Captions',exact:true}).click();
 await page.getByRole('button',{name:'Create caption track',exact:true}).click();
 await page.getByRole('button',{name:'Add cue',exact:true}).click();
 await page.getByRole('textbox',{name:'Caption text',exact:true}).fill('Überprüfung der Untertitel');await page.getByRole('textbox',{name:'Caption text',exact:true}).press('Tab');
 await page.getByRole('checkbox',{name:'Burn captions into video',exact:true}).check();
 assert.equal(await page.evaluate(()=>window.pictureStore.getState().project.video.captions.cues[0].text),'Überprüfung der Untertitel');
 await page.getByRole('dialog').getByRole('button',{name:'Close panel',exact:true}).click();
 await page.waitForFunction(()=>{const c=document.querySelector('[data-picture-composition]'),pixels=c.getContext('2d').getImageData(0,50,320,130).data;let white=0;for(let i=0;i<pixels.length;i+=4)if(Math.min(pixels[i],pixels[i+1],pixels[i+2])>170)white++;return white>100;});
 const graphicsSaved=await page.evaluate(async()=>{const {serializeProject,deserializeProject}=await import('/src/lib/projectFile.ts');const state=window.pictureStore.getState();const loaded=await deserializeProject(serializeProject(state.project,state.sources),new OfflineAudioContext(2,1,48000));return JSON.stringify(loaded.project)===JSON.stringify(state.project);});assert.equal(graphicsSaved,true);
 const guards=await page.evaluate(()=>{const s=window.pictureStore,p=s.getState().project,t=p.video.graphics[0];s.setState({project:{...p,video:{...p.video,graphics:[{...t,locked:true}]}}});const locked=s.getState().project;s.setState({project:{...locked,video:{...locked.video,graphics:[{...locked.video.graphics[0],clips:[]}]}}});const rejected=s.getState().project===locked;s.temporal.getState().undo();return rejected;});assert.equal(guards,true);
 await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');});assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth>window.innerWidth),false);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({titlePixels:'passed',captionEditing:'passed',savedPreset:'passed',graphicsSaveOpen:'passed',lockedGraphics:'passed',pixels,groupedUndo:'passed',escapeRedo:'passed',saveOpen:'passed',visibility:'passed',german390:'passed'}));
}finally{await browser.close();rmSync(root,{recursive:true,force:true});}
