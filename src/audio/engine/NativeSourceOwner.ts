export interface NativeSourceLease {
 readonly ready:Promise<void>;
 isCurrent():boolean;
 release(closing:Promise<void>):void;
}

/** Source previews reserve ownership before upload, not after audio starts.
 * Revocation is synchronous; consumers await the retained close/join barrier
 * before opening another output or microphone. No device APIs live here. */
export class NativeSourceOwner {
 private owner?:{close:()=>Promise<void>};
 private closing:Promise<void>=Promise.resolve();
 private retain(task:Promise<void>){
  this.closing=Promise.all([this.closing,task]).then(()=>{});
  // Preserve rejection for the next consumer without an unhandled background
  // rejection when unmount/Stop releases an owner without awaiting it.
  void this.closing.catch(()=>{});
  return this.closing;
 }
 reserve(close:()=>Promise<void>):NativeSourceLease {
  const ready=this.stop(),owner={close};this.owner=owner;
  return {ready,isCurrent:()=>this.owner===owner,release:closing=>{
   if(this.owner===owner)this.owner=undefined;
   this.retain(closing);
  }};
 }
 stop():Promise<void>{
  const owner=this.owner;this.owner=undefined;
  if(owner){
   try{return this.retain(owner.close());}
   catch(error){return this.retain(Promise.reject(error));}
  }
  return this.closing;
 }
}

export const nativeSourceOwner=new NativeSourceOwner();
