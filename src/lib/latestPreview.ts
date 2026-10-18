/** One in-flight task and one debounced replacement. Aborting a task need not stop its CPU work. */
export class LatestPreview<Request,Result> {
 private version=0;
 private closed=false;
 private timer?:ReturnType<typeof setTimeout>;
 private pending?:{request:Request;version:number};
 private active?:{controller:AbortController;done:Promise<void>};
 private render:(request:Request,signal:AbortSignal)=>Promise<Result>;
 private publish:(request:Request,result:Result)=>void;
 private failed:(request:Request,error:unknown)=>void;
 constructor(render:(request:Request,signal:AbortSignal)=>Promise<Result>,publish:(request:Request,result:Result)=>void,failed:(request:Request,error:unknown)=>void){this.render=render;this.publish=publish;this.failed=failed;}
 schedule(request:Request,delay=150){
  this.cancel();if(this.closed)return;
  const version=this.version;
  this.timer=setTimeout(()=>{this.timer=undefined;if(this.closed||version!==this.version)return;this.pending={request,version};this.start();},delay);
 }
 cancel(){this.version++;clearTimeout(this.timer);this.timer=undefined;this.pending=undefined;this.active?.controller.abort();}
 /** Wait for actual settlement before allocating another graph (including an explicit Prepare). */
 async cancelAndWait(){this.cancel();await this.active?.done;}
 close(){this.closed=true;this.cancel();}
 private start(){
  if(this.closed||this.active||!this.pending)return;
  const {request,version}=this.pending;this.pending=undefined;
  const controller=new AbortController();
  // Defer invocation until active is assigned, including synchronous throws and reentrant cancellation.
  const done=Promise.resolve().then(()=>{controller.signal.throwIfAborted();return this.render(request,controller.signal);}).then(result=>{
   if(!this.closed&&!controller.signal.aborted&&version===this.version)this.publish(request,result);
  },error=>{if(!this.closed&&!controller.signal.aborted&&version===this.version)this.failed(request,error);}).finally(()=>{if(this.active?.controller===controller)this.active=undefined;this.start();});
  this.active={controller,done};
 }
}
