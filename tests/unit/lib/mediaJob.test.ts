import {afterEach,it,expect,vi} from 'vitest';
import {invoke} from '@tauri-apps/api/core';
import {mediaJob} from '../../../src/lib/mediaJob';
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn()}));
afterEach(()=>vi.resetAllMocks());
it('discards a successful late result after cancellation and joins its cleanup',async()=>{
 let done!:(v:{path:string})=>void,clean! :()=>void;const controller=new AbortController(),discard=vi.fn(()=>new Promise<void>(r=>{clean=r;}));
 vi.mocked(invoke).mockImplementation(command=>command==='cancel_media_job'?Promise.resolve(true):new Promise(r=>{done=r;}));
 let settled=false;const job=mediaJob('render',{},controller.signal,discard).finally(()=>{settled=true;});const rejected=expect(job).rejects.toMatchObject({name:'AbortError'});
 controller.abort();done({path:'owned'});await vi.waitFor(()=>expect(discard).toHaveBeenCalledWith({path:'owned'}));expect(settled).toBe(false);clean();await rejected;
});
it('does not discard an ordinary successful result',async()=>{
 vi.mocked(invoke).mockResolvedValue({path:'owned'});const discard=vi.fn();expect(await mediaJob('render',{},new AbortController().signal,discard)).toEqual({path:'owned'});expect(discard).not.toHaveBeenCalled();
});
