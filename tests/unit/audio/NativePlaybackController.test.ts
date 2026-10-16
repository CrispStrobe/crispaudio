import {beforeEach,it,expect,vi} from 'vitest';
import {TimelineEngine} from '../../../src/audio/engine/TimelineEngine';
import {NativePlaybackController,nativeLiveStructureKey} from '../../../src/audio/plugins/NativePlaybackController';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {TimelineProject} from '../../../src/types/audio';
import type {NativePlaybackStatus} from '../../../src/audio/plugins/NativeTimelinePlayback';
const {create}=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('../../../src/audio/plugins/NativeTimelineSnapshot',()=>({NativeTimelineSnapshot:{create}}));
const project=()=>({...useProjectStore.getInitialState().project,duration:4,sampleRate:48000,nativeEffects:[{instanceId:'n',pluginId:'vst3:delay',name:'Delay',format:'VST3' as const,enabled:true,bypass:false,parameters:{'1':.2},state:'saved'}]});
const sources=new Map();
function session(){let status:NativePlaybackStatus={phase:'playing',frame:24000,clockTimeMs:0,renderedFrames:512,callbacks:2,fault:0,peaks:[0,0],appliedRevision:0};const playback={status:vi.fn(async()=>status),pause:vi.fn(async(paused=true)=>{status={...status,phase:paused?'paused':'playing'};}),update:vi.fn<(_:TimelineProject)=>Promise<number>>().mockResolvedValue(1)},snapshot={startPlayback:vi.fn(async()=>playback),close:vi.fn(async()=>{})};return {playback,snapshot};}
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
function mixProject(){return {...project(),tracks:[{id:'a',name:'Track',volume:.7,pan:.1,muted:false,solo:false,segments:[],automation:[{time:0,value:1},{time:3,value:.5}],panAutomation:[{time:0,value:0},{time:3,value:-.5}]}]};}
it('auditions gain and pan independently without changing the project, native state or session',async()=>{
 const f=session();create.mockResolvedValue(f.snapshot);const controller=new NativePlaybackController(()=>{},()=>{}),p=mixProject(),original=structuredClone(p);
 await controller.play(p,sources,0,0,4,false);
 expect(controller.previewAutomation(p,{trackId:'a',parameter:'gain'},.25)).toBe(true);await vi.waitFor(()=>expect(f.playback.update).toHaveBeenCalledTimes(1));
 expect(f.playback.update.mock.calls.at(-1)?.[0].tracks[0]).toMatchObject({volume:.7,automation:[{time:0,value:.25}],panAutomation:p.tracks[0].panAutomation});
 controller.previewAutomation(p,{trackId:'a',parameter:'pan'},1);await controller.update({...p,masterVolume:.4});
 expect(f.playback.update.mock.calls.at(-1)?.[0]).toMatchObject({masterVolume:.4,tracks:[{automation:[{time:0,value:.25}],panAutomation:[{time:0,value:1}]}]});
 controller.previewAutomation(p,{trackId:'a',parameter:'gain'});await controller.update(p);
 expect(f.playback.update.mock.calls.at(-1)?.[0].tracks[0]).toMatchObject({automation:p.tracks[0].automation,panAutomation:[{time:0,value:1}]});
 controller.previewAutomation(p,{trackId:'a',parameter:'pan'});await controller.update(p);expect(f.playback.update).toHaveBeenLastCalledWith(p);
 expect(p).toEqual(original);expect(create).toHaveBeenCalledTimes(1);expect(controller.clock()).toBe(.5);await controller.stop();
});
it('rejects unavailable or invalid audition and clears held controls before a replacement session',async()=>{
 const f=session(),next=session();create.mockResolvedValueOnce(f.snapshot).mockResolvedValueOnce(next.snapshot);const controller=new NativePlaybackController(()=>{},()=>{}),p=mixProject(),target={trackId:'a',parameter:'gain' as const};
 expect(controller.previewAutomation(p,target,.2)).toBe(false);await controller.play(p,sources,0,0,4,false);
 for(const value of [-1,NaN,Infinity,5])expect(controller.previewAutomation(p,target,value)).toBe(false);
 expect(controller.previewAutomation(p,{trackId:'a',parameter:'mix',effectIndex:0},.2)).toBe(false);expect(controller.previewAutomation(p,{trackId:'missing',parameter:'gain'},.2)).toBe(false);expect(f.playback.update).not.toHaveBeenCalled();
 controller.previewAutomation(p,target,.2);await controller.update(p);await controller.stop();await controller.play(p,sources,0,0,4,false);await controller.update(p);expect(next.playback.update).toHaveBeenLastCalledWith(p);await controller.stop();
});
it('stops a failed native audition and reports the fault once',async()=>{
 const f=session();create.mockResolvedValue(f.snapshot);const fault=vi.fn(),controller=new NativePlaybackController(()=>{},fault),p=mixProject();await controller.play(p,sources,0,0,4,false);
 let fail!:(reason:Error)=>void;f.playback.update.mockImplementationOnce(()=>new Promise<number>((_,reject)=>{fail=reject;}));
 controller.previewAutomation(p,{trackId:'a',parameter:'gain'},.2);controller.previewAutomation(p,{trackId:'a',parameter:'gain'},.3);fail(new Error('native update failed'));
 await vi.waitFor(()=>expect(fault).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({message:'native update failed'})));expect(controller.active).toBe(false);expect(f.snapshot.close).toHaveBeenCalledTimes(1);
});

it('waits for the native clock before a pass starts and auditions through the running graph',async()=>{
 const f=session();let release!:(snapshot:typeof f.snapshot)=>void;create.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const engine=new TimelineEngine({currentTime:10,sampleRate:48000} as unknown as AudioContext,{gain:{value:1}} as GainNode),p=mixProject(),target={trackId:'a',parameter:'gain' as const};
 const opening=engine.playNativeOwned(p,sources,.5,0,4,false,vi.fn());await vi.waitFor(()=>expect(create).toHaveBeenCalledTimes(1));
 expect(engine.automationClock()).toBeUndefined();expect(engine.previewAutomation(p,target,.2)).toBe(false);release(f.snapshot);await opening;
 expect(engine.automationClock()).toMatchObject({time:.5,start:.5});expect(engine.previewAutomation(p,target,.2)).toBe(true);await vi.waitFor(()=>expect(f.playback.update).toHaveBeenCalledTimes(1));expect(f.playback.update.mock.calls[0][0].tracks[0].automation).toEqual([{time:0,value:.2}]);
 expect(engine.previewAutomation(p,{trackId:'a',parameter:'mix',effectIndex:0},.2)).toBe(false);expect(engine.previewAutomation(p,target)).toBe(true);await vi.waitFor(()=>expect(f.playback.update).toHaveBeenLastCalledWith(p));await engine.closeNativeOwned();
});

it('holds track effect mix independently, restores Read and keeps only mix envelopes out of topology',async()=>{
 const f=session();create.mockResolvedValue(f.snapshot);const controller=new NativePlaybackController(()=>{},()=>{});
 const p={...mixProject(),tracks:mixProject().tracks.map(track=>({...track,effects:[{type:'delay' as const,enabled:true,params:{mix:.3,time:.2},automation:{mix:[{time:0,value:.3}],time:[{time:0,value:.2}]}}]}))},original=structuredClone(p),target={trackId:'a',parameter:'mix' as const,effectIndex:0};
 await controller.play(p,sources,0,0,4,false);
 controller.previewAutomation(p,{trackId:'a',parameter:'gain'},.5);expect(controller.previewAutomation(p,target,.8)).toBe(true);await controller.update(p);
 const sent=f.playback.update.mock.calls.at(-1)![0];expect(sent.tracks[0]).toMatchObject({automation:[{time:0,value:.5}],effects:[{automation:{mix:[{time:0,value:.8}],time:[{time:0,value:.2}]}}]});
 expect(nativeLiveStructureKey(sent)).toBe(nativeLiveStructureKey(p));
 const different=structuredClone(p);different.tracks[0].effects[0].automation.time[0].value=.4;expect(nativeLiveStructureKey(different)).not.toBe(nativeLiveStructureKey(p));
 for(const value of [-1,1.1,NaN])expect(controller.previewAutomation(p,target,value)).toBe(false);
 controller.previewAutomation(p,target);await controller.update(p);expect(f.playback.update.mock.calls.at(-1)![0].tracks[0]).toMatchObject({automation:[{time:0,value:.5}],effects:p.tracks[0].effects});
 expect(p).toEqual(original);expect(create).toHaveBeenCalledTimes(1);await controller.stop();
});
