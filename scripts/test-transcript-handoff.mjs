import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE,args:['--mute-audio']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>localStorage.setItem('crispaudio-asr',JSON.stringify({executable:'/retired/asr',model:'/retired/model',aligner:'auto',language:'de'})));
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5197');await page.waitForLoadState('networkidle');
 await page.evaluate(async()=>{
  const {useProjectStore:store}=await import('/src/stores/projectStore.ts'),{useUIStore:ui}=await import('/src/stores/uiStore.ts'),{buildSampleSession}=await import('/src/lib/sampleSessions.ts');
  const ctx=new OfflineAudioContext(2,1,48000),sample=buildSampleSession('picture',ctx,k=>k);store.getState().loadProjectState(sample.project,sample.sources);ui.getState().setActivePanel('timeline');window.handoff={store,ui};
 });
 await page.evaluate(async()=>{const {dispatchNativeMenu}=await import('/src/lib/nativeMenu.ts');await dispatchNativeMenu('workspace');});await page.getByRole('tab',{name:'Transcript',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:/Transcribe with|Transcribe original/}).count(),0);assert.equal(await page.getByText('ASR setup',{exact:true}).count(),0);
 async function upload(button,doc){const choosing=page.waitForEvent('filechooser');await button.click();const picker=await choosing;await picker.setFiles({name:'transcript.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});}
 const imported=page.getByRole('button',{name:'Import timed transcript',exact:true});
 const cue={text:'Hallo Welt',startTime:1,endTime:3,speaker:'Ada',confidence:.9};
 await upload(imported,{_disclosure:'Machine-generated transcript',segments:[cue]});
 await page.waitForFunction(()=>window.handoff.store.getState().project.transcript?.[0]?.speaker==='Ada');
 assert.equal(await page.getByRole('group',{name:'Spoken words (Delete cuts audio and video)'}).count(),0);
 const words={segments:[{...cue,words:[{word:'Hallo',startTime:1,endTime:2},{word:'Welt',startTime:2.1,endTime:3}]}]};
 await upload(imported,words);
 const editor=page.getByRole('group',{name:'Spoken words (Delete cuts audio and video)'});await editor.waitFor();
 const before=await page.evaluate(()=>{const s=window.handoff.store;s.temporal.getState().clear();window.handoff.before=s.getState().project;return {duration:s.getState().project.duration,guard:!!s.getState().project.transcriptLayout};});assert.equal(before.guard,true);
 await editor.getByRole('button',{name:'Hallo',exact:true}).click();await editor.focus();await page.keyboard.press('Delete');
 const cut=await page.evaluate(()=>{const p=window.handoff.store.getState().project;return {duration:p.duration,tracks:p.tracks.map(t=>t.segments.map(c=>[c.startTime,c.sourceOffset,c.duration])),video:p.video.clips.map(c=>[c.startTime,c.sourceOffset,c.duration]),text:p.transcript.map(c=>c.text).join(' '),history:window.handoff.store.temporal.getState().pastStates.length};});
 assert.equal(before.duration-cut.duration,1);assert.equal(cut.text,'Welt');assert.equal(cut.history,1);for(const track of cut.tracks){assert.equal(track[1][0],1);assert.equal(track[1][1],2);}assert.equal(cut.video[1][1],2);
 await page.evaluate(()=>window.handoff.store.temporal.getState().undo());assert.equal(await editor.getByRole('button',{name:'Hallo',exact:true}).count(),1);
 await page.evaluate(()=>window.handoff.store.temporal.getState().redo());assert.equal(await editor.getByRole('button',{name:'Hallo',exact:true}).count(),0);
 const roundtrip=await page.evaluate(async()=>{
  const {serializeProject,deserializeProject}=await import('/src/lib/projectFile.ts'),{TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts'),{encodeAudioBufferWav}=await import('/src/lib/wavExport.ts');
  const state=window.handoff.store.getState(),ctx=new OfflineAudioContext(2,1,48000),saved=serializeProject(state.project,state.sources),loaded=await deserializeProject(saved,ctx),engine=new TimelineEngine(ctx);engine.setSources(loaded.sources);
  const rendered=await engine.renderToBuffer(loaded.project),wav=await encodeAudioBufferWav(rendered,24),decoded=await ctx.decodeAudioData(await wav.arrayBuffer());let maxError=0,rms=0;
  for(let ch=0;ch<2;ch++)for(let i=0;i<rendered.length;i++){maxError=Math.max(maxError,Math.abs(rendered.getChannelData(ch)[i]-decoded.getChannelData(ch)[i]));rms+=rendered.getChannelData(ch)[i]**2;}
  window.handoff.store.getState().loadProjectState(loaded.project,loaded.sources);
  return {projectEqual:JSON.stringify(loaded.project)===JSON.stringify(state.project),sources:loaded.sources.size,frames:decoded.length,sampleRate:decoded.sampleRate,maxError,rms:Math.sqrt(rms/(rendered.length*2)),videoClips:loaded.project.video.clips.length};
 });assert.equal(roundtrip.projectEqual,true);assert.equal(roundtrip.sources,3);assert.equal(roundtrip.frames,13*48000);assert.ok(roundtrip.maxError<2e-7);assert.ok(roundtrip.rms>.01);assert.equal(roundtrip.videoClips,3);
 // Source-clock import goes through the same file boundary and maps the shortened clip.
 await page.evaluate(async()=>{const {runTimelineTool}=await import('/src/hooks/useTimelineTool.ts');await runTimelineTool('source-speech');});
 const sourceDialog=page.getByRole('dialog',{name:'Source transcript'});await sourceDialog.waitFor();await upload(sourceDialog.getByRole('button',{name:'Import source JSON / SRT / VTT',exact:true}),words);
 await page.waitForFunction(()=>window.handoff.store.getState().project.sourceTranscripts?.length===1);
 const source=await page.evaluate(async()=>{const {mappedSourceTranscript}=await import('/src/lib/sourceTranscript.ts');const p=window.handoff.store.getState().project;return{original:p.sourceTranscripts[0].cues[0].words.map(w=>[w.text,w.start]),mapped:mappedSourceTranscript(p).flatMap(c=>c.words??[]).map(w=>[w.text,w.start]),history:window.handoff.store.temporal.getState().pastStates.length};});assert.equal(source.original[0][1],1);assert.deepEqual(source.mapped.map(w=>w[0]),['Welt']);assert.ok(Math.abs(source.mapped[0][1]-1.1)<1e-9);
 const sourceRoundtrip=await page.evaluate(async()=>{const {serializeProject,deserializeProject}=await import('/src/lib/projectFile.ts');const state=window.handoff.store.getState(),ctx=new OfflineAudioContext(2,1,48000),loaded=await deserializeProject(serializeProject(state.project,state.sources),ctx);return JSON.stringify(loaded.project.sourceTranscripts)===JSON.stringify(state.project.sourceTranscripts);});assert.equal(sourceRoundtrip,true);
 await page.keyboard.press('Escape');await sourceDialog.waitFor({state:'hidden'});
 await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');});
 const small=await page.locator('.timeline-workspace').evaluate(n=>({width:n.clientWidth,overflow:n.scrollWidth>n.clientWidth}));assert.equal(small.overflow,false);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({cueOnlyExportAccepted:true,wordSchemaAccepted:true,legacyControlsRemoved:true,cut,roundtrip,source,sourceRoundtrip,germanSmallViewport:small,physicalIOS:false,physicalAudio:false}));
}finally{await browser.close();}
