import {beforeEach,it,expect,vi} from 'vitest';
import {NativePlaybackController,nativeLiveStructureKey} from '../../../src/audio/plugins/NativePlaybackController';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {NativePlaybackStatus} from '../../../src/audio/plugins/NativeTimelinePlayback';
const {create}=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('../../../src/audio/plugins/NativeTimelineSnapshot',()=>({NativeTimelineSnapshot:{create}}));
const project=()=>({...useProjectStore.getInitialState().project,duration:4,sampleRate:48000,nativeEffects:[{instanceId:'n',pluginId:'vst3:delay',name:'Delay',format:'VST3' as const,enabled:true,bypass:false,parameters:{'1':.2},state:'saved'}]});
const sources=new Map();
function session(){let status:NativePlaybackStatus={phase:'playing',frame:24000,clockTimeMs:0,renderedFrames:512,callbacks:2,fault:0,peaks:[0,0],appliedRevision:0};const playback={status:vi.fn(async()=>status),pause:vi.fn(async(paused=true)=>{status={...status,phase:paused?'paused':'playing'};}),update:vi.fn(async()=>1)},snapshot={startPlayback:vi.fn(async()=>playback),close:vi.fn(async()=>{})};return {playback,snapshot};}
beforeEach(()=>{create.mockReset();});
it('retains the same DSP session on pause/resume and keeps fader changes out of topology',async()=>{
 const f=session();create.mockResolvedValue(f.snapshot);const controller=new NativePlaybackController(()=>{},()=>{}),p=project();
 await controller.play(p,sources,.5,0,4,true);await controller.pause();expect(controller.clock()).toBe(.5);
 const changed={...p,masterVolume:.3,nativeEffects:p.nativeEffects.map(effect=>({...effect,bypass:true,parameters:{'1':.4}}))};
 expect(nativeLiveStructureKey(changed)).toBe(nativeLiveStructureKey(p));await controller.update(changed);await controller.play(changed,sources,.5,0,4,true);
 expect(create).toHaveBeenCalledTimes(1);expect(f.playback.pause.mock.calls).toEqual([[],[false]]);expect(f.playback.update).toHaveBeenCalledWith(changed);await controller.stop();expect(f.snapshot.close).toHaveBeenCalledTimes(1);
});
it('waits for a cancelled upload reservation before starting its replacement',async()=>{
 const a=session(),b=session();let release!:(snapshot:typeof a.snapshot)=>void;create.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValueOnce(b.snapshot);
 const controller=new NativePlaybackController(()=>{},()=>{}),first=controller.play(project(),sources,0,0,4,false),rejected=expect(first).rejects.toMatchObject({name:'AbortError'});
 await vi.waitFor(()=>expect(create).toHaveBeenCalledTimes(1));const second=controller.play(project(),sources,1,0,4,false);await Promise.resolve();expect(create).toHaveBeenCalledTimes(1);
 release(a.snapshot);await rejected;await second;expect(a.snapshot.startPlayback).not.toHaveBeenCalled();expect(a.snapshot.close).toHaveBeenCalledTimes(1);expect(create).toHaveBeenCalledTimes(2);await controller.stop();
});
it('ignores a late status failure after Stop and never faults a replacement session',async()=>{
 const f=session();create.mockResolvedValue(f.snapshot);const fault=vi.fn(),controller=new NativePlaybackController(()=>{},fault);await controller.play(project(),sources,0,0,4,false);
 let reject!:(error:Error)=>void;f.playback.status.mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail;}));const polling=controller.poll();await controller.stop();reject(new Error('closed old session'));await expect(polling).resolves.toBeUndefined();expect(fault).not.toHaveBeenCalled();expect(controller.active).toBe(false);
});
