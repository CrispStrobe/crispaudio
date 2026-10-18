import {it,expect,vi} from 'vitest';
import {NativeSourceOwner} from '../../../src/audio/engine/NativeSourceOwner';
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}

it('revokes a preparing source synchronously and joins it before granting replacement readiness',async()=>{
 const owner=new NativeSourceOwner(),closed=deferred(),close=vi.fn(()=>closed.promise);
 const a=owner.reserve(close);await a.ready;
 const b=owner.reserve(vi.fn(async()=>{}));let ready=false;void b.ready.then(()=>{ready=true;});
 expect(a.isCurrent()).toBe(false);expect(b.isCurrent()).toBe(true);expect(close).toHaveBeenCalledOnce();
 await Promise.resolve();expect(ready).toBe(false);closed.resolve();await b.ready;expect(ready).toBe(true);
 await owner.stop();expect(b.isCurrent()).toBe(false);
});
it('retains detached cleanup and every replacement join across repeated Stop calls',async()=>{
 const owner=new NativeSourceOwner(),a=deferred(),b=deferred();
 const first=owner.reserve(()=>a.promise);first.release(a.promise);
 const second=owner.reserve(()=>b.promise);const stopped=owner.stop();
 expect(second.isCurrent()).toBe(false);let joined=false;void owner.stop().then(()=>{joined=true;});
 a.resolve();await Promise.resolve();expect(joined).toBe(false);b.resolve();await stopped;await owner.stop();expect(joined).toBe(true);
});
it('ignores stale releases for current ownership while retaining their close barrier',async()=>{
 const owner=new NativeSourceOwner(),old=deferred();
 const a=owner.reserve(()=>old.promise),b=owner.reserve(async()=>{});
 a.release(old.promise);expect(b.isCurrent()).toBe(true);old.resolve();await b.ready;await owner.stop();
});
it('handles a close that releases its own lease without recursion or a self-wait',async()=>{
 const owner=new NativeSourceOwner(),closed=deferred();
 const a=owner.reserve(()=>{a.release(closed.promise);return closed.promise;});
 const stop=owner.stop();closed.resolve();await stop;await owner.stop();expect(a.isCurrent()).toBe(false);
});
it('fails closed when output cleanup rejects, including a synchronous close exception',async()=>{
 for(const synchronous of [false,true]){
  const owner=new NativeSourceOwner(),error=new Error('output not joined');
  owner.reserve(()=>{if(synchronous)throw error;return Promise.reject(error);});
  await expect(owner.stop()).rejects.toBe(error);
  const replacement=owner.reserve(async()=>{});await expect(replacement.ready).rejects.toBe(error);await expect(owner.stop()).rejects.toBe(error);
 }
});
