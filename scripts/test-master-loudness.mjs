import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';
const {chromium,webkit}=await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href:'playwright');
const browser=await(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?webkit:chromium).launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE||process.env.CRISPAUDIO_CHROME_EXECUTABLE});
const temp=await mkdtemp(join(tmpdir(),'crispaudio-loudness-'));
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5191');await page.waitForLoadState('networkidle');
  const fixture=await page.evaluate(async()=>{
    const {useUIStore}=await import('/src/stores/uiStore.ts'),{useProjectStore}=await import('/src/stores/projectStore.ts');useUIStore.getState().setActivePanel('timeline');window.loudnessStore=useProjectStore;
    const buffer=new AudioBuffer({numberOfChannels:2,length:144000,sampleRate:48000});for(let ch=0;ch<2;ch++)for(let i=0;i<buffer.length;i++)buffer.getChannelData(ch)[i]=.08*Math.sin(2*Math.PI*1000*i/48000);
    const clip={id:'c',sourceId:'s',trackId:'t',startTime:0,duration:3,sourceOffset:0,gain:1,fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear',effects:[],color:'#60a5fa',name:'Reference'};
    const p={...useProjectStore.getInitialState().project,duration:3,minimumDuration:3,tracks:[{id:'t',name:'Reference',volume:1,pan:0,muted:false,solo:false,segments:[clip]}],outputLimiter:{enabled:true,ceiling:-1,release:.1}};
    const source={id:'s',name:'Reference',buffer,duration:3,sampleRate:48000,channels:2,peaks:{min:new Float32Array(1),max:new Float32Array(1)}};
    useProjectStore.getState().loadProjectState(p,new Map([['s',source]]));useProjectStore.temporal.getState().clear();
    const {measureBuffer}=await import('/src/audio/dsp/loudness.ts');const reading=await measureBuffer(buffer);return {reading,pcm:Array.from({length:buffer.length*2},(_,i)=>buffer.getChannelData(i%2)[Math.floor(i/2)])};
  });
  if(process.env.CRISPAUDIO_TEST_CLI){
    const data=Buffer.alloc(fixture.pcm.length*4);fixture.pcm.forEach((v,i)=>data.writeFloatLE(v,i*4));const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+data.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(3,20);h.writeUInt16LE(2,22);h.writeUInt32LE(48000,24);h.writeUInt32LE(384000,28);h.writeUInt16LE(8,32);h.writeUInt16LE(32,34);h.write('data',36);h.writeUInt32LE(data.length,40);const path=join(temp,'reference.wav');await writeFile(path,Buffer.concat([h,data]));
    const reference=JSON.parse(execFileSync(process.env.CRISPAUDIO_TEST_CLI,['loudness',path],{encoding:'utf8'}));
    assert.ok(Math.abs(fixture.reading.integrated-reference.integrated_lufs)<.1);assert.ok(Math.abs(fixture.reading.truePeak-reference.true_peak_db)<.2);
    console.log(JSON.stringify({meter:fixture.reading,ffmpegReference:reference}));
  }
  await page.getByRole('button',{name:'Mixer',exact:true}).click();const panel=page.getByRole('region',{name:'Master loudness',exact:true});
  await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Master loudness"]')?.textContent.match(/I -[\d.]+ LUFS/));await page.getByRole('button',{name:'Stop',exact:true}).click();
  await panel.getByRole('button',{name:'Measure mix and review',exact:true}).click();const review=page.getByRole('dialog');await review.getByRole('button',{name:'Apply master gain',exact:true}).waitFor({timeout:60000});
  const before=await page.evaluate(()=>JSON.stringify(window.loudnessStore.getState().project));await review.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.evaluate(()=>JSON.stringify(window.loudnessStore.getState().project)),before);
  await panel.getByRole('button',{name:'Measure mix and review',exact:true}).click();await review.getByRole('button',{name:'Apply master gain',exact:true}).waitFor({timeout:60000});await review.getByRole('button',{name:'Apply master gain',exact:true}).click();
  const verified=await page.evaluate(async()=>{
    const state=window.loudnessStore.getState(),{TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts'),{measureBuffer}=await import('/src/audio/dsp/loudness.ts');const ctx=new AudioContext({sampleRate:48000}),engine=new TimelineEngine(ctx);engine.setSources(state.sources);const reading=await measureBuffer(await engine.renderToBuffer(state.project));await ctx.close();return {reading,gain:state.project.masterVolume,past:window.loudnessStore.temporal.getState().pastStates.length};
  });
  assert.ok(Math.abs(verified.reading.integrated+16)<.1);assert.ok(verified.reading.truePeak<=-1+.01);assert.equal(verified.past,1);
  await page.evaluate(()=>window.loudnessStore.temporal.getState().undo());assert.equal(await page.evaluate(()=>JSON.stringify(window.loudnessStore.getState().project)),before);await page.evaluate(()=>window.loudnessStore.temporal.getState().redo());
  await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');});assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth>window.innerWidth),false);
  console.log(JSON.stringify({liveMeter:'passed',reviewCancelUndoRedo:'passed',verified,german390:'passed',temp}));
}finally{await browser.close();}
