// Isolated Rust test binary, never the installed app. No Tauri/device fallback.
import {spawn,execFileSync} from 'node:child_process';
export function verifyNativeSourceBridge(binary){
 if(!binary)throw new Error('Explicit null driver required');
 const symbols=execFileSync('nm',['-gU',binary],{encoding:'utf8',timeout:10000,maxBuffer:16*1024*1024}),defined=new Set(symbols.split('\n').map(line=>line.trim().split(/\s+/)).filter(parts=>parts[1]==='T').map(parts=>parts[2]));
 for(const name of ['AudioQueueNewOutput','AudioQueueNewInput','AudioObjectGetPropertyDataSize','AudioObjectGetPropertyData'])if(!defined.has('_'+name))throw new Error(`Null driver lacks linked hardware guard: ${name}`);
}
export function nativeSourceBridge({binary,ids,env={}}){
 if(!binary||!ids?.length)throw new Error('Explicit null driver and trusted fixture IDs required');
 verifyNativeSourceBridge(binary);
 const child=spawn(binary,['bridge::source_bridge_server','--exact','--ignored','--nocapture','--test-threads=1'],{detached:true,stdio:['pipe','pipe','pipe'],env:{...process.env,...env,CRISPAUDIO_SOURCE_BRIDGE:'1',CRISPAUDIO_SOURCE_BRIDGE_PLUGIN_IDS:JSON.stringify(ids)}});
 let sequence=0,buffer='',stderr='',failed,finalStats,closed=false;const pending=new Map(),commands=new Map();
 const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{/* Already reaped. */}};
 const fail=error=>{failed??=error;for(const task of pending.values()){clearTimeout(task.timer);task.reject(error);}pending.clear();};
 const exited=new Promise(resolve=>child.once('close',(code,signal)=>{closed=true;fail(new Error(`Null driver closed (${code??signal}): ${stderr}`));resolve({code,signal});}));
 child.on('error',fail);child.stdin.on('error',fail);
 child.stderr.on('data',bytes=>{stderr=(stderr+bytes).slice(-16384);});
 child.stdout.setEncoding('utf8');child.stdout.on('data',part=>{
  buffer+=part;if(buffer.length>2*1024*1024){fail(new Error('Null driver response exceeds limit'));kill();return;}
  let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);const finalMarker=line.indexOf('SOURCE_BRIDGE_FINAL ');if(finalMarker>=0){try{finalStats=JSON.parse(line.slice(finalMarker+20));}catch(error){fail(error);kill();}continue;}const marker=line.indexOf('SOURCE_BRIDGE ');if(marker<0)continue;
   try{const response=JSON.parse(line.slice(marker+14)),task=pending.get(response.id);if(!task)throw new Error('Unknown null driver response');pending.delete(response.id);clearTimeout(task.timer);if(response.error)task.reject(new Error(response.error));else task.resolve(response.value);}catch(error){fail(error);kill();}
  }
 });
 const native=(command,args={})=>{
  if(failed)return Promise.reject(failed);commands.set(command,(commands.get(command)??0)+1);
  // Test wire only. The frontend still builds the production CPS1 binary packet.
  if(command==='native_snapshot_write')args=Array.from(new Uint8Array(args));
  const id=++sequence,line=JSON.stringify({id,command,args})+'\n';if(Buffer.byteLength(line)>2*1024*1024)return Promise.reject(new Error('Null driver request exceeds limit'));
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{fail(new Error(`Null driver deadline: ${command}`));kill();},15000);pending.set(id,{resolve,reject,timer});child.stdin.write(line,error=>{if(error)fail(error);});});
 };
 return {native,commands:()=>Object.fromEntries(commands),async close(){
  if(!closed)child.stdin.end();let timer;const result=await Promise.race([exited,new Promise(resolve=>{timer=setTimeout(()=>{kill();resolve(null);},5000);})]);clearTimeout(timer);
  const final=result??await exited;if(final.code!==0)throw new Error(`Null driver failed (${final.code??final.signal}): ${stderr}`);if(!finalStats||finalStats.sessions||finalStats.snapshots||finalStats.bytes||finalStats.started!==finalStats.closed)throw new Error('Null driver did not join/release on EOF');return finalStats;
 }};
}
