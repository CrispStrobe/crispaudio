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

it('holds track effect mix independently, restores Read and keeps supported envelopes out of topology',async()=>{
 const f=session();create.mockResolvedValue(f.snapshot);const controller=new NativePlaybackController(()=>{},()=>{});
 const p={...mixProject(),tracks:mixProject().tracks.map(track=>({...track,effects:[{type:'delay' as const,enabled:true,params:{mix:.3,time:.2},automation:{mix:[{time:0,value:.3}],time:[{time:0,value:.2}]}}]}))},original=structuredClone(p),target={trackId:'a',parameter:'mix' as const,effectIndex:0};
 await controller.play(p,sources,0,0,4,false);
 controller.previewAutomation(p,{trackId:'a',parameter:'gain'},.5);expect(controller.previewAutomation(p,target,.8)).toBe(true);await controller.update(p);
 const sent=f.playback.update.mock.calls.at(-1)![0];expect(sent.tracks[0]).toMatchObject({automation:[{time:0,value:.5}],effects:[{automation:{mix:[{time:0,value:.8}],time:[{time:0,value:.2}]}}]});
 expect(nativeLiveStructureKey(sent)).toBe(nativeLiveStructureKey(p));
 const different=structuredClone(p);different.tracks[0].effects[0].enabled=false;expect(nativeLiveStructureKey(different)).not.toBe(nativeLiveStructureKey(p));
 for(const value of [-1,1.1,NaN])expect(controller.previewAutomation(p,target,value)).toBe(false);
 controller.previewAutomation(p,target);await controller.update(p);expect(f.playback.update.mock.calls.at(-1)![0].tracks[0]).toMatchObject({automation:[{time:0,value:.5}],effects:p.tracks[0].effects});
 expect(p).toEqual(original);expect(create).toHaveBeenCalledTimes(1);await controller.stop();
});

it.each([{type:'delay' as const,parameter:'feedback' as const,held:.8,invalid:.96},{type:'chorus' as const,parameter:'depth' as const,held:.9,invalid:1.01}])('auditions $type $parameter independently and restores its original curve',async({type,parameter,held,invalid})=>{
 const f=session();create.mockResolvedValue(f.snapshot);const controller=new NativePlaybackController(()=>{},()=>{});
 const p={...mixProject(),tracks:mixProject().tracks.map(track=>({...track,effects:[{type,enabled:true,params:{mix:.3,feedback:.2,depth:.2},automation:{[parameter]:[{time:0,value:.2},{time:3,value:.4}]}}]}))},original=structuredClone(p),target={trackId:'a',parameter,effectIndex:0};
 await controller.play(p,sources,0,0,4,false);expect(controller.previewAutomation(p,target,invalid)).toBe(false);
 expect(controller.previewAutomation(p,{trackId:'a',parameter:'freq',effectIndex:0},.4)).toBe(false);
 controller.previewAutomation(p,{trackId:'a',parameter:'mix',effectIndex:0},.7);expect(controller.previewAutomation(p,target,held)).toBe(true);await controller.update(p);
 const sent=f.playback.update.mock.calls.at(-1)![0];expect(sent.tracks[0].effects?.[0].automation).toMatchObject({mix:[{time:0,value:.7}],[parameter]:[{time:0,value:held}]});expect(nativeLiveStructureKey(sent)).toBe(nativeLiveStructureKey(p));
 controller.previewAutomation(p,target);await controller.update(p);expect(f.playback.update.mock.calls.at(-1)![0].tracks[0].effects?.[0].automation).toMatchObject({mix:[{time:0,value:.7}],[parameter]:original.tracks[0].effects[0].automation[parameter]});expect(p).toEqual(original);expect(create).toHaveBeenCalledTimes(1);await controller.stop();
});

it.each([{type:'delay' as const,parameter:'time' as const,held:.7,invalid:2.01},{type:'chorus' as const,parameter:'rate' as const,held:4.7,invalid:8.01},{type:'ringmod' as const,parameter:'freq' as const,held:731,invalid:2001}])('auditions $type $parameter and restores Read without replacing the session',async({type,parameter,held,invalid})=>{
 const f=session();create.mockResolvedValue(f.snapshot);const controller=new NativePlaybackController(()=>{},()=>{});
 const p={...mixProject(),tracks:mixProject().tracks.map(track=>({...track,effects:[{type,enabled:true,params:{mix:.3},automation:{[parameter]:[{time:0,value:.2}]}}]}))},original=structuredClone(p),target={trackId:'a',parameter,effectIndex:0};await controller.play(p,sources,0,0,4,false);
 expect(controller.previewAutomation(p,target,invalid)).toBe(false);expect(controller.previewAutomation(p,target,held)).toBe(true);await controller.update(p);const sent=f.playback.update.mock.calls.at(-1)![0];expect(sent.tracks[0].effects?.[0].automation?.[parameter]).toEqual([{time:0,value:held}]);expect(nativeLiveStructureKey(sent)).toBe(nativeLiveStructureKey(p));
 controller.previewAutomation(p,target);await controller.update(p);expect(f.playback.update).toHaveBeenLastCalledWith(p);expect(p).toEqual(original);expect(create).toHaveBeenCalledTimes(1);await controller.stop();
});

it('holds audition above changed static values and restores Read without changing topology',async()=>{
 const f=session();create.mockResolvedValue(f.snapshot);const controller=new NativePlaybackController(()=>{},()=>{});
 const p={...mixProject(),tracks:mixProject().tracks.map(track=>({...track,effects:[{type:'delay' as const,enabled:true,params:{mix:.3,time:.2,feedback:.4}}]}))},original=structuredClone(p),target={trackId:'a',parameter:'mix' as const,effectIndex:0};
 await controller.play(p,sources,0,0,4,false);controller.previewAutomation(p,target,.9);
 const changed=structuredClone(p);changed.tracks[0].effects[0].params={mix:.6,time:1.5,feedback:.8};expect(nativeLiveStructureKey(changed)).toBe(nativeLiveStructureKey(p));await controller.update(changed);
 expect(f.playback.update.mock.calls.at(-1)![0].tracks[0].effects?.[0]).toMatchObject({params:changed.tracks[0].effects[0].params,automation:{mix:[{time:0,value:.9}]}});
 controller.previewAutomation(changed,target);await controller.update(changed);expect(f.playback.update).toHaveBeenLastCalledWith(changed);expect(p).toEqual(original);expect(create).toHaveBeenCalledTimes(1);await controller.stop();
 const structural=structuredClone(changed);structural.tracks[0].effects[0].enabled=false;expect(nativeLiveStructureKey(structural)).not.toBe(nativeLiveStructureKey(changed));
 const drive={...changed,tracks:changed.tracks.map(track=>({...track,effects:[{type:'distortion' as const,enabled:true,params:{drive:.4,mix:.3}}]}))},driveChanged=structuredClone(drive);driveChanged.tracks[0].effects[0].params.drive=.9;expect(nativeLiveStructureKey(driveChanged)).not.toBe(nativeLiveStructureKey(drive));
 const invalid=structuredClone(changed);invalid.tracks[0].effects[0].params.mix=NaN;expect(nativeLiveStructureKey(invalid)).not.toBe(nativeLiveStructureKey(changed));
});

it('auditions master and clip independently, restores Read and keeps scoped controls out of topology',async()=>{
 const f=session();create.mockResolvedValue(f.snapshot);const controller=new NativePlaybackController(()=>{},()=>{}),effect={type:'delay' as const,enabled:true,params:{time:.2,feedback:.4,mix:.3},automation:{mix:[{time:0,value:.2}]}};
 const p={...mixProject(),masterEffects:[structuredClone(effect)],tracks:mixProject().tracks.map(track=>({...track,segments:[{id:'clip',trackId:track.id,sourceId:'s',name:'Clip',color:'#fff',startTime:.25,sourceOffset:0,duration:2,gain:1,effects:[structuredClone(effect)],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear' as const,fadeOutCurve:'linear' as const}]}))},original=structuredClone(p);
 await controller.play(p,sources,0,0,4,false);
 expect(controller.previewEffectAutomation(p,'master',0,'mix',.8)).toBe(true);expect(controller.previewEffectAutomation(p,'clip:clip',0,'mix',.6)).toBe(true);await controller.update(p);
 let sent=f.playback.update.mock.calls.at(-1)![0];expect(sent.masterEffects[0].automation?.mix).toEqual([{time:0,value:.8}]);expect(sent.tracks[0].segments[0].effects[0].automation?.mix).toEqual([{time:0,value:.6}]);expect(nativeLiveStructureKey(sent)).toBe(nativeLiveStructureKey(p));
 controller.previewEffectAutomation(p,'master',0,'mix');await controller.update(p);sent=f.playback.update.mock.calls.at(-1)![0];expect(sent.masterEffects).toEqual(p.masterEffects);expect(sent.tracks[0].segments[0].effects[0].automation?.mix).toEqual([{time:0,value:.6}]);
 const changed=structuredClone(p);changed.masterEffects[0].params.time=1.5;changed.tracks[0].segments[0].effects[0].params.mix=.7;expect(nativeLiveStructureKey(changed)).toBe(nativeLiveStructureKey(p));
 expect(controller.previewEffectAutomation(p,'clip:missing',0,'mix',.4)).toBe(false);controller.previewEffectAutomation(p,'clip:clip',0,'mix');await controller.update(p);expect(f.playback.update).toHaveBeenLastCalledWith(p);expect(p).toEqual(original);expect(create).toHaveBeenCalledTimes(1);await controller.stop();
});

import {identifyEffectRack,pasteEffectRack} from '../../../src/lib/builtinEffectIdentity';
it('rebuilds paused identical processors after reorder or paste rather than resuming their old histories',async()=>{
 const first=session(),second=session(),third=session();create.mockResolvedValueOnce(first.snapshot).mockResolvedValueOnce(second.snapshot).mockResolvedValueOnce(third.snapshot);
 const controller=new NativePlaybackController(()=>{},()=>{}),effects=identifyEffectRack([{type:'delay',enabled:true,params:{time:.3,mix:.3}},{type:'delay',enabled:true,params:{time:.3,mix:.3}}]),p={...project(),masterEffects:effects};
 await controller.play(p,sources,.5,0,4,true);await controller.pause();
 const reordered={...p,masterEffects:[...effects].reverse()};expect(nativeLiveStructureKey(reordered)).not.toBe(nativeLiveStructureKey(p));
 await controller.play(reordered,sources,.5,0,4,true);expect(create).toHaveBeenCalledTimes(2);expect(first.snapshot.close).toHaveBeenCalledTimes(1);expect(first.playback.pause).not.toHaveBeenCalledWith(false);
 await controller.pause();const pasted={...reordered,masterEffects:pasteEffectRack(reordered.masterEffects)};
 await controller.play(pasted,sources,.5,0,4,true);expect(create).toHaveBeenCalledTimes(3);expect(second.snapshot.close).toHaveBeenCalledTimes(1);await controller.stop();
});

it('auditions native parameters independently by scope/instance/address and restores saved Read without state mutation',async()=>{
 const f=session();create.mockResolvedValue(f.snapshot);const controller=new NativePlaybackController(()=>{},()=>{}),p=project(),target={instanceId:'n',address:'1',min:-24,max:12};
 const curve={min:-24,max:12,points:[{time:0,value:.5},{time:2,value:1}]};p.nativeEffects[0].parameters={'1':-6};const saved={...p,nativeEffects:p.nativeEffects.map(e=>({...e,parameterAutomation:{'1':curve}}))},before=structuredClone(saved);
 await controller.play(saved,sources,0,0,4,false);
 expect(controller.previewNativeParameterAutomation(saved,'master',target,.75)).toBe(true);await controller.update(saved);expect(f.playback.update.mock.calls.at(-1)![0].nativeEffects![0].parameterAutomation?.['1'].points).toEqual([{time:0,value:.75}]);
 expect(controller.previewNativeParameterAutomation(saved,'master',{...target,address:'2',min:0,max:1,defaultValue:.4},.2)).toBe(true);await controller.update(saved);
 controller.previewNativeParameterAutomation(saved,'master',target);await controller.update(saved);const sent=f.playback.update.mock.calls.at(-1)![0].nativeEffects![0];expect(sent.parameterAutomation?.['1']).toEqual(curve);expect(sent.parameterAutomation?.['2'].points).toEqual([{time:0,value:.2}]);
 expect(nativeLiveStructureKey(saved)).toBe(nativeLiveStructureKey(p));expect(saved).toEqual(before);expect(create).toHaveBeenCalledTimes(1);
 for(const value of [-.1,1.1,NaN])expect(controller.previewNativeParameterAutomation(saved,'master',target,value)).toBe(false);
 await controller.stop();
});

it('restores an unstored plugin default after audition without mutating the saved state or base parameters',async()=>{
 const f=session();create.mockResolvedValue(f.snapshot);const controller=new NativePlaybackController(()=>{},()=>{}),p=project(),target={instanceId:'n',address:'new',min:-24,max:12,defaultValue:-6};
 await controller.play(p,sources,0,0,4,false);expect(controller.previewNativeParameterAutomation(p,'master',target,.9)).toBe(true);await controller.update(p);
 controller.previewNativeParameterAutomation(p,'master',target);await controller.update(p);expect(f.playback.update.mock.calls.at(-1)![0].nativeEffects![0]).toMatchObject({parameters:{new:-6}});expect(f.playback.update.mock.calls.at(-1)![0].nativeEffects![0].parameterAutomation?.new).toBeUndefined();expect(p.nativeEffects[0].parameters).not.toHaveProperty('new');expect(p.nativeEffects[0].state).toBe('saved');await controller.stop();
});
