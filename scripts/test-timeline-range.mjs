// Optional actual-WebKit range gestures and audio boundary check.
import {pathToFileURL} from 'node:url';
const {webkit}=await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href : 'playwright');
import assert from 'node:assert/strict';
const browser=await webkit.launch({headless:true,...(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?{executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5190');await page.waitForLoadState('networkidle');
 await page.evaluate(async()=>{
  const {useUIStore}=await import('/src/stores/uiStore.ts');useUIStore.getState().setActivePanel('timeline');
  const {useProjectStore}=await import('/src/stores/projectStore.ts');
  useProjectStore.getState().loadProjectState({id:'range-test',name:'range-test',sampleRate:48000,duration:10,minimumDuration:10,tracks:[],masterEffects:[]},new Map());
  useProjectStore.setState({zoomLevel:100,scrollOffset:0,selectionMode:'range'});
 });
 const ruler=page.locator('.timeline-editor canvas').first();await ruler.waitFor();
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.setState({selectionMode:'range',zoomLevel:100,scrollOffset:0});});
 await page.locator('.timeline-editor canvas[data-help="range"]').waitFor();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const rect=await ruler.boundingBox();assert.ok(rect);
 await page.mouse.move(rect.x+200,rect.y+12);await page.mouse.down();await page.mouse.move(rect.x+400,rect.y+12,{steps:5});await page.mouse.up();
 const range=await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project.editRange;});
 assert.deepEqual(range,{start:2,end:4});
 const edge=page.getByRole('slider',{name:'Range end'});await edge.focus();await page.keyboard.press('ArrowRight');
 const after=await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project.editRange;});assert.equal(after.end,4.001);
 const audio=await page.evaluate(async()=>{
  const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts');
  const context=new OfflineAudioContext(2,48000,48000),buffer=context.createBuffer(1,48000,48000);
  buffer.getChannelData(0).fill(.1);
  const engine=new TimelineEngine(context);engine.setSources(new Map([['s',{id:'s',buffer}]]));
  engine.play({duration:1,sampleRate:48000,masterEffects:[],tracks:[{volume:1,pan:0,muted:false,solo:false,effects:[{type:'delay',enabled:true,params:{time:.02,feedback:.3,mix:.5}}],segments:[{sourceId:'s',startTime:0,duration:1,sourceOffset:0,gain:1,fadeInDuration:0,fadeOutDuration:0,effects:[]}]}]},.2,.4);
  const rendered=await context.startRendering(),samples=rendered.getChannelData(0);
  return {inside:Math.max(...samples.slice(0,9600)),outside:Math.max(...samples.slice(9600))};
 });assert.ok(audio.inside>.01);assert.equal(audio.outside,0);
 const exportAudio=await page.evaluate(async()=>{
  const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts');
  const context=new OfflineAudioContext(2,48000,48000),buffer=context.createBuffer(1,48000,48000);buffer.getChannelData(0).fill(.1);
  const engine=new TimelineEngine(context);engine.setSources(new Map([['s',{id:'s',buffer}]]));
  const project={duration:.1,sampleRate:48000,masterEffects:[{type:'delay',enabled:true,params:{time:.01,feedback:.4,mix:.5}}],tracks:[{volume:1,pan:0,muted:false,solo:false,automation:[{time:0,value:.1},{time:.1,value:.9}],segments:[{sourceId:'s',startTime:0,duration:.02,sourceOffset:0,gain:1,fadeInDuration:0,fadeOutDuration:0,effects:[]}]}]};
  const full=await engine.renderToBuffer(project),slice=await engine.renderMixRange(project,.03001,.07001);
  let difference=0,peak=0;
  for(let ch=0;ch<2;ch++)for(let i=0;i<slice.length;i++){difference=Math.max(difference,Math.abs(slice.getChannelData(ch)[i]-full.getChannelData(ch)[i+Math.round(.03001*48000)]));peak=Math.max(peak,Math.abs(slice.getChannelData(ch)[i]));}
  return {frames:slice.length,difference,peak};
 });assert.equal(exportAudio.frames,1920);assert.equal(exportAudio.difference,0);assert.ok(exportAudio.peak>0);
 console.log(JSON.stringify({range,after,audio,exportAudio}));
}finally{await browser.close();}
