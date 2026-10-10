// Real worklet, offline render, transport and telemetry checks. Synthetic media only.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href:'playwright');
const browser=process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?await webkit.launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE}):await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5190');await page.waitForLoadState('networkidle');
 const offline=await page.evaluate(async()=>{
  const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts');const {useProjectStore}=await import('/src/stores/projectStore.ts');
  const ctx=new AudioContext({sampleRate:48000}),engine=new TimelineEngine(ctx);const buffer=ctx.createBuffer(2,48000,48000);
  for(let i=0;i<48000;i++){buffer.getChannelData(0)[i]=i===0?4:2*Math.sin(i*.1);buffer.getChannelData(1)[i]=-.25*buffer.getChannelData(0)[i];}
  const source={id:'s',name:'peaks',buffer,duration:1,sampleRate:48000,channels:2,peaks:[]};engine.setSources(new Map([['s',source]]));
  const clip={id:'c',sourceId:'s',trackId:'t',name:'peaks',startTime:0,sourceOffset:0,duration:1,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'};
  const project={...useProjectStore.getState().project,id:'p',sampleRate:48000,duration:1,masterVolume:2,outputLimiter:{enabled:true,ceiling:-1,release:.1},tracks:[{id:'t',name:'Mic',muted:false,solo:false,volume:1,pan:0,segments:[clip]}]};
  const full=await engine.renderToBuffer(project),range=await engine.renderMixRange(project,.3,.6);
  let peak=0,ratioError=0,rangeError=0;for(let i=0;i<full.length;i++){peak=Math.max(peak,Math.abs(full.getChannelData(0)[i]));ratioError=Math.max(ratioError,Math.abs(full.getChannelData(0)[i]+4*full.getChannelData(1)[i]));}
  for(let c=0;c<2;c++)for(let i=0;i<range.length;i++)rangeError=Math.max(rangeError,Math.abs(range.getChannelData(c)[i]-full.getChannelData(c)[i+14400]));
  await ctx.close();return {peak,ratioError,rangeError,first:full.getChannelData(0)[0]};
 });
 assert.ok(offline.peak<=10**(-1/20)+1e-7);assert.ok(offline.first>.89);assert.equal(offline.ratioError,0);assert.equal(offline.rangeError,0);
 await page.evaluate(async()=>{
  const {useUIStore}=await import('/src/stores/uiStore.ts');useUIStore.getState().setActivePanel('timeline');const {useProjectStore}=await import('/src/stores/projectStore.ts');const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts');
  window.dynamicsStarts=0;const play=TimelineEngine.prototype.play;TimelineEngine.prototype.play=function(...args){window.dynamicsStarts++;window.dynamicsEngine=this;return play.apply(this,args);};
  const ctx=new OfflineAudioContext(2,1,48000),buffer=ctx.createBuffer(2,20*48000,48000);for(let c=0;c<2;c++)for(let i=0;i<buffer.length;i++)buffer.getChannelData(c)[i]=Math.sin(i*.1);
  const clip={id:'c',sourceId:'s',trackId:'t',name:'peaks',startTime:0,sourceOffset:0,duration:20,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'};
  useProjectStore.getState().loadProjectState({id:'p',name:'Dynamics',sampleRate:48000,duration:20,masterEffects:[],masterVolume:4,outputLimiter:{enabled:true,ceiling:-1,release:.1},tracks:[{id:'t',name:'Mic',volume:1,pan:0,solo:false,muted:false,effects:[{type:'compressor',enabled:true,params:{threshold:-30,ratio:8,knee:0,attack:.003,release:.1}}],segments:[clip]}]},new Map([['s',{id:'s',name:'peaks',buffer,duration:20,sampleRate:48000,channels:2,peaks:[]}]]));useProjectStore.temporal.getState().clear();
 });
 await page.getByRole('button',{name:'Mixer',exact:true}).click();await page.getByRole('button',{name:'Play',exact:true}).click();
 await page.waitForFunction(()=>window.dynamicsStarts===1&&window.dynamicsEngine.getReduction('track:t')>1&&window.dynamicsEngine.getReduction('limiter')>1);
 const mixer=page.getByRole('complementary',{name:'Mixer'}),ceiling=mixer.getByRole('spinbutton',{name:'Ceiling (dBFS)'});await ceiling.fill('-6');await ceiling.blur();
 assert.equal(await page.evaluate(()=>window.dynamicsStarts),1);
 await page.waitForFunction(()=>{const nodes=window.dynamicsEngine.getMeter('master');if(!nodes)return false;const data=new Float32Array(2048);nodes[0].getFloatTimeDomainData(data);return Math.max(...data.map(Math.abs))<=10**(-6/20)+1e-7;});
 const history=await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.temporal.getState().pastStates.length;});assert.equal(history,1);
 await mixer.getByRole('region',{name:'Mic',exact:true}).getByRole('button',{name:'Inserts · 1'}).click();
 const output=mixer.locator('.effect-rack [data-gain-reduction] output');await output.waitFor();assert.notEqual(await output.textContent(),'−0.0 dB');
 await page.getByRole('button',{name:'Stop',exact:true}).click();await page.waitForFunction(()=>window.dynamicsEngine.getReduction('limiter')===0&&window.dynamicsEngine.getReduction('track:t')===0);
 await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');});
 const limiter=mixer.getByRole('region',{name:'Ausgangslimiter'});await limiter.scrollIntoViewIfNeeded();const bounds=await limiter.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);for(const field of await limiter.getByRole('spinbutton').all()){const box=await field.boundingBox();assert.ok(box.x>=bounds.x&&box.x+box.width<=bounds.x+bounds.width);}await page.screenshot({path:'/tmp/crispaudio-dynamics-de.png'});
 console.log(JSON.stringify({offline,zeroAddedDelay:'passed',stereoLink:'passed',rangeHistory:'passed',liveCeiling:'passed',noRestart:'passed',oneUndo:'passed',compressorAndLimiterGR:'passed',stopClears:'passed',germanNarrow:'passed'}));
}finally{await browser.close();}
