// Offline, deterministic quality report. Does not acquire audio hardware or fetch recordings.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const cacheDir=mkdtempSync(join(tmpdir(),'crispaudio-quality-cache-'));
const server=await createServer({configFile:false,cacheDir,optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
try{
 const {restoreSource,DEFAULT_RESTORATION}=await server.ssrLoadModule('/src/lib/sourceRestoration.ts');
 const {restorationMaterial,improvement,errorEnergy}=await server.ssrLoadModule('/tests/fixtures/restorationMaterial.ts');
 const measurements=[];
 for(const rate of [8000,44100,48000,96000,192000]){
  const clean=restorationMaterial(rate,'voice'),damaged=clean.map((v,i)=>v+.07*Math.sin(2*Math.PI*50*i/rate)+.04*Math.cos(2*Math.PI*100*i/rate));
  const result=restoreSource([damaged],[{start:0,end:clean.length}],rate,-1,{...DEFAULT_RESTORATION,harmonics:2}).channels[0],db=improvement(damaged,result,clean,rate/2,rate*2.5);
  assert.ok(db>22);measurements.push({tool:'dehum',material:'voice-like envelopes and changing pitch',rate,interiorErrorImprovementDb:db});
 }
 for(const kind of ['voice','percussion','chirp']){
  const rate=48000,clean=restorationMaterial(rate,kind),damaged=clean.map((v,i)=>v+.07*Math.sin(2*Math.PI*3500*i/rate)),range={start:24000,end:120000},settings={...DEFAULT_RESTORATION,kind:'spectral',low:3000,high:4000,reduction:24};
  const processed=restoreSource([damaged],[range],rate,-1,settings).channels[0],cleanProcessed=restoreSource([clean],[range],rate,-1,settings).channels[0],db=improvement(damaged,processed,clean,range.start+2400,range.end-2400),relative=errorEnergy(cleanProcessed,clean)/errorEnergy(clean,new Float32Array(clean.length));
  assert.ok(db>(kind==='percussion'?8:18));assert.ok(relative<(kind==='percussion'?.08:.008));measurements.push({tool:'spectral',material:kind,rate,interiorErrorImprovementDb:db,cleanSignalRelativeErrorEnergy:relative});
  const ceiling=.16,clipped=clean.map(v=>Math.max(-ceiling,Math.min(ceiling,v))),reconstructed=restoreSource([clipped],[{start:0,end:clean.length}],rate,-1,{...DEFAULT_RESTORATION,kind:'declip',ceiling:20*Math.log10(ceiling)}),clipDb=improvement(clipped,reconstructed.channels[0],clean);
  assert.ok(clipDb>0);measurements.push({tool:'declip',material:kind,rate,errorImprovementDb:clipDb,repaired:reconstructed.repaired,skipped:reconstructed.skipped});
 }
 console.log(JSON.stringify({scope:'Original deterministic synthetic signals, not real speech/instrument recordings or listening acceptance. DSP unchanged by this qualification.',command:'node scripts/qualify-source-restoration.mjs',measurements},null,2));
}finally{await server.close();rmSync(cacheDir,{recursive:true,force:true});}
