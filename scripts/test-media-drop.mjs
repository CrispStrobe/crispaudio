// Synthetic media with a mocked native bridge; exercises actual Tauri event API,
// global drop listener, timeline importer, linked AV and shared playback graph.
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=await (process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?webkit:chromium).launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE||process.env.CRISPAUDIO_CHROME_EXECUTABLE});
const fixture=mkdtempSync(join(tmpdir(),'crispaudio-drop-'));
try{
 const videoPath=join(fixture,'synthetic.mp4');execFileSync(process.env.CRISPAUDIO_FFMPEG||'ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=25:d=2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',videoPath]);const videoBytes=readFileSync(videoPath);
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('http://asset.localhost/**',async route=>{const range=route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);if(range){const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):videoBytes.length-1,videoBytes.length-1);await route.fulfill({status:206,headers:{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${videoBytes.length}`,'Access-Control-Allow-Origin':'*'},body:videoBytes.subarray(start,end+1)});}else await route.fulfill({contentType:'video/mp4',headers:{'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*'},body:videoBytes});});
 await page.addInitScript(()=>{
  const callbacks=new Map(),listeners=new Map();let next=1;window.dropCalls=[];
  window.__TAURI_INTERNALS__={metadata:{currentWebview:{label:'main'},currentWindow:{label:'main'}},transformCallback(cb){const id=next++;callbacks.set(id,cb);return id;},convertFileSrc:path=>`http://asset.localhost/${path}`,async invoke(command,args){
   window.dropCalls.push({command,args});
   if(command==='plugin:event|listen'){const id=next++,entries=listeners.get(args.event)??new Map();entries.set(id,args.handler);listeners.set(args.event,entries);return id;}
   if(command==='plugin:event|unlisten'){listeners.get(args.event)?.delete(args.eventId);return;}
   if(command==='configure_native_menu')return;
   if(command==='take_opened_files')return [];
   if(command==='desktop_media_available')return true;
   if(command==='probe_media')return {has_video:true,channels:2,duration:2,sample_rate:48000};
   if(command==='prepare_video_preview')return '/tmp/drop-synthetic.mp4';
   if(command==='prepare_media_asset')return '/tmp/drop-synthetic.wav';
   if(command==='plugin:fs|read_file'){
    const rate=48000,length=rate*2,b=new ArrayBuffer(44+length*4),v=new DataView(b),str=(at,text)=>[...text].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)));
    str(0,'RIFF');v.setUint32(4,b.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,length*4,true);
    for(let i=0;i<length;i++)for(let ch=0;ch<2;ch++)v.setInt16(44+(i*2+ch)*2,Math.round(.15*32767*Math.sin(2*Math.PI*440*i/rate)),true);return b;
   }
   throw new Error(`Mock native unavailable: ${command}`);
  }};
  window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
  window.deliverDrop=(event,payload)=>{const entries=listeners.get(event);if(!entries?.size)throw new Error('Missing drop listener');for(const [id,handler] of entries)callbacks.get(handler)({event,id,payload});};
 });
 await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5190');await page.waitForLoadState('networkidle');
 await page.evaluate(async()=>{const {useUIStore}=await import('/src/stores/uiStore.ts');const {useProjectStore}=await import('/src/stores/projectStore.ts');window.dropUI=useUIStore;window.dropProject=useProjectStore;useUIStore.getState().setActivePanel('sfx');});
 await page.evaluate(()=>window.deliverDrop('tauri://drag-enter',{paths:['/tmp/Camera.MP4'],position:{x:10,y:10}}));await page.getByText('Drop media here',{exact:true}).waitFor();
 await page.evaluate(()=>window.deliverDrop('tauri://drag-drop',{paths:['/tmp/Camera.MP4'],position:{x:10,y:10}}));
 await page.waitForFunction(()=>window.dropProject.getState().project.video?.clips?.length===1&&window.dropProject.getState().sources.size===1);
 const result=await page.evaluate(()=>{const state=window.dropProject.getState(),track=state.project.tracks.at(-1),clip=track.segments[0];return {panel:window.dropUI.getState().activePanel,muted:track.muted,linked:clip.linkGroup===state.project.video.clips[0].linkGroup,duration:clip.duration,calls:window.dropCalls.filter(c=>['probe_media','prepare_media_asset','plugin:fs|read_file'].includes(c.command))};});
 assert.equal(result.panel,'timeline');assert.equal(result.muted,false);assert.equal(result.linked,true);assert.equal(result.duration,2);assert.equal(result.calls[2].args.path,'/tmp/drop-synthetic.wav');
 await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForFunction(()=>window.dropProject.getState().playheadPosition>.2);await page.getByRole('button',{name:'Stop',exact:true}).click();
 await page.evaluate(()=>window.dropProject.temporal.getState().undo());assert.equal(await page.evaluate(()=>!!window.dropProject.getState().project.video),false);await page.evaluate(()=>window.dropProject.temporal.getState().redo());assert.equal(await page.evaluate(()=>window.dropProject.getState().project.video.clips.length),1);
 console.log(JSON.stringify({...result,nativeBridge:'mocked; synthetic media',dropFromSFX:'passed',linkedAudioVideo:'passed',playClock:'passed',undoRedo:'passed'}));
}finally{await browser.close();rmSync(fixture,{recursive:true,force:true});}
