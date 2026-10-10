// Verify the bundled worklet loads and limits immediately in a served dist build.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href:'playwright');
const browser=process.env.CRISPAUDIO_WEBKIT_EXECUTABLE?await webkit.launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE}):await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE});
try {
 const page=await browser.newPage();await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5191');
 const asset=fs.readdirSync('dist/assets').find(name=>name.startsWith('limiterProcessor-')&&name.endsWith('.js'));assert.ok(asset);
 const result=await page.evaluate(async asset=>{
  const ctx=new OfflineAudioContext(2,4800,48000);await ctx.audioWorklet.addModule(`/assets/${asset}`);
  const limiter=new AudioWorkletNode(ctx,'crispaudio-output-limiter',{outputChannelCount:[2],parameterData:{ceiling:-6,release:.1}});
  const source=ctx.createBufferSource(),buffer=ctx.createBuffer(2,4800,48000);buffer.getChannelData(0).fill(4);buffer.getChannelData(1).fill(-1);source.buffer=buffer;source.connect(limiter).connect(ctx.destination);source.start();
  const output=await ctx.startRendering();return {first:output.getChannelData(0)[0],peak:Math.max(...output.getChannelData(0)),right:output.getChannelData(1)[0]};
 },asset);
 assert.ok(Math.abs(result.first-10**(-6/20))<1e-7);assert.ok(result.peak<=10**(-6/20)+1e-7);assert.equal(result.first,-4*result.right);console.log(JSON.stringify({bundledWorklet:'passed',...result}));
}finally{await browser.close();}
