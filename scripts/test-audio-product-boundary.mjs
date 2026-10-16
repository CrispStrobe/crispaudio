import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE,args:['--mute-audio']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>localStorage.setItem('crispaudio-settings',JSON.stringify({version:0,state:{ttsServerUrl:'https://retired.invalid',ttsDefaultVoice:'old',ttsDefaultBackend:'kokoro',theme:'dark',language:'en',timelineAutoFit:false,defaultBitDepth:24}})));
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5197');await page.waitForLoadState('networkidle');
 const result=await page.evaluate(async()=>{
  const {useProjectStore:store}=await import('/src/stores/projectStore.ts'),{useSettingsStore:settings}=await import('/src/stores/settingsStore.ts'),{useUIStore:ui}=await import('/src/stores/uiStore.ts'),{serializeProject,deserializeProject}=await import('/src/lib/projectFile.ts'),{TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts'),{timelineCommands}=await import('/src/lib/timelineCommandCatalog.ts');
  window.boundary={store,ui,settings};ui.getState().setActivePanel('timeline');
  const state=settings.getState(),retired=['ttsServerUrl','ttsDefaultVoice','ttsDefaultBackend'];state.setDefaultBitrateKbps(256);
  const savedSettings=JSON.parse(localStorage.getItem('crispaudio-settings')).state;
  const ctx=new AudioContext({sampleRate:48000}),buffer=ctx.createBuffer(1,12000,48000);for(let i=0;i<buffer.length;i++)buffer.getChannelData(0)[i]=.2*Math.sin(2*Math.PI*317*i/48000);
  const clip={id:'old-tts',trackId:'voice',sourceId:'generated',name:'TTS - Guten Tag',startTime:0,sourceOffset:0,duration:.25,gain:1,color:'#818cf8',effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'};
  const p={...store.getInitialState().project,id:'old-voiceover',name:'Existing generated voiceover',sampleRate:48000,duration:.25,tracks:[{id:'voice',name:'Voiceover',segments:[clip],volume:.7,pan:0,muted:false,solo:false}]};
  const sources=new Map([['generated',{id:'generated',name:'TTS - Guten Tag',buffer,duration:.25,sampleRate:48000,channels:1,peaks:[]}]]);
  const loaded=await deserializeProject(serializeProject(p,sources),ctx);store.getState().loadProjectState(loaded.project,loaded.sources);store.temporal.getState().clear();store.getState().updateTrack('voice',{volume:.4});const undo=store.temporal.getState().pastStates.length;store.temporal.getState().undo();
  const engine=new TimelineEngine(ctx);engine.setSources(loaded.sources);const rendered=await engine.renderToBuffer(store.getState().project);let peak=0;for(const v of rendered.getChannelData(0))peak=Math.max(peak,Math.abs(v));engine.stop();await ctx.close();
  return{retiredSettingsGone:retired.every(k=>!(k in state)&&!(k in savedSettings)),editingSettingsRetained:state.defaultBitDepth===24&&state.timelineAutoFit===false,ttsCommandGone:!Object.values(timelineCommands).flat().some(c=>c.id==='tts'),oldClip:loaded.project.tracks[0].segments[0].name,sources:loaded.sources.size,frames:rendered.length,peak,undo,restoredVolume:store.getState().project.tracks[0].volume};
 });
 assert.equal(result.retiredSettingsGone,true);assert.equal(result.editingSettingsRetained,true);assert.equal(result.ttsCommandGone,true);assert.equal(result.oldClip,'TTS - Guten Tag');assert.equal(result.sources,1);assert.equal(result.frames,12000);assert.ok(Math.abs(result.peak-.14*Math.SQRT1_2)<.001,JSON.stringify(result));assert.equal(result.undo,1);assert.equal(result.restoredVolume,.7);
 for(const language of ['en','de']){
  await page.setViewportSize(language==='de'?{width:390,height:844}:{width:1280,height:900});
  await page.evaluate(async language=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage(language);window.boundary.ui.getState().openModal('settings');},language);
  const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await dialog.locator('[id^="settings-tts"]').count(),0);assert.equal(await dialog.evaluate(n=>n.scrollWidth>n.clientWidth),false);
  await page.evaluate(()=>window.boundary.ui.getState().closeModal());
 }
 // Audio, take and video sessions: rendered PCM, saved/reopened media and FX.
 const sessions=await page.evaluate(async()=>{
  const {buildSampleSession}=await import('/src/lib/sampleSessions.ts'),{TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts'),{serializeProject,deserializeProject}=await import('/src/lib/projectFile.ts');
  const output=[];for(const kind of ['mix','takes','picture']){
   const ctx=new AudioContext({sampleRate:48000}),sample=buildSampleSession(kind,ctx,key=>key),engine=new TimelineEngine(ctx);engine.setSources(sample.sources);
   const rendered=await engine.renderToBuffer(sample.project),loaded=await deserializeProject(serializeProject(sample.project,sample.sources),ctx);let energy=0,peak=0;for(const v of rendered.getChannelData(0)){energy+=v*v;peak=Math.max(peak,Math.abs(v));}
   output.push({kind,frames:rendered.length,rms:Math.sqrt(energy/rendered.length),peak,tracks:loaded.project.tracks.length,reopened:JSON.stringify(loaded.project)===JSON.stringify(sample.project),sources:loaded.sources.size,takes:loaded.project.tracks[0].takes?.length??0,picture:!!loaded.project.video});
   window.boundary.store.getState().loadProjectState(loaded.project,loaded.sources);engine.stop();await ctx.close();
  }return output;
 });
 for(const s of sessions){assert.equal(s.frames,672000);assert.equal(s.tracks,3);assert.equal(s.reopened,true);assert.ok(s.rms>.02&&s.peak>.05&&s.peak<1);}
 assert.equal(sessions[1].takes,2);assert.equal(sessions[2].picture,true);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({retirement:result,sessions,settingsDesktopTouch:true,physicalAudio:false}));
}finally{await browser.close();}
