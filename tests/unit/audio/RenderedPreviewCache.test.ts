import {it,expect,vi} from 'vitest';
import {RenderedPreviewCache,renderedPreviewKey} from '../../../src/audio/plugins/RenderedPreviewCache';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {AudioSource} from '../../../src/types/audio';
const project=()=>({...useProjectStore.getInitialState().project,duration:1,sampleRate:48000,tracks:[]});
const buffer=()=>({numberOfChannels:2,length:48000,sampleRate:48000,duration:1} as AudioBuffer);
it('reuses one mix for view/range edits, invalidating for baked audio decisions and replacement media',async()=>{
 const render=vi.fn(async()=>buffer()),cache=new RenderedPreviewCache(render),p=project(),source={id:'s',buffer:buffer()} as AudioSource,sources=new Map([['s',source]]);
 const result=await cache.prepare(p,sources,new AbortController().signal);
 expect(cache.get({...p,name:'Renamed',editRange:{start:.1,end:.4}},sources)).toBe(result);
 for(const changed of [{...p,masterVolume:.5},{...p,masterEffects:[{type:'lowpass' as const,enabled:true,params:{freq:50}}]},{...p,outputLimiter:{enabled:true,ceiling:-1,release:.1}}])expect(renderedPreviewKey(changed)).not.toBe(renderedPreviewKey(p));
 source.buffer=buffer();expect(cache.get(p,sources)).toBeUndefined();
 expect(render).toHaveBeenCalledOnce();
});
it('rejects late cancelled audio and serializes the next render until earlier native cleanup finishes',async()=>{
 let release!:(value:AudioBuffer)=>void;const render=vi.fn().mockImplementationOnce(()=>new Promise<AudioBuffer>(resolve=>{release=resolve;})).mockResolvedValue(buffer()),cache=new RenderedPreviewCache(render),first=cache.prepare(project(),new Map(),new AbortController().signal),rejected=expect(first).rejects.toMatchObject({name:'AbortError'});
 await vi.waitFor(()=>expect(render).toHaveBeenCalledOnce());
 const changed={...project(),masterVolume:.2},second=cache.prepare(changed,new Map(),new AbortController().signal);
 await Promise.resolve();expect(render).toHaveBeenCalledOnce();release(buffer());await rejected;await second;
 expect(cache.get(project(),new Map())).toBeUndefined();expect(cache.get(changed,new Map())).toBeDefined();expect(render).toHaveBeenCalledTimes(2);
});
it('snapshots rack parameters and stops a render cancelled by its caller',async()=>{
 let release!:(value:AudioBuffer)=>void;const render=vi.fn(()=>new Promise<AudioBuffer>(resolve=>{release=resolve;})),cache=new RenderedPreviewCache(render),p=project(),controller=new AbortController();
 const task=cache.prepare(p,new Map(),controller.signal),rejected=expect(task).rejects.toMatchObject({name:'AbortError'});
 p.masterVolume=0;await vi.waitFor(()=>expect(render).toHaveBeenCalledOnce());expect(render.mock.calls[0][0].masterVolume).not.toBe(0);
 controller.abort();release(buffer());await rejected;expect(cache.get(p,new Map())).toBeUndefined();
});
