// Real capture worklets; generated MediaStreams replace physical device access.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=await(process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?webkit:chromium).launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE||process.env.CRISPAUDIO_CHROME_EXECUTABLE});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
 await page.addInitScript(()=>{
  window.captureFiles=[];window.inputs=[];window.requests=[];
  Object.defineProperty(MediaDevices.prototype,'getUserMedia',{configurable:true,value:async options=>{const device=options.audio.deviceId?.exact??'';window.requests.push(device);if(window.failInput===device)throw new Error('Synthetic connection failure');const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain(),destination=ctx.createMediaStreamDestination();osc.frequency.value=device==='a'?173:521;gain.gain.value=.1;osc.connect(gain);gain.connect(destination);osc.start();await ctx.resume();window.inputs.push({ctx,osc,stream:destination.stream});return destination.stream;}});
  Object.defineProperty(MediaDevices.prototype,'enumerateDevices',{configurable:true,value:async()=>['a','b'].map(deviceId=>({deviceId,kind:'audioinput',groupId:deviceId,label:deviceId,toJSON(){return this;}}))});
  window.__TAURI_INTERNALS__={metadata:{currentWebview:{label:'main'},currentWindow:{label:'main'}},transformCallback:()=>1,convertFileSrc:path=>path,invoke:async(command,args)=>{if(command==='desktop_media_available')return true;if(command==='take_opened_files')return [];if(command==='plugin:event|listen')return 1;if(command==='persist_recording'){if(window.failSave)throw new Error('Synthetic persistence failure');window.captureFiles.push(Array.from(args));return `/tmp/group-capture-${window.captureFiles.length}.wav`;}return undefined;}};window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
 });
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5191');await page.waitForLoadState('networkidle');
 await page.evaluate(async()=>{const {useUIStore:u}=await import('/src/stores/uiStore.ts');const {useProjectStore:s}=await import('/src/stores/projectStore.ts');window.store=s;window.ui=u;u.getState().setActivePanel('timeline');const p={...s.getInitialState().project,id:'group',sampleRate:48000,duration:4,minimumDuration:4,tracks:['a','b'].map((id,i)=>({id,name:id,segments:[],muted:false,solo:false,volume:1,pan:0,recordArmed:true,recordingInput:{deviceId:id,channel:i?'right':'mono',monitor:false,countIn:0,latencyMs:i*10}}))};s.getState().loadProjectState(p,new Map());s.getState().setPlayheadPosition(1);s.temporal.getState().clear();});
 await page.getByRole('button',{name:'Recording settings',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.locator('[data-recording-section=options] > summary').click();await dialog.locator('[data-recording-section=input] > summary').click();await dialog.getByRole('checkbox',{name:'All armed tracks (2)',exact:true}).check();assert.deepEqual(await page.evaluate(()=>window.requests),[]);
 // Warm preview ownership across project replacement, undo and late permission results.
 await dialog.getByRole('checkbox',{name:'All armed tracks (2)',exact:true}).uncheck();
 await dialog.getByRole('button',{name:'Connect input',exact:true}).click();
 await dialog.getByRole('button',{name:'Disconnect input',exact:true}).waitFor();
 await page.evaluate(()=>{const s=window.store.getState();window.store.setState({project:{...s.project,id:'replacement',tracks:s.project.tracks.map(t=>({...t,recordingInput:{...t.recordingInput,deviceId:'b'}}))}});});
 await dialog.getByRole('button',{name:'Connect input',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.inputs.every(i=>i.stream.getAudioTracks()[0].readyState==='ended')),true);
 await dialog.getByRole('button',{name:'Connect input',exact:true}).click();await dialog.getByRole('button',{name:'Disconnect input',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.requests.at(-1)),'b');
 await page.evaluate(()=>window.store.temporal.getState().undo());await dialog.getByRole('button',{name:'Connect input',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.inputs.every(i=>i.stream.getAudioTracks()[0].readyState==='ended')),true);
 await page.evaluate(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{const stream=await original(options);await new Promise(resolve=>{window.releaseInput=resolve;});return stream;};});
 await dialog.getByRole('button',{name:'Connect input',exact:true}).click();await page.waitForFunction(()=>!!window.releaseInput);
 await page.evaluate(()=>{const s=window.store.getState();window.store.setState({project:{...s.project,id:'late-project'}});window.releaseInput();});
 await dialog.getByRole('button',{name:'Connect input',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.inputs.every(i=>i.stream.getAudioTracks()[0].readyState==='ended')),true);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({replacement:'passed',undo:'passed',pendingConnection:'passed',hardware:'synthetic inputs'}));
 await page.evaluate(async()=>{for(const input of window.inputs){input.osc.stop();await input.ctx.close();}});
}finally{await browser.close();}
