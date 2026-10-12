// Real offline/live Web Audio and native routing; all media is synthetic.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const {chromium,webkit}=await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href:'playwright');
const browser=await(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?webkit:chromium).launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE||process.env.CRISPAUDIO_CHROME_EXECUTABLE});
const temp=await mkdtemp(join(tmpdir(),'crispaudio-routing-'));
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>{throw e;});
  await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5191');await page.waitForLoadState('networkidle');
  const fixture=await page.evaluate(async()=>{
    const {useProjectStore}=await import('/src/stores/projectStore.ts'),{useUIStore}=await import('/src/stores/uiStore.ts');
    const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts');
    useUIStore.getState().setActivePanel('timeline');window.routeStore=useProjectStore;
    const ctx=new AudioContext({sampleRate:48000});window.routeContext=ctx;
    const sources=new Map();
    for(const [id,frequency] of [['voice',213],['music',71]]){
      const buffer=ctx.createBuffer(2,144000,48000);
      for(let i=0;i<144000;i++){const time=i/48000,level=id==='voice'?(time>.3&&time<1.4?.3:0):.12;buffer.getChannelData(0)[i]=level*Math.sin(2*Math.PI*frequency*time);buffer.getChannelData(1)[i]=buffer.getChannelData(0)[i]*.7;}
      sources.set(id,{id,name:id,buffer,duration:3,sampleRate:48000,channels:2,peaks:{min:new Float32Array(1),max:new Float32Array(1)}});
    }
    const base={segments:[],pan:0,muted:false,solo:false,volume:1};
    const clip=id=>({id:`clip-${id}`,trackId:id,sourceId:id,startTime:0,sourceOffset:0,duration:2.8,fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear',gain:1,effects:[],name:id,color:'#60a5fa'});
    const project={...useProjectStore.getInitialState().project,id:'routing',duration:3,minimumDuration:3,sampleRate:48000,tracks:[
      {...base,id:'music',name:'Music',segments:[clip('music')],ducking:{source:'speech',threshold:-24,ratio:4,attack:.01,release:.25,maximum:18}},
      {...base,id:'room',name:'Room',kind:'bus',volume:.6,effects:[{type:'delay',enabled:true,params:{time:.02,feedback:0,mix:1}}]},
      {...base,id:'speech',name:'Speech',kind:'bus',volume:.8},
      {...base,id:'voice',name:'Voice',volume:.7,segments:[clip('voice')],output:'speech',sends:[{id:'pre',target:'room',gain:.2,preFader:true},{id:'post',target:'room',gain:.1,preFader:false}]},
    ]};
    useProjectStore.getState().loadProjectState(project,sources);useProjectStore.temporal.getState().clear();
    window.routeEngine=new TimelineEngine(ctx);window.routeEngine.setSources(sources);
    const full=await window.routeEngine.renderToBuffer(project),range=await window.routeEngine.renderMixRange(project,.5,2.5);
    let rangeError=0;for(let ch=0;ch<2;ch++)for(let i=0;i<range.length;i++)rangeError=Math.max(rangeError,Math.abs(range.getChannelData(ch)[i]-full.getChannelData(ch)[i+24000]));
    const pcm=b=>Array.from({length:b.length*2},(_,i)=>b.getChannelData(i%2)[Math.floor(i/2)]);
    return {project,sources:[...sources].map(([id,s])=>({id,pcm:pcm(s.buffer)})),pcm:pcm(full),rangeError};
  });
  assert.ok(fixture.rangeError<1e-7,`range crop ${fixture.rangeError}`);
  // Live fader/send/ducking changes preserve the scheduled graph.
  await page.evaluate(async()=>{const engine=window.routeEngine,p=window.routeStore.getState().project;await engine.prepare(p);await window.routeContext.resume();engine.play(p,0);window.routeGeneration=engine.automationClock().generation;window.routeSources=engine.activeSources.length;p.tracks.find(t=>t.id==='voice').volume=.4;engine.updateMix(p);p.tracks.find(t=>t.id==='voice').sends[0].gain=.5;p.tracks.find(t=>t.id==='music').ducking.threshold=-30;engine.updateMix(p);});
  await page.waitForFunction(()=>Math.abs(window.routeEngine.routingGains.get('voice:pre').gain.value-.5)<1e-6);
  const live=await page.evaluate(()=>({generation:window.routeEngine.automationClock().generation,sources:window.routeEngine.activeSources.length,send:window.routeEngine.routingGains.get('voice:pre').gain.value,threshold:window.routeEngine.duckingNodes.get('music').parameters.get('threshold').value,initial:window.routeGeneration,count:window.routeSources}));
  assert.equal(live.generation,live.initial);assert.equal(live.sources,live.count);assert.ok(Math.abs(live.send-.5)<1e-6);assert.equal(live.threshold,-30);
  await page.evaluate(()=>window.routeEngine.stop());
  // Saved topology, one undo and no mutation for a rejected feedback cycle.
  const history=await page.evaluate(()=>{
    const store=window.routeStore,before=store.getState().project;
    store.getState().updateTrack('speech',{output:'room'});const changed=store.getState().project;
    let rejected=false;try{store.getState().updateTrack('room',{output:'speech'});}catch{rejected=true;}
    const unchanged=store.getState().project===changed;store.temporal.getState().undo();return {rejected,unchanged,undo:JSON.stringify(store.getState().project)===JSON.stringify(before)};
  });
  assert.deepEqual(history,{rejected:true,unchanged:true,undo:true});
  const roundtrip=await page.evaluate(async()=>{
    const {serializeProject,deserializeProject}=await import('/src/lib/projectFile.ts');const state=window.routeStore.getState();const saved=serializeProject(state.project,state.sources);const loaded=await deserializeProject(saved,window.routeContext);return JSON.stringify(loaded.project)===JSON.stringify(state.project);
  });assert.equal(roundtrip,true);
  if(process.env.CRISPAUDIO_TEST_CLI){
    const wav=(pcm)=>{const data=Buffer.alloc(pcm.length*4);pcm.forEach((v,i)=>data.writeFloatLE(v,i*4));const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+data.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(3,20);h.writeUInt16LE(2,22);h.writeUInt32LE(48000,24);h.writeUInt32LE(384000,28);h.writeUInt16LE(8,32);h.writeUInt16LE(32,34);h.write('data',36);h.writeUInt32LE(data.length,40);return Buffer.concat([h,data]);};
    const sources=[];for(const source of fixture.sources){const path=join(temp,`${source.id}.wav`);await writeFile(path,wav(source.pcm));sources.push({id:source.id,path});}
    const input=join(temp,'routing.crispaudio'),output=join(temp,'routing.wav');await writeFile(input,JSON.stringify({format:'crispaudio-project',version:3,project:fixture.project,sources}));
    execFileSync(process.env.CRISPAUDIO_TEST_CLI,['render-project','--input',input,'--output',output,'--backend','apple']);const bytes=await readFile(output);let pcm;
    for(let off=12;off+8<bytes.length;){const len=bytes.readUInt32LE(off+4);if(bytes.toString('ascii',off,off+4)==='data'){pcm=bytes.subarray(off+8,off+8+len);break;}off+=8+len+len%2;}
    assert.equal(pcm.length,fixture.pcm.length*4);let peak=0,sum=0;for(let i=0;i<fixture.pcm.length;i++){const d=Math.abs(fixture.pcm[i]-pcm.readFloatLE(i*4));peak=Math.max(peak,d);sum+=d*d;}
    const rms=Math.sqrt(sum/fixture.pcm.length);assert.ok(peak<1e-4&&rms<1e-5,`routing PCM peak=${peak} rms=${rms}`);console.log(JSON.stringify({nativePeak:peak,nativeRms:rms}));
  }
  await page.getByRole('button',{name:'Mixer',exact:true}).click();
  await page.getByRole('button',{name:'Add bus',exact:true}).click();assert.equal(await page.evaluate(()=>window.routeStore.getState().project.tracks.filter(t=>t.kind==='bus').length),3);
  await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');});
  assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth>window.innerWidth),false);
  console.log(JSON.stringify({routing:'passed',sidechain:'passed',liveNoRestart:'passed',saveOpenUndo:'passed',rangeCrop:fixture.rangeError,german390:'passed',temp}));
  await page.evaluate(()=>window.routeContext.close());
}finally{await browser.close();}
