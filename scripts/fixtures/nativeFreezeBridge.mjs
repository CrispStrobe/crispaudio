// Test-only pipe bridge to actual repo-built helpers; replaces Tauri IPC, not DSP.
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
export function nativeFreezeBridge({root,auHelper,vstHelper,ids}){
 const sessions=new Map(),children=new Set(),opened=[];let packets=0;
 class Stream{
  constructor(request){
   this.bytes=Buffer.alloc(0);this.queue=[];this.waiters=[];this.sequence=0;this.failure=null;
   const path=join(root,`request-${randomUUID()}.json`);writeFileSync(path,JSON.stringify(request));
   this.child=spawn(request.id.startsWith('vst3:')?vstHelper:auHelper,['plugin-stream',path],{stdio:['pipe','pipe','ignore']});children.add(this);
   this.exited=new Promise(resolve=>{this.child.once('exit',()=>{this.fail(new Error('Native fixture helper exited'));children.delete(this);resolve();});this.child.once('error',e=>{this.fail(e);children.delete(this);resolve();});});this.child.stdin.on('error',e=>this.fail(e));
   this.child.stdout.on('data',bytes=>{try{this.bytes=Buffer.concat([this.bytes,bytes]);while(this.bytes.length>=4){const length=this.bytes.readUInt32LE(0);if(length<1||length>1048576)throw new Error('Invalid helper metadata size');if(this.bytes.length<4+length)break;const metadata=JSON.parse(this.bytes.subarray(4,4+length));if(!Number.isSafeInteger(metadata.frames)||metadata.frames<0||metadata.frames>4096||![1,2].includes(metadata.channels))throw new Error('Invalid helper PCM shape');const size=4+length+metadata.frames*metadata.channels*4;if(this.bytes.length<size)break;const reply=Buffer.from(this.bytes.subarray(0,size));this.bytes=this.bytes.subarray(size);const waiter=this.waiters.shift();if(waiter)waiter.resolve(reply);else this.queue.push(reply);}}catch(e){this.fail(e);this.child.kill();}});
  }
  fail(e){this.failure=e;for(const waiter of this.waiters.splice(0))waiter.reject(e);}
  next(){if(this.queue.length)return Promise.resolve(this.queue.shift());if(this.failure)return Promise.reject(this.failure);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.fail(new Error('Native fixture helper deadline'));this.child.kill();},10000);this.waiters.push({resolve:reply=>{clearTimeout(timer);resolve(reply);},reject:e=>{clearTimeout(timer);reject(e);}});});}
  async exchange(kind,frames,settings,pcm=Buffer.alloc(0)){
   const json=Buffer.from(JSON.stringify(settings)),header=Buffer.alloc(16),sequence=++this.sequence;[kind,frames,sequence,json.length].forEach((v,i)=>header.writeUInt32LE(v,i*4));
   const waiting=this.next();this.child.stdin.write(Buffer.concat([header,json,pcm]));const reply=await waiting,length=reply.readUInt32LE(0),metadata=JSON.parse(reply.subarray(4,4+length));
   if(metadata.sequence!==sequence||metadata.frames!==frames||metadata.channels!==this.info.channels||metadata.sampleRate!==this.info.sampleRate)throw new Error('Native helper reply identity mismatch');packets++;return reply;
  }
  async close(){if(this.closing)return this.closing;this.closing=(async()=>{this.fail(new Error('Native fixture stream closed'));this.child.stdin.end();if(this.child.exitCode===null)this.child.kill();const timer=setTimeout(()=>this.child.kill('SIGKILL'),1000);try{await this.exited;}finally{clearTimeout(timer);}})();return this.closing;}
 }
 const native=async(command,args)=>{
  if(command==='plugin_stream_open'){
   const request=args.request;if(!ids.has(request.id)||request.processMode!=='offline')throw new Error('Only explicit offline fixture plugins are permitted');
   const stream=new Stream(request),session=randomUUID();try{const reply=await stream.next(),n=reply.readUInt32LE(0);stream.info=JSON.parse(reply.subarray(4,4+n));if(stream.info.processMode!=='offline')throw new Error('Helper did not acknowledge offline mode');sessions.set(session,stream);opened.push({format:request.id.startsWith('vst3:')?'VST3':'AU',latencySamples:stream.info.latencySamples,stateSupplied:!!request.state,parameterCount:Object.keys(request.parameters??{}).length});return {session,info:stream.info};}catch(e){await stream.close();throw e;}
  }
  if(command==='plugin_stream_close'){const stream=sessions.get(args.session);sessions.delete(args.session);await stream?.close();return;}
  if(command==='plugin_stream_process_binary'){
   const packet=Buffer.from(args,'base64'),n=packet.readUInt32LE(0),meta=JSON.parse(packet.subarray(4,4+n)),stream=sessions.get(meta.session);if(!stream)throw new Error('Unknown native fixture session');
   const reply=await stream.exchange(1,meta.frames,{parameters:meta.parameters??{},bypass:meta.bypass??false,...(meta.transport?{transport:meta.transport}:{})},packet.subarray(4+n));return reply.toString('base64');
  }
  if(command==='plugin_stream_snapshot'){
   const stream=sessions.get(args.session);if(!stream)throw new Error('Unknown native fixture session');const reply=await stream.exchange(2,0,{parameters:{},bypass:false}),n=reply.readUInt32LE(0);return {metadata:JSON.parse(reply.subarray(4,4+n)),samples:[]};
  }
  if(command==='take_opened_files')return [];if(command==='desktop_media_available')return false;if(command==='plugin:event|listen')return 1;
 };
 return {native,stats:()=>({sessions:sessions.size,children:children.size,packets,opened:[...opened]}),close:async()=>{await Promise.all([...children].map(s=>s.close()));sessions.clear();}};
}
