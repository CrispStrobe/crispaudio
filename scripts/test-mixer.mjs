// Real audio graph and pointer regression; no installed project/media touched.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5190');await page.waitForLoadState('networkidle');
 await page.evaluate(async()=>{
  const {useUIStore}=await import('/src/stores/uiStore.ts');useUIStore.getState().setActivePanel('timeline');
  const {useProjectStore}=await import('/src/stores/projectStore.ts');
  const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts');
  window.mixerStarts=0;const play=TimelineEngine.prototype.play;TimelineEngine.prototype.play=function(...args){window.mixerStarts++;window.mixerEngine=this;return play.apply(this,args);};
  const ctx=new OfflineAudioContext(2,1,48000),buffer=ctx.createBuffer(2,48000*20,48000);
  buffer.getChannelData(0).fill(.25);buffer.getChannelData(1).fill(-.25);
  const clip={id:'c',trackId:'t',sourceId:'s',name:'Tone',startTime:0,sourceOffset:0,duration:20,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'};
  useProjectStore.getState().loadProjectState({id:'p',name:'Mixer test',sampleRate:48000,duration:20,masterEffects:[],tracks:[{id:'t',name:'Room',muted:false,solo:false,volume:1,pan:0,segments:[clip]}]},new Map([['s',{id:'s',name:'tone',buffer,duration:20,sampleRate:48000,channels:2,peaks:[]}]]));useProjectStore.temporal.getState().clear();
 });
 await page.getByRole('button',{name:'Mixer',exact:true}).click();
 const mixer=page.getByRole('complementary',{name:'Mixer'});await mixer.waitFor();
 await page.getByRole('button',{name:'Play',exact:true}).click();
 await page.waitForFunction(()=>window.mixerStarts===1);
 await page.waitForFunction(()=>{const channels=window.mixerEngine.getMeter('t');if(!channels)return false;return channels.every(node=>{const samples=new Float32Array(2048);node.getFloatTimeDomainData(samples);return Math.max(...samples.map(Math.abs))>.2;});});
 const fader=mixer.getByRole('slider',{name:'Room: Level'}),box=await fader.boundingBox();
 await page.mouse.move(box.x+box.width*.8,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height/2,{steps:5});await page.mouse.up();
 const live=await page.evaluate(async()=>{
  const {useProjectStore}=await import('/src/stores/projectStore.ts');const state=useProjectStore.getState();
  const meter=window.mixerEngine.getMeter('t');const data=new Float32Array(2048);meter[0].getFloatTimeDomainData(data);
  return {starts:window.mixerStarts,position:state.playheadPosition,volume:state.project.tracks[0].volume,past:useProjectStore.temporal.getState().pastStates.length,meterChannels:meter.length};
 });
 assert.equal(live.starts,1);assert.ok(live.position>0);assert.notEqual(live.volume,1);assert.equal(live.past,1);assert.equal(live.meterChannels,2);
 await mixer.getByRole('button',{name:'Room: Mute'}).click();await mixer.getByRole('button',{name:'Room: Solo'}).click();
 assert.equal(await page.evaluate(()=>window.mixerStarts),1);
 await page.getByRole('button',{name:'Stop',exact:true}).click();
 const results=await page.evaluate(async()=>{
  const {useProjectStore}=await import('/src/stores/projectStore.ts');const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts');const {serializeProject,deserializeProject}=await import('/src/lib/projectFile.ts');
  const state=useProjectStore.getState(),engine=new TimelineEngine(new AudioContext());engine.setSources(state.sources);
  const p={...state.project,masterVolume:1,tracks:state.project.tracks.map(t=>({...t,volume:1,pan:0,solo:false,muted:false}))};
  const full=await engine.renderToBuffer(p,0,.1),half=await engine.renderToBuffer({...p,masterVolume:.5},0,.1);
  let error=0;for(let c=0;c<2;c++)for(let i=0;i<full.length;i++)error=Math.max(error,Math.abs(half.getChannelData(c)[i]-full.getChannelData(c)[i]*.5));
  const saved=await serializeProject({...p,masterVolume:.5},state.sources),loaded=await deserializeProject(saved,new OfflineAudioContext(2,1,48000));
  return {error,savedMaster:loaded.project.masterVolume};
 });
 assert.equal(results.error,0);assert.equal(results.savedMaster,.5);
 await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');});
 const bounds=await mixer.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
 await page.screenshot({path:'/tmp/crispaudio-mixer-de.png'});
 console.log(JSON.stringify({liveFader:'passed',noPlaybackRestart:'passed',pointerUndo:'passed',soloMute:'passed',stereoMeters:'passed',offlineMaster:'passed',saveLoad:'passed',germanTouchWidth:'passed'}));
} finally {await browser.close();}
