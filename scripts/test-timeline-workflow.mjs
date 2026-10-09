// Optional end-to-end browser save/open/export + native linked render audit.
// Requires Playwright; CRISPAUDIO_CLI additionally requires installed FFmpeg/FFprobe.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const {chromium,webkit}=await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href:'playwright');
const browser=process.env.CRISPAUDIO_CHROME_EXECUTABLE?await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE}):await webkit.launch({headless:true});
const temp=await mkdtemp(join(tmpdir(),'crispaudio-workflow-'));
const videoPath=join(temp,'camera.mp4');
const clip={id:'a',trackId:'speaker',sourceId:'speaker-source',linkGroup:'left',startTime:0,sourceOffset:2,duration:5,gain:1,name:'Speaker',color:'#fff',effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'};
const picture={id:'v',linkGroup:'left',startTime:0,sourceOffset:2,duration:5,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0};
const track={id:'speaker',name:'Speaker',volume:.5,pan:-.2,muted:false,solo:false,segments:[clip,{...clip,id:'b',linkGroup:'right',startTime:5,sourceOffset:7}]};
const project={id:'p',name:'Interview workflow',sampleRate:48000,frameRate:25,duration:10,masterEffects:[],editRange:{start:3,end:4},markers:[{id:'m',name:'answer',time:8}],transcript:[{id:'cue',start:8,end:9,text:'Answer'}],tracks:[track,{...track,id:'room',name:'Room',pan:.2,segments:track.segments.map(c=>({...c,id:`room-${c.id}`,trackId:'room',sourceId:'room-source'}))},{...track,id:'music',name:'Music',volume:.2,pan:0,rippleEnabled:false,segments:[{...clip,id:'music',trackId:'music',sourceId:'music-source',linkGroup:undefined,sourceOffset:0,duration:10}]}],video:{path:videoPath,duration:16,session:{},clips:[picture,{...picture,id:'w',linkGroup:'right',startTime:5,sourceOffset:7}]}};
const clean=p=>JSON.parse(JSON.stringify(p));
function pcm(data){for(let pos=12;pos+8<=data.length;){const n=data.readUInt32LE(pos+4);if(data.toString('ascii',pos,pos+4)==='data')return data.subarray(pos+8,pos+8+n);pos+=8+n+(n%2);}throw new Error('Missing PCM');}
try{
 if(process.env.CRISPAUDIO_CLI)execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=25:d=16','-c:v','libx264','-threads','1','-pix_fmt','yuv420p',videoPath]);
 const page=await browser.newPage({viewport:{width:1600,height:1000}});await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5190');await page.waitForLoadState('networkidle');
 await page.evaluate(async p=>{
  const {useUIStore}=await import('/src/stores/uiStore.ts');useUIStore.getState().setActivePanel('timeline');
  const {useSettingsStore}=await import('/src/stores/settingsStore.ts');useSettingsStore.setState({defaultBitDepth:16,defaultExportFormat:'wav'});
  const {useProjectStore}=await import('/src/stores/projectStore.ts');const ctx=new OfflineAudioContext(1,1,48000),sources=new Map();
  for(const [id,freq] of [['speaker-source',173],['room-source',269],['music-source',97]]){
   const buffer=ctx.createBuffer(1,16*48000,48000),samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=.15*Math.sin(2*Math.PI*freq*i/48000);
   sources.set(id,{id,name:id,duration:16,sampleRate:48000,channels:1,buffer,peaks:[]});
  }
  useProjectStore.getState().loadProjectState(p,sources);useProjectStore.temporal.getState().clear();
 },project);
 const snapshot=()=>page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project;});
 await page.getByRole('button',{name:'Edit time range',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Apply edit'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 const extracted=await snapshot();assert.equal(extracted.duration,10);assert.deepEqual(clean(extracted.tracks[2]),clean(project.tracks[2]));assert.equal(extracted.video.clips.at(-1).startTime+extracted.video.clips.at(-1).duration,9);assert.equal(extracted.markers[0].time,7);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.getState().setSelection({segmentIds:['a'],startTime:0,endTime:3});});
 await page.getByRole('button',{name:'Trim tools',exact:true}).click();await page.getByRole('dialog').getByLabel('Move edge by (seconds)').fill('0.08');await page.getByRole('dialog').getByRole('button',{name:'Apply edit'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 const rolled=await snapshot();assert.ok(Math.abs(rolled.tracks[0].segments[0].duration-3.08)<1e-7);assert.equal(rolled.video.clips[0].duration,rolled.tracks[1].segments[0].duration);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().undo();});assert.deepEqual(clean(await snapshot()),clean(extracted));
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().undo();});assert.deepEqual(clean(await snapshot()),clean(project));
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().redo();useProjectStore.temporal.getState().redo();useProjectStore.getState().setEditRange(1,6);});
 const final=await snapshot();
 // Exercise the real transport through the shared engine before file/export actions.
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.getState().playEditRange();});
 await page.waitForFunction(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().playheadPosition>1.05;});
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.getState().setIsPlaying(false);});
 const save=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();const saved=await save;const savedPath=join(temp,'saved.crispaudio');await saved.saveAs(savedPath);
 const beforeDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export selected audio range',exact:true}).click();await (await beforeDownload).saveAs(join(temp,'before.wav'));
 // Open through the actual browser picker; decoded source identity and metadata survive.
 const choose=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open project',exact:true}).click();await (await choose).setFiles(savedPath);
 await page.waitForFunction(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().sources.size===3&&useProjectStore.getState().playheadPosition===0;});
 assert.deepEqual(clean(await snapshot()),clean(final));
 const afterDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export selected audio range',exact:true}).click();await (await afterDownload).saveAs(join(temp,'after.wav'));
 const before=pcm(await readFile(join(temp,'before.wav'))),after=pcm(await readFile(join(temp,'after.wav')));assert.deepEqual(before,after);assert.equal(after.length,5*48000*2*2);
 let native;
 if(process.env.CRISPAUDIO_CLI){
  const document=JSON.parse(await readFile(savedPath,'utf8'));
  for(const s of document.sources){s.path=join(temp,`${s.id}.wav`);await writeFile(s.path,Buffer.from(s.wav,'base64'));delete s.wav;}
  const linked=join(temp,'linked.crispaudio');await writeFile(linked,JSON.stringify(document));
  const originalInput=join(temp,'original.crispaudio'),recipe=join(temp,'edit.json'),nativeEdited=join(temp,'edited.crispaudio');
  await writeFile(originalInput,JSON.stringify({...document,project}));await writeFile(recipe,JSON.stringify([{op:'range-edit',operation:'extract',start:3,end:4},{op:'roll',ids:['a'],seconds:.08}]));
  execFileSync(process.env.CRISPAUDIO_CLI,['edit-project','--input',originalInput,'--recipe',recipe,'--output',nativeEdited]);
  const geometry=p=>{const links=new Map(),number=n=>Math.round(n*1e9)/1e9;const clip=c=>{if(c.linkGroup&&!links.has(c.linkGroup))links.set(c.linkGroup,links.size+1);return {start:number(c.startTime),offset:number(c.sourceOffset),duration:number(c.duration),group:links.get(c.linkGroup)??null};};return {duration:p.duration,markers:p.markers,transcript:p.transcript?.map(c=>({id:c.id,start:c.start,end:c.end,text:c.text})),tracks:p.tracks.map(t=>({id:t.id,clips:t.segments.map(clip)})),picture:p.video.clips.map(clip)};};
  assert.deepEqual(geometry(JSON.parse(await readFile(nativeEdited,'utf8')).project),geometry(final));
  execFileSync(process.env.CRISPAUDIO_CLI,['render-project','--input',linked,'--output',join(temp,'native.wav'),'--start','1','--end','6','--wav-bit-depth','16']);
  const actual=pcm(await readFile(join(temp,'native.wav')));assert.equal(actual.length,after.length);let maxDifference=0;for(let i=0;i<after.length;i+=2)maxDifference=Math.max(maxDifference,Math.abs(actual.readInt16LE(i)-after.readInt16LE(i)));assert.ok(maxDifference<=2,`Native vs browser PCM delta ${maxDifference}`);
  execFileSync(process.env.CRISPAUDIO_CLI,['--backend','apple','render-project','--input',linked,'--output',join(temp,'native.mp4'),'--video','--start','1','--end','6']);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',join(temp,'native.mp4')]));for(const type of ['audio','video'])assert.ok(Math.abs(Number(probe.streams.find(s=>s.codec_type===type).duration)-5)<1/25);
  native={editRecipe:'matches GUI',frames:5*48000,maxInt16Difference:maxDifference,videoSeconds:5};
 }
 console.log(JSON.stringify({linkedInterview:'passed',fixedMusic:'passed',extractThenRoll:'passed',undoRedo:'passed',rangePreview:'passed',saveReopen:'passed',rangeExportBeforeAfter:'byte-identical',native}));
}finally{await browser.close();await rm(temp,{recursive:true,force:true});}
