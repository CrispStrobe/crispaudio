// Abrupt chorus ends: retain the 1e-4 budget and report proven baseline limits.
// An explicit baseline CLI permits known-limit reporting, never a parity pass.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const cli=process.env.CRISPAUDIO_TEST_CLI;
assert.ok(cli,'Set CRISPAUDIO_TEST_CLI');
const {chromium,webkit}=await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href:'playwright');
const browser=await (process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?webkit:chromium).launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE||process.env.CRISPAUDIO_CHROME_EXECUTABLE});
const temp=await mkdtemp(join(tmpdir(),'crispaudio-chorus-tail-'));
const frames=48000*8,endFrame=355200;
const data=Buffer.alloc(frames*8);
for(let i=0;i<frames;i++)for(let ch=0;ch<2;ch++)data.writeFloatLE((ch===0?.25:-.125)*Math.sin(2*Math.PI*43*i/48000),(i*2+ch)*4);
const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+data.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(3,20);header.writeUInt16LE(2,22);header.writeUInt32LE(48000,24);header.writeUInt32LE(384000,28);header.writeUInt16LE(8,32);header.writeUInt16LE(32,34);header.write('data',36);header.writeUInt32LE(data.length,40);
const source=join(temp,'source.wav');await writeFile(source,Buffer.concat([header,data]));
function pcm(bytes){for(let off=12;off+8<=bytes.length;){const length=bytes.readUInt32LE(off+4);if(bytes.toString('ascii',off,off+4)==='data')return bytes.subarray(off+8,off+8+length);off+=8+length+length%2;}throw new Error('Missing PCM');}
const results=[],knownTailLimits=[];
try{
 const page=await browser.newPage();await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5190');await page.waitForLoadState('networkidle');
 for(const rack of ['track','clip','master']){
  const fx={type:'chorus',enabled:true,params:{rate:1.5,depth:.5,mix:.3}},clip={id:'c',trackId:'t',sourceId:'s',name:'Tone',startTime:.4,sourceOffset:.3,duration:7,gain:1,effects:rack==='clip'?[fx]:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'};
  const project={id:'p',name:'Abrupt chorus tail baseline',sampleRate:48000,duration:8,minimumDuration:8,masterEffects:rack==='master'?[fx]:[],tracks:[{id:'t',name:'Tone',volume:1,pan:0,muted:false,solo:false,effects:rack==='track'?[fx]:[],segments:[clip]}]};
  const input=join(temp,`${rack}.crispaudio`),output=join(temp,`${rack}.wav`);await writeFile(input,JSON.stringify({format:'crispaudio-project',version:3,project,sources:[{id:'s',path:source,duration:8,sampleRate:48000,channels:2}]}));execFileSync(cli,['render-project','--input',input,'--output',output,'--backend','apple']);const bytes=await readFile(output),native=pcm(bytes);
  const gui=await page.evaluate(async project=>{const {TimelineEngine}=await import('/src/audio/engine/TimelineEngine.ts');const ctx=new AudioContext({sampleRate:48000}),engine=new TimelineEngine(ctx),buffer=ctx.createBuffer(2,48000*8,48000);for(let ch=0;ch<2;ch++)for(let i=0;i<buffer.length;i++)buffer.getChannelData(ch)[i]=(ch===0?.25:-.125)*Math.sin(2*Math.PI*43*i/48000);engine.setSources(new Map([['s',{id:'s',buffer}]]));const full=await engine.renderToBuffer(project);await ctx.close();return Array.from({length:full.length*2},(_,i)=>full.getChannelData(i%2)[Math.floor(i/2)]);},project);
  assert.equal(native.length,gui.length*4);let activeError=0,activeSum=0,sum=0,maximumError=0,worst=-1;
  for(let i=0;i<gui.length;i++){const difference=Math.abs(gui[i]-native.readFloatLE(i*4));sum+=difference*difference;if(i<endFrame*2){activeError=Math.max(activeError,difference);activeSum+=difference*difference;}if(difference>maximumError){maximumError=difference;worst=Math.floor(i/2);}}
  const activeRms=Math.sqrt(activeSum/(endFrame*2));assert.ok(activeError<1e-4&&activeRms<1e-5,`${rack} active chorus PCM ${activeError}`);
  const rms=Math.sqrt(sum/gui.length);if(maximumError>=1e-4||rms>=1e-5){
   assert.ok(process.env.CRISPAUDIO_BASELINE_CLI,`${rack} abrupt tail FAILS 1e-4: ${maximumError}; set an explicit baseline only to prove/report an inherited limit`);
   const baseline=join(temp,`${rack}-baseline.wav`);execFileSync(process.env.CRISPAUDIO_BASELINE_CLI,['render-project','--input',input,'--output',baseline,'--backend','apple']);assert.deepEqual(bytes,await readFile(baseline),'Static native tail changed from explicit baseline');assert.ok(worst>=endFrame,'Mismatch preceded the abrupt clip end');knownTailLimits.push({rack,maximumError,worstFrame:worst,staticNativeByteIdentical:true});
  }
  results.push({rack,activeError,activeRms,maximumError,rms});
 }
 console.log(JSON.stringify({results,knownTailLimits,budget:{peak:1e-4,rms:1e-5},abruptEndFrame:endFrame,temp}));
}finally{await browser.close();}
