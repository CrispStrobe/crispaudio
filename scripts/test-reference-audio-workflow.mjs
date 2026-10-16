// Optional real-file audio workflow. Media stays local; exports use an owned temp folder.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const input=process.env.CRISPAUDIO_REFERENCE_MEDIA;assert.ok(input,'Set CRISPAUDIO_REFERENCE_MEDIA to a local recording');
const before=await stat(input),temp=await mkdtemp(join(tmpdir(),'crispaudio-reference-'));
const {chromium}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE,args:['--mute-audio']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5197');await page.waitForLoadState('networkidle');
 await page.evaluate(async()=>{const {useProjectStore:s}=await import('/src/stores/projectStore.ts'),{useUIStore:u}=await import('/src/stores/uiStore.ts');window.referenceStore=s;u.getState().setActivePanel('timeline');});
 const picker=page.locator('input[type=file][accept="audio/*"]');await picker.setInputFiles(input);
 await page.waitForFunction(()=>window.referenceStore.getState().sources.size===1);
 const download=page.waitForEvent('download');
 const edit=await page.evaluate(async()=>{
  const s=window.referenceStore,{trimToPlayhead}=await import('/src/lib/trimEdits.ts'),{timelineDuration}=await import('/src/lib/timelineView.ts'),{serializeProject,deserializeProject}=await import('/src/lib/projectFile.ts'),{TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts'),{encodeAudioBufferWav}=await import('/src/lib/wavExport.ts');
  const initial=s.getState(),clip=initial.project.tracks[0].segments[0];if(clip.duration<10)throw new Error('Reference media must contain at least ten seconds of audio');
  s.temporal.getState().clear();let p=trimToPlayhead(initial.project,[clip.id],'right',10,initial.sources);p=trimToPlayhead(p,[clip.id],'left',2,initial.sources);
  p={...p,sampleRate:[...initial.sources.values()][0].sampleRate,tracks:p.tracks.map(t=>({...t,segments:t.segments.map(c=>c.id===clip.id?{...c,gain:.8,fadeInDuration:.05,fadeOutDuration:.1}:c)})),editRange:{start:2,end:10}};p.duration=timelineDuration(p);s.setState({project:p});
  const undo=s.temporal.getState().pastStates.length;s.temporal.getState().undo();const undoDuration=s.getState().project.tracks[0].segments[0].duration;s.temporal.getState().redo();
  const ctx=new AudioContext({sampleRate:48000}),loaded=await deserializeProject(serializeProject(s.getState().project,initial.sources),ctx);s.getState().loadProjectState(loaded.project,loaded.sources);
  const engine=new TimelineEngine(ctx);engine.setSources(loaded.sources);const output=await engine.renderMixRange(loaded.project,2,10);window.referenceExpected=output;
  let energy=0,peak=0;for(const v of output.getChannelData(0)){energy+=v*v;peak=Math.max(peak,Math.abs(v));}
  const wav=await encodeAudioBufferWav(output,24),url=URL.createObjectURL(wav),a=document.createElement('a');a.href=url;a.download='reference-range.wav';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);engine.stop();await ctx.close();
  return{sourceDuration:clip.duration,sourceRate:[...initial.sources.values()][0].sampleRate,sourceChannels:[...initial.sources.values()][0].channels,undo,undoDuration,frames:output.length,rate:output.sampleRate,channels:output.numberOfChannels,rms:Math.sqrt(energy/output.length),peak,first:output.getChannelData(0)[0],reopened:loaded.project.tracks[0].segments[0].duration===8};
 });
 const saved=join(temp,'reference-range.wav');await(await download).saveAs(saved);
 assert.equal(edit.undo,1);assert.equal(edit.undoDuration,edit.sourceDuration);assert.equal(edit.frames,8*edit.rate);assert.equal(edit.reopened,true);assert.ok(edit.rms>1e-6&&Number.isFinite(edit.peak));assert.ok(edit.first===0);
 await picker.setInputFiles(saved);await page.waitForFunction(()=>window.referenceStore.getState().sources.size===2);
 const review=await page.evaluate(()=>{const actual=[...window.referenceStore.getState().sources.values()].at(-1).buffer,expected=window.referenceExpected;let error=0;for(let c=0;c<actual.numberOfChannels;c++){const a=actual.getChannelData(c),b=expected.getChannelData(c);for(let i=0;i<a.length;i++)error=Math.max(error,Math.abs(a[i]-b[i]));}return{frames:actual.length,channels:actual.numberOfChannels,rate:actual.sampleRate,maxPCMError:error};});
 assert.equal(review.frames,edit.frames);assert.equal(review.channels,edit.channels);assert.equal(review.rate,edit.rate);assert.ok(review.maxPCMError<2e-7);assert.deepEqual(errors,[]);
 const after=await stat(input);assert.equal(after.size,before.size);assert.equal(after.mtimeMs,before.mtimeMs);
 console.log(JSON.stringify({realSource:true,import:'browser audio picker and actual MP4 audio decoding',edit,actualSavedWavReview:review,originalUnchanged:true,physicalAudio:false,desktopVideoAndFinder:'not exercised by this audio-only test'}));
}finally{await browser.close();await rm(temp,{recursive:true,force:true});}
