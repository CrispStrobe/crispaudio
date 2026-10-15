import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=await realpath(await mkdtemp(join(tmpdir(),'crispaudio-native-validation-')));
const helper=process.env.CRISPAUDIO_TEST_VST3_HELPER||'/tmp/source-stack-vst3-helper',auHelper=process.env.CRISPAUDIO_TEST_MEDIA_HELPER||'/tmp/source-stack-media-helper',folder=process.env.CRISPAUDIO_TEST_PLUGIN_FOLDER||'/tmp/crispaudio-vst3-fixture/VST3/Release';
const plugins=JSON.parse(execFileSync(helper,['plugin-scan',JSON.stringify({path:join(folder,'ADelay.vst3')})])),vst=plugins.find(p=>p.name==='ADelay'),au=JSON.parse(execFileSync(auHelper,['plugin-scan','{}'])).find(p=>p.name==='AUBandpass');assert.ok(vst);assert.ok(au);
await writeFile(join(root,'index.html'),`<!doctype html><html><head><meta charset="UTF-8"><title>Native validation</title></head><body><p>Silent native audio validation is running.</p><script type="module" src="${join(repo,'scripts/fixtures/nativeValidation.ts')}"></script></body></html>`);
execFileSync(process.execPath,[join(repo,'node_modules/typescript/bin/tsc'),'-p',join(repo,'scripts/fixtures/tsconfig.json')],{stdio:'inherit'});
await build({root,configFile:false,base:'./',build:{outDir:join(root,'dist'),emptyOutDir:true}});
const config=JSON.parse(await readFile(join(repo,'src-tauri/tauri.conf.json'),'utf8'));config.identifier='com.crispstrobe.crispaudio.native-validation';config.productName='CrispAudio Native Validation';config.app.windows=[];config.build.frontendDist=join(root,'dist');
const transport=process.env.CRISPAUDIO_NATIVE_VALIDATION_TRANSPORT||'ipc';assert.ok(['ipc','capabilities','shared-http'].includes(transport));
if(process.env.CRISPAUDIO_NATIVE_VALIDATION_ISOLATED==='1'||transport==='shared-http')config.app.security.headers={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'};
let frontendServer;
if(process.env.CRISPAUDIO_NATIVE_VALIDATION_HTTP_FRONTEND==='1'||transport==='shared-http'){
 const assets=join(root,'dist');
 frontendServer=createServer(async(request,response)=>{
  try{
   if(request.method!=='GET'||request.headers.host!==`127.0.0.1:${frontendServer.address().port}`){response.writeHead(403).end();return;}
   const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname),file=resolve(assets,'.'+(pathname==='/'?'/index.html':pathname));
   if(!file.startsWith(assets+'/')){response.writeHead(403).end();return;}
   const bytes=await readFile(file),type=file.endsWith('.js')?'application/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.html')?'text/html':'application/octet-stream';
   response.writeHead(200,{'Content-Type':type,'Content-Security-Policy':config.app.security.csp,...(config.app.security.headers||{})});response.end(bytes);
  }catch{response.writeHead(404).end();}
 });
 await new Promise((resolve,reject)=>{frontendServer.once('error',reject);frontendServer.listen(0,'127.0.0.1',resolve);});frontendServer.unref();
 config.build.frontendDist=`http://127.0.0.1:${frontendServer.address().port}`;
}
if(transport==='shared-http')config.app.security.csp=config.app.security.csp.replace("connect-src 'self'","connect-src 'self' http://127.0.0.1:*");
const modes=(process.env.CRISPAUDIO_NATIVE_VALIDATION_MODES||'foreground,hidden,load').split(',');assert.ok(modes.length&&modes.every(mode=>['foreground','hidden','load'].includes(mode)));
const loadWorkMs=Number(process.env.CRISPAUDIO_NATIVE_VALIDATION_LOAD_MS||8);assert.ok(Number.isFinite(loadWorkMs)&&loadWorkMs>=0&&loadWorkMs<=250);
const chainLength=Number(process.env.CRISPAUDIO_NATIVE_VALIDATION_CHAIN_LENGTH||1);assert.ok([1,4].includes(chainLength));
const workerAudioOnly=transport==='shared-http'||process.env.CRISPAUDIO_NATIVE_VALIDATION_WORKER_AUDIO_ONLY==='1';
const stallMs=Number(process.env.CRISPAUDIO_NATIVE_VALIDATION_STALL_MS||(workerAudioOnly?500:0));assert.ok(Number.isFinite(stallMs)&&stallMs>=0&&stallMs<=2000);
// Validation uses this repository's artifacts, regardless of unrelated shell defaults.
const target=join(repo,'src-tauri/target');
const env={...process.env,TAURI_CONFIG:JSON.stringify(config),CRISPAUDIO_NATIVE_VALIDATION_OPTIONS:JSON.stringify({vst:vst.id,au:au.id,modes,loadWorkMs,chainLength,stallMs,workerAudioOnly,transport,renderedPreview:process.env.CRISPAUDIO_NATIVE_VALIDATION_RENDERED_PREVIEW==='1',skipExports:process.env.CRISPAUDIO_NATIVE_VALIDATION_SKIP_EXPORTS==='1',workerProbe:process.env.CRISPAUDIO_NATIVE_VALIDATION_WORKER_PROBE==='1',diagnostic:process.env.CRISPAUDIO_NATIVE_VALIDATION_DIAGNOSTIC!=='0'}),CARGO_TARGET_DIR:target};
let output='',buildTail='',cutoff;const child=spawn('cargo',['run','--manifest-path',join(repo,'src-tauri/Cargo.toml'),'--bin','crispaudio-native-validation','--features','native-validation,tauri/custom-protocol','--locked'],{cwd:repo,env,detached:true,stdio:['ignore','pipe','pipe']});
function armDeadline(){
 if(cutoff)return;
 cutoff=setTimeout(()=>{
  console.error('Validation hard deadline exceeded; stopping only its owned process group');
  try{process.kill(-child.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')console.error(error);}
 },110000);
}
child.stdout.on('data',bytes=>{output+=bytes;process.stdout.write(bytes);if(output.includes('CRISPAUDIO_NATIVE_PHASE loaded'))armDeadline();});
child.stderr.on('data',bytes=>{process.stderr.write(bytes);buildTail=(buildTail+bytes).slice(-1024);if(/Running.*crispaudio-native-validation/.test(buildTail))armDeadline();});
const code=await new Promise((resolve,reject)=>{child.on('exit',code=>{clearTimeout(cutoff);resolve(code);});child.on('error',error=>{clearTimeout(cutoff);reject(error);});});

if(frontendServer)await new Promise(resolve=>frontendServer.close(resolve));
const line=output.split('\n').find(line=>line.startsWith('CRISPAUDIO_NATIVE_VALIDATION '));assert.ok(line,'No native validation report');const report=JSON.parse(line.slice('CRISPAUDIO_NATIVE_VALIDATION '.length));await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));assert.equal(code,0,JSON.stringify(report));assert.equal(report.success,true,JSON.stringify(report));if(process.env.CRISPAUDIO_NATIVE_VALIDATION_RENDERED_PREVIEW==='1'){assert.equal(report.kind,'rendered-preview');assert.equal(report.playbackNativeCalls,0);assert.equal(report.closedNativeSessions,true);console.log('Rendered preview artifacts:',root);process.exit(0);}if(transport==='capabilities'){assert.equal(report.kind,'memory-capabilities');console.log('Memory capabilities:',JSON.stringify(report.capabilities));process.exit(0);}if(workerAudioOnly){assert.equal(report.kind,transport==='shared-http'?'shared-http-audio':'worker-audio');assert.equal(report.runs.length,2);for(const run of report.runs){assert.equal(run.peaks[0].index,run.impulse+run.effectDelay);assert.equal(run.peaks[1].index,run.impulse+run.effectDelay);assert.equal(run.faults.length,0);assert.ok(run.trace.some(block=>block.acceptedFrame!==undefined),'No worker-side acceptance');}console.log('Worker audio isolation artifacts:',root);process.exit(0);}assert.deepEqual(report.results.map(r=>r.mode),modes);for(const result of report.results){assert.equal(result.peaks[2].index,result.impulse+96*chainLength);assert.ok(result.metrics.length>0&&result.metrics.length<=32,'Missing bounded backend metrics');for(const metric of result.metrics){assert.ok(typeof metric.backend.session==='string'&&metric.backend.session.length>0);for(const value of [metric.ms,metric.backend.queueMs,metric.backend.processMs,metric.outsideBackendMs])assert.ok(Number.isFinite(value)&&value>=0,'Invalid backend timing');}assert.equal(result.pausedState,'passed');assert.equal(result.restoredState,process.env.CRISPAUDIO_NATIVE_VALIDATION_SKIP_EXPORTS==='1'?'skipped':'passed');}if(process.env.CRISPAUDIO_NATIVE_VALIDATION_SKIP_EXPORTS!=='1'){assert.equal(report.offlineExport.frames,16384);assert.equal(report.offlineExport.cancellation,'passed');}console.log('Native validation artifacts:',root);
