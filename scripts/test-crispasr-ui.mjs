// Actual-UI check of the CrispASR audio tools in headless Chrome against a served
// Vite app. A fixture Tauri bridge answers crispasr_* by running the real
// `crispaudio` CLI (same media::crispasr code) with real models and library, and
// stores owned conversion files in a temporary folder. It does not exercise
// Tauri's IPC transport, the installed app, audio hardware or listening quality.
//
// Required: CRISPAUDIO_PLAYWRIGHT_MODULE, CRISPAUDIO_CHROME_EXECUTABLE,
// CRISPAUDIO_CLI (built crispaudio binary), CRISPASR_LIB, CRISPASR_TEST_MODELS
// (folder with mel-band-roformer-vocals-f16.gguf, sidon-v0.1-q8_0.gguf,
// ggml-silero-v6.2.0.bin, beat-this-f16.gguf), CRISPAUDIO_SPEECH_WAV (mono/stereo
// speech WAV, e.g. CrispASR samples/jfk.wav). Optional CRISPAUDIO_TEST_URL.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const env=name=>{const value=process.env[name];assert.ok(value,`${name} is required`);return value;};
const cli=env('CRISPAUDIO_CLI'),library=env('CRISPASR_LIB'),models=env('CRISPASR_TEST_MODELS'),speechWav=env('CRISPAUDIO_SPEECH_WAV');
const model={separation:join(models,'mel-band-roformer-vocals-f16.gguf'),speech:join(models,'sidon-v0.1-q8_0.gguf'),vad:join(models,'ggml-silero-v6.2.0.bin'),beats:join(models,'beat-this-f16.gguf')};
const {chromium}=await import(pathToFileURL(env('CRISPAUDIO_PLAYWRIGHT_MODULE')).href);
const root=mkdtempSync(join(tmpdir(),'crispaudio-crispasr-ui-')),owned=[],calls=[];

function writeWav(path,planar,rate){
 const frames=planar[0].length,channels=planar.length,data=Buffer.alloc(frames*channels*4);
 for(let i=0;i<frames;i++)for(let c=0;c<channels;c++)data.writeFloatLE(planar[c][i],(i*channels+c)*4);
 const h=Buffer.alloc(44);h.write('RIFF',0);h.writeUInt32LE(36+data.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(3,20);h.writeUInt16LE(channels,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*channels*4,28);h.writeUInt16LE(channels*4,32);h.writeUInt16LE(32,34);h.write('data',36);h.writeUInt32LE(data.length,40);
 writeFileSync(path,Buffer.concat([h,data]));
}
function readFloatWav(path){
 const b=readFileSync(path);let at=12,channels=0,rate=0,format=0,bits=0;
 while(at<b.length){const id=b.toString('ascii',at,at+4),size=b.readUInt32LE(at+4);
  if(id==='fmt '){format=b.readUInt16LE(at+8);channels=b.readUInt16LE(at+10);rate=b.readUInt32LE(at+12);bits=b.readUInt16LE(at+22);if(format===0xfffe)format=b.readUInt16LE(at+32);}
  if(id==='data'){const frames=size/(channels*bits/8),planar=Array.from({length:channels},()=>new Float32Array(frames));for(let i=0;i<frames;i++)for(let c=0;c<channels;c++){const o=at+8+(i*channels+c)*bits/8;planar[c][i]=bits===32&&format===3?b.readFloatLE(o):bits===16?b.readInt16LE(o)/32768:b.readInt32LE(o)/2147483648;}return {rate,planar};}
  at+=8+size+(size&1);}
 throw new Error(`no data chunk in ${path}`);
}
const run=args=>execFileSync(cli,args,{env:{...process.env,CRISPASR_LIB:library},maxBuffer:64<<20}).toString();
let job=0;
function crisp(command,header,raw){
 const dir=join(root,`job-${++job}`);mkdirSync(dir);
 const floats=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4),frames=floats.length/header.channels;
 const planar=Array.from({length:header.channels},(_,c)=>floats.subarray(c*frames,(c+1)*frames));
 const input=join(dir,'in.wav');writeWav(input,planar,header.rate);calls.push({task:header.task,frames,rate:header.rate,channels:header.channels,model:header.model});
 if(command==='crispasr_analyze'){
  const out=join(dir,'out.json');
  run(header.task==='regions'?['speech-regions','--input',input,'--model',header.model,'--output',out,'--min-pause','0.01']:['detect-beats','--input',input,'--model',header.model,'--output',out]);
  const json=JSON.parse(readFileSync(out,'utf8'));
  return header.task==='regions'?{regions:json.regions}:{tempoBpm:json.tempoBpm,beats:json.beats};
 }
 let stems;
 if(header.task==='separate'){const listing=JSON.parse(run(['separate-audio','--input',input,'--model',header.model,'--output-dir',dir]));stems=listing.stems.map(s=>({name:s.stem,...readFloatWav(s.path)}));}
 else{const out=join(dir,'speech.wav');run(['regenerate-speech','--input',input,'--model',header.model,'--output',out]);stems=[{name:'speech',...readFloatWav(out)}];}
 const parts=[];const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v);parts.push(b);};
 u32(stems.length);for(const s of stems){const name=Buffer.from(s.name);u32(name.length);parts.push(name);u32(s.planar.length);u32(s.planar[0].length);for(const c of s.planar)parts.push(Buffer.from(c.buffer,c.byteOffset,c.byteLength));}
 return {__bytes:Buffer.concat(parts).toString('base64')};
}

const browser=await chromium.launch({headless:true,executablePath:env('CRISPAUDIO_CHROME_EXECUTABLE'),args:['--mute-audio']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.setDefaultTimeout(240000);
 page.on('pageerror',e=>errors.push(e.stack??String(e)));
 await page.exposeFunction('crispNative',async(command,args,raw,headers)=>{
  if(command==='crispasr_status')return {available:true,path:library};
  if(command==='crispasr_process'||command==='crispasr_analyze')return crisp(command,JSON.parse(headers['x-crispasr']),Buffer.from(raw,'base64'));
  if(command==='cancel_media_job')return true;
  if(command==='recording_conversion_write'){const path=join(root,`owned-${owned.length}.wav`);writeFileSync(path,Buffer.from(raw,'base64'));owned.push(path);return path;}
  if(command==='desktop_media_available')return false;
  if(command==='take_opened_files')return [];
  if(command==='plugin:event|listen')return 1;
  return null;
 });
 await page.addInitScript(()=>{
  const toBase64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);};
  window.crispResponses=[];
  window.__TAURI_INTERNALS__={metadata:{currentWebview:{label:'main'},currentWindow:{label:'main'}},transformCallback:()=>1,convertFileSrc:p=>p,
   invoke:async(command,args,options)=>{
    const raw=args instanceof Uint8Array?toBase64(args):null;
    const result=await window.crispNative(command,raw?null:args??null,raw,options?.headers??{});
    if(result&&typeof result==='object'&&'__bytes' in result){const bin=atob(result.__bytes),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);window.crispResponses.push(bytes.buffer);return bytes.buffer.slice(0);}
    return result;
   }};
  window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
 });
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5197');await page.waitForLoadState('networkidle');

 const speech=readFloatWav(speechWav);
 await page.evaluate(async({planar,rate,model,library})=>{
  const {useProjectStore:store}=await import('/src/stores/projectStore.ts'),{useSettingsStore:settings}=await import('/src/stores/settingsStore.ts'),{computeWaveformPeaks}=await import('/src/audio/utils/audioBufferUtils.ts');
  // Persisted settings rehydrate asynchronously; set paths only afterwards.
  if(!settings.persist.hasHydrated())await new Promise(resolve=>settings.persist.onFinishHydration(resolve));
  for(const [key,path] of Object.entries({library,...model}))settings.getState().setCrispasrPath(key,path);
  if(settings.getState().crispasr.separation!==model.separation)throw new Error('settings did not persist');
  // Resample to the project rate in the browser, as an import would.
  const source=new AudioBuffer({numberOfChannels:planar.length,length:planar[0].length,sampleRate:rate});planar.forEach((c,i)=>source.copyToChannel(Float32Array.from(c),i));
  const context=new OfflineAudioContext(2,Math.round(source.duration*48000),48000),node=context.createBufferSource();node.buffer=source;node.connect(context.destination);node.start();
  const buffer=await context.startRendering();
  const load=()=>{store.getState().loadProjectState({...store.getInitialState().project,id:crypto.randomUUID(),sampleRate:48000,tracks:[]},new Map());store.getState().importAudioSource({id:'speech',name:'Speech',buffer,duration:buffer.duration,sampleRate:48000,channels:2,peaks:computeWaveformPeaks(buffer.getChannelData(0),800)});store.getState().selectSegment(store.getState().project.tracks[0].segments[0].id);store.temporal.getState().clear();};
  load();window.crispTest={store,load,original:buffer};
 },{planar:speech.planar.map(c=>Array.from(c)),rate:speech.rate,model,library});

 const openEditor=async()=>{await page.waitForFunction(async()=>{const {runTimelineTool}=await import('/src/hooks/useTimelineTool.ts');await runTimelineTool('source-editor');return !!document.querySelector('[data-source-editor]');});};
 const editor=page.locator('[data-source-editor]'),crispTools=editor.locator('[data-source-crisp]');
 const fill=async(name,value)=>{const el=editor.getByRole('spinbutton',{name,exact:true});await el.fill(String(value));await el.press('Enter');};
 const apply=async type=>{await editor.getByRole('button',{name:'Apply',exact:true}).click();await page.waitForFunction(kind=>window.crispTest.store.getState().project.tracks[0].segments[0].sourceEdit?.operations.at(-1).type===kind,type);};

 // 1. Separate a selection, choose the "other" stem, Apply; outside samples stay exact.
 await openEditor();await crispTools.locator('summary').first().click();
 await editor.getByText('Ranges',{exact:true}).click();await fill('Start sample 1',96000);await fill('End sample 1',240000);
 await crispTools.getByRole('button',{name:'Prepare preview',exact:true}).click();
 const stemChoice=crispTools.getByRole('combobox',{name:'Keep stem',exact:true});await stemChoice.waitFor();
 assert.deepEqual(await stemChoice.locator('option').allTextContents(),['vocals','other']);
 await stemChoice.selectOption({label:'other'});await apply('separate');
 const separated=await page.evaluate(async()=>{
  const {decodeStems}=await import('/src/lib/crispasr.ts'),h=window.crispTest,state=h.store.getState(),clip=state.project.tracks[0].segments[0],out=state.sources.get(clip.sourceId).buffer,op=clip.sourceEdit.operations.at(-1);
  const stems=decodeStems(window.crispResponses.at(-1)),other=stems.find(s=>s.name==='other');let outside=0,inside=0;
  for(let ch=0;ch<2;ch++){const a=out.getChannelData(ch),o=h.original.getChannelData(ch),w=other.channels[ch];for(let i=0;i<a.length;i++){if(i<96000||i>=240000)outside=Math.max(outside,Math.abs(a[i]-o[i]));else if(i>=96240&&i<239760)inside=Math.max(inside,Math.abs(a[i]-w[i]));}}
  return {outsideMaxError:outside,insideMaxErrorVsStem:inside,parameters:op.parameters,ranges:op.ranges,stems:stems.map(s=>s.name),undo:h.store.temporal.getState().pastStates.length};
 });
 assert.equal(separated.outsideMaxError,0);assert.equal(separated.insideMaxErrorVsStem,0);assert.equal(separated.parameters.stem,1);assert.equal(separated.undo,1);
 await page.evaluate(()=>window.crispTest.store.temporal.getState().undo());
 assert.equal(await page.evaluate(()=>window.crispTest.store.getState().project.tracks[0].segments[0].sourceId),'speech');
 await page.getByRole('button',{name:'Close panel',exact:true}).click();

 // 2. Whole clip into stem tracks: one Undo step, owned files, edit group, muted original.
 await page.evaluate(()=>window.crispTest.load());await openEditor();await crispTools.locator('summary').first().click();
 const filesBefore=owned.length;
 await crispTools.getByRole('button',{name:'Separate whole clip into stem tracks',exact:true}).click();
 await page.waitForFunction(()=>window.crispTest.store.getState().project.tracks.length===3);
 const tracks=await page.evaluate(()=>{const h=window.crispTest,s=h.store.getState(),t=s.project.tracks;return {names:t.map(x=>x.name),muted:t.map(x=>x.muted),groups:t.map(x=>x.segments[0].editGroup?.id),frames:t.slice(1).map(x=>s.sources.get(x.segments[0].sourceId).buffer.length),files:t.slice(1).map(x=>s.sources.get(x.segments[0].sourceId).filePath),undo:h.store.temporal.getState().pastStates.length,status:document.querySelector('[data-source-crisp] [role=status]')?.textContent};});
 assert.deepEqual(tracks.muted,[true,false,false]);assert.equal(new Set(tracks.groups).size,1);assert.ok(tracks.groups[0]);assert.equal(tracks.undo,1);
 assert.equal(owned.length-filesBefore,2);assert.ok(tracks.files.every(f=>owned.includes(f)));
 assert.ok(tracks.frames.every(f=>f===clipFrames(speech)),'stem tracks keep the clip length');
 await page.evaluate(()=>window.crispTest.store.temporal.getState().undo());assert.equal(await page.evaluate(()=>window.crispTest.store.getState().project.tracks.length),1);
 await page.getByRole('button',{name:'Close panel',exact:true}).click();

 // 3. Generative speech regeneration feeds both channels inside the selection only.
 await page.evaluate(()=>window.crispTest.load());await openEditor();await crispTools.locator('summary').first().click();
 await editor.getByText('Ranges',{exact:true}).click();await fill('Start sample 1',48000);await fill('End sample 1',192000);
 await crispTools.getByRole('combobox',{name:'CrispASR tool',exact:true}).selectOption({label:'Regenerate speech (generative)'});
 await crispTools.getByText('Generated voice: listen carefully before applying.').waitFor();
 await crispTools.getByRole('button',{name:'Prepare preview',exact:true}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-source-editor] button')].some(b=>b.textContent==='Apply'&&!b.disabled));
 await apply('speech');
 const regenerated=await page.evaluate(()=>{const h=window.crispTest,s=h.store.getState(),clip=s.project.tracks[0].segments[0],out=s.sources.get(clip.sourceId).buffer;let outside=0,channelDiff=0,energy=0;
  for(let i=0;i<out.length;i++){const l=out.getChannelData(0)[i],r=out.getChannelData(1)[i];if(i<48000||i>=192000)outside=Math.max(outside,Math.abs(l-h.original.getChannelData(0)[i]),Math.abs(r-h.original.getChannelData(1)[i]));else{energy+=l*l;if(i>=48240&&i<191760)channelDiff=Math.max(channelDiff,Math.abs(l-r));}}
  return {outsideMaxError:outside,channelDiffInside:channelDiff,rmsInside:Math.sqrt(energy/144000)};});
 assert.equal(regenerated.outsideMaxError,0);assert.equal(regenerated.channelDiffInside,0);assert.ok(regenerated.rmsInside>1e-3,'regenerated speech is not silent');
 await page.getByRole('button',{name:'Close panel',exact:true}).click();

 // 4. Tighten pauses through Workspace → Transcript with one reviewed commit.
 await page.evaluate(()=>window.crispTest.load());
 await page.evaluate(async()=>{const {dispatchNativeMenu}=await import('/src/lib/nativeMenu.ts');dispatchNativeMenu('workspace');});
 await page.getByRole('tab',{name:'Transcript',exact:true}).click();
 const pauses=page.locator('[data-pause-tightening]');await pauses.locator('summary').first().click();
 const number=async(name,value)=>{const el=pauses.getByRole('spinbutton',{name,exact:true});await el.fill(String(value));await el.press('Enter');};
 await number('Minimum pause (s)',0.3);await number('Keep (s)',0.2);
 await pauses.getByRole('button',{name:'Find pauses',exact:true}).click();
 const summary=pauses.getByText(/pauses; .* s will be removed\./);await summary.waitFor();
 const [,count,removed]=(await summary.textContent()).match(/(\d+) pauses; ([\d.]+) s/);
 const before=await page.evaluate(()=>window.crispTest.store.getState().project.duration);
 await pauses.getByRole('button',{name:'Shorten pauses',exact:true}).click();
 const tightened=await page.evaluate(()=>{const h=window.crispTest,p=h.store.getState().project;return {duration:p.duration,clips:p.tracks[0].segments.length,undo:h.store.temporal.getState().pastStates.length};});
 assert.ok(Number(count)>=2);assert.ok(Math.abs(before-tightened.duration-Number(removed))<0.01,`${before}-${tightened.duration} vs ${removed}`);assert.equal(tightened.clips,Number(count)+1);assert.equal(tightened.undo,1);
 await page.evaluate(()=>window.crispTest.store.temporal.getState().undo());assert.ok(Math.abs(await page.evaluate(()=>window.crispTest.store.getState().project.duration)-before)<1e-9);

 // 5. Beat detection on a synthetic 120 BPM accented click track sets the grid and markers.
 await page.evaluate(async()=>{const {useProjectStore:store}=await import('/src/stores/projectStore.ts'),{computeWaveformPeaks}=await import('/src/audio/utils/audioBufferUtils.ts');
  const rate=48000,buffer=new AudioBuffer({numberOfChannels:2,length:rate*12,sampleRate:rate});
  for(let beat=0;beat<24;beat++){const start=Math.round(beat*.5*rate),accent=beat%4===0,freq=accent?1500:900;for(let i=0;i<rate*.08;i++){const v=(accent?.8:.5)*Math.sin(2*Math.PI*freq*i/rate)*Math.exp(-i/(rate*.015))+.3*Math.sin(2*Math.PI*(accent?55:110)*i/rate)*Math.exp(-i/(rate*.05));for(let ch=0;ch<2;ch++)buffer.getChannelData(ch)[start+i]+=v;}}
  store.getState().loadProjectState({...store.getInitialState().project,id:crypto.randomUUID(),sampleRate:rate,tracks:[]},new Map());store.getState().importAudioSource({id:'clicks',name:'Clicks',buffer,duration:12,sampleRate:rate,channels:2,peaks:computeWaveformPeaks(buffer.getChannelData(0),800)});store.temporal.getState().clear();});
 await page.evaluate(async()=>{const {runTimelineTool}=await import('/src/hooks/useTimelineTool.ts');await runTimelineTool('musical-time');});
 const beats=page.locator('[data-beat-detection]');await beats.locator('summary').first().click();
 await beats.getByRole('button',{name:'Detect beats',exact:true}).click();
 // Beat This! finds every beat of this synthetic click but its downbeat flags are
 // inconsistent, so the UI must offer tempo only and no bar markers.
 const beatSummary=beats.getByText(/BPM, \d+ beats\. Downbeats are unclear/);await beatSummary.waitFor();
 assert.equal(await beats.getByRole('button',{name:'Add bar markers',exact:true}).count(),0);
 await beats.getByRole('button',{name:'Use tempo and first downbeat',exact:true}).click();
 const grid=await page.evaluate(()=>{const p=window.crispTest.store.getState().project;return {music:p.music,markers:(p.markers??[]).length};});
 assert.ok(Math.abs(grid.music.tempo-120)<1,`tempo ${grid.music.tempo}`);assert.equal(grid.music.numerator,4);assert.ok(grid.music.origin<.05);assert.equal(grid.markers,0);
 await page.keyboard.press('Escape');

 // 6. German phone width labels.
 await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');window.crispTest.load();});
 await openEditor();await editor.getByText('CrispASR-Audiowerkzeuge',{exact:true}).waitFor();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
 assert.ok(overflow<=0,`horizontal overflow ${overflow}px`);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({separated,tracks:{names:tracks.names,muted:tracks.muted,status:tracks.status},regenerated,tightened:{pauses:Number(count),removedSeconds:Number(removed),before,after:tightened.duration},beats:{summary:await beatSummary.textContent().catch(()=>null),music:grid.music,markers:grid.markers},bridgeCalls:calls.map(c=>`${c.task}:${c.channels}ch@${c.rate}x${c.frames}`),ownedFiles:owned.length,germanPhone:true,transport:'fixture bridge → real crispaudio CLI + real libcrispasr/models',physicalAudio:false}));
}catch(error){
 const page=browser.contexts()[0]?.pages()[0];
 if(page)console.error('UI state:',await page.evaluate(()=>JSON.stringify([...document.querySelectorAll('[data-source-crisp],[data-pause-tightening],[data-beat-detection],[role=alert]')].map(e=>e.textContent.slice(0,400)))).catch(()=>null));
 console.error('bridge calls:',JSON.stringify(calls));
 throw error;
}finally{await browser.close();rmSync(root,{recursive:true,force:true});}

function clipFrames(audio){return Math.round(audio.planar[0].length/audio.rate*48000);}
