import {nativeSourceOwner} from '../../../src/audio/engine/NativeSourceOwner';
import {DEFAULT_MUSIC} from '../../../src/lib/musicalTime';
import {afterEach,it,expect,vi} from 'vitest';
import {act,cleanup,renderHook} from '@testing-library/react';
import {useNativeTimelineTransport} from '../../../src/hooks/useNativeTimelineTransport';
import {useProjectStore} from '../../../src/stores/projectStore';
import {useUIStore} from '../../../src/stores/uiStore';
import type {TimelineEngine} from '../../../src/audio/engine/TimelineEngine';
vi.mock('../../../src/i18n',()=>({default:{language:'en',t:(key:string)=>key,changeLanguage:vi.fn()}}));
afterEach(()=>{cleanup();vi.useRealTimers();});
it('keeps native playback running for a track FX knob and Undo, restarting for rack changes',async()=>{
 vi.useFakeTimers();useUIStore.setState({timelineRecording:false});
 const initial=useProjectStore.getInitialState(),project={...initial.project,duration:4,tracks:[{id:'t',name:'Track',volume:1,pan:0,muted:false,solo:false,segments:[],effects:[{type:'delay' as const,enabled:true,params:{time:.2,mix:.3,feedback:.4}}]}]};
 useProjectStore.setState({...initial,project});useProjectStore.temporal.getState().clear();
 const playNativeOwned=vi.fn().mockResolvedValue(undefined),updateMix=vi.fn(),closeNativeOwned=vi.fn().mockResolvedValue(undefined);
 const engine={playNativeOwned,updateMix,closeNativeOwned,pauseNativeOwned:vi.fn().mockResolvedValue(undefined)} as unknown as TimelineEngine,ref={current:engine};
 renderHook(()=>useNativeTimelineTransport(ref,true));
 await act(async()=>useProjectStore.getState().setIsPlaying(true));expect(playNativeOwned).toHaveBeenCalledTimes(1);updateMix.mockClear();
 act(()=>useProjectStore.getState().updateTrack('t',{effects:[{...project.tracks[0].effects[0],params:{time:1.5,mix:.7,feedback:.8}}]}));
 expect(playNativeOwned).toHaveBeenCalledTimes(1);expect(updateMix).toHaveBeenLastCalledWith(useProjectStore.getState().project);expect(closeNativeOwned).not.toHaveBeenCalled();
 act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project).toBe(project);expect(playNativeOwned).toHaveBeenCalledTimes(1);expect(updateMix).toHaveBeenLastCalledWith(project);
 await act(async()=>useProjectStore.getState().updateTrack('t',{effects:[{...project.tracks[0].effects[0],enabled:false}]}));expect(playNativeOwned).toHaveBeenCalledTimes(2);
});

import {identifyEffectRack} from '../../../src/lib/builtinEffectIdentity';
import type {EffectConfig,TimelineProject} from '../../../src/types/audio';
it.each(['track','master','clip'] as const)('restarts same-type %s reorders and Undo/Redo, keeping subsequent knob edits live',async scope=>{
 vi.useFakeTimers();useUIStore.setState({timelineRecording:false});
 const initial=useProjectStore.getInitialState();
 const effects:EffectConfig[]=[{type:'delay',enabled:true,params:{time:.2,mix:.3}},{type:'delay',enabled:true,params:{time:.8,mix:.7}}];
 const withRack=(project:TimelineProject,rack:EffectConfig[]):TimelineProject=>({...project,masterEffects:scope==='master'?rack:[],tracks:[{id:'t',name:'Track',volume:1,pan:0,muted:false,solo:false,effects:scope==='track'?rack:[],segments:scope==='clip'?[{id:'c',sourceId:'source',offset:0,start:0,duration:4,volume:1,fadeIn:0,fadeOut:0,effects:rack}]:[]}]});
 const project=withRack({...initial.project,duration:4},effects);
 useProjectStore.setState({...initial,project});useProjectStore.temporal.getState().clear();
 const playNativeOwned=vi.fn().mockResolvedValue(undefined),updateMix=vi.fn(),closeNativeOwned=vi.fn().mockResolvedValue(undefined);
 const engine={playNativeOwned,updateMix,closeNativeOwned,pauseNativeOwned:vi.fn().mockResolvedValue(undefined)} as unknown as TimelineEngine,ref={current:engine};
 renderHook(()=>useNativeTimelineTransport(ref,true));
 await act(async()=>useProjectStore.getState().setIsPlaying(true));expect(playNativeOwned).toHaveBeenCalledTimes(1);
 const reordered=identifyEffectRack(effects).reverse();
 await act(async()=>useProjectStore.setState({project:withRack(project,reordered)}));expect(playNativeOwned).toHaveBeenCalledTimes(2);
 await act(async()=>useProjectStore.temporal.getState().undo());expect(playNativeOwned).toHaveBeenCalledTimes(3);expect(useProjectStore.getState().project).toBe(project);
 await act(async()=>useProjectStore.temporal.getState().redo());expect(playNativeOwned).toHaveBeenCalledTimes(4);
 act(()=>useProjectStore.setState({project:withRack(project,reordered.map(effect=>({...effect,params:{...effect.params,mix:.5}})))}));
 expect(playNativeOwned).toHaveBeenCalledTimes(4);expect(updateMix).toHaveBeenLastCalledWith(useProjectStore.getState().project);
 expect(effects.every(effect=>effect.instanceId===undefined)).toBe(true);
});

it('updates click enable and level without restarting native playback, including Undo',async()=>{
 vi.useFakeTimers();useUIStore.setState({timelineRecording:false});
 const initial=useProjectStore.getInitialState(),project={...initial.project,duration:4,music:{...DEFAULT_MUSIC}};
 useProjectStore.setState({...initial,project});useProjectStore.temporal.getState().clear();
 const playNativeOwned=vi.fn().mockResolvedValue(undefined),updateMix=vi.fn(),closeNativeOwned=vi.fn().mockResolvedValue(undefined);
 const engine={playNativeOwned,updateMix,closeNativeOwned,pauseNativeOwned:vi.fn().mockResolvedValue(undefined)} as unknown as TimelineEngine;
 renderHook(()=>useNativeTimelineTransport({current:engine},true));
 await act(async()=>useProjectStore.getState().setIsPlaying(true));
 act(()=>useProjectStore.setState({project:{...project,music:{...DEFAULT_MUSIC,metronome:true,clickLevel:.8}}}));
 expect(playNativeOwned).toHaveBeenCalledTimes(1);expect(updateMix).toHaveBeenLastCalledWith(useProjectStore.getState().project);
 act(()=>useProjectStore.temporal.getState().undo());
 expect(playNativeOwned).toHaveBeenCalledTimes(1);expect(updateMix).toHaveBeenLastCalledWith(project);
 expect(closeNativeOwned).not.toHaveBeenCalled();
});

it.each(['continue','stop','unmount'] as const)('joins source cleanup before native arrangement start: %s',async action=>{
 useUIStore.setState({timelineRecording:false});const initial=useProjectStore.getInitialState();
 useProjectStore.setState({...initial,project:{...initial.project,duration:4}});
 let release!:()=>void;const close=vi.fn(()=>new Promise<void>(resolve=>{release=resolve;}));nativeSourceOwner.reserve(close);
 const playNativeOwned=vi.fn().mockResolvedValue(undefined),engine={playNativeOwned,updateMix:vi.fn(),closeNativeOwned:vi.fn(async()=>{}),pauseNativeOwned:vi.fn(async()=>{})} as unknown as TimelineEngine;
 const hook=renderHook(()=>useNativeTimelineTransport({current:engine},true));
 await act(async()=>useProjectStore.getState().setIsPlaying(true));expect(close).toHaveBeenCalledOnce();expect(playNativeOwned).not.toHaveBeenCalled();
 if(action==='stop')act(()=>useProjectStore.getState().setIsPlaying(false));if(action==='unmount')hook.unmount();
 await act(async()=>release());expect(playNativeOwned).toHaveBeenCalledTimes(action==='continue'?1:0);hook.unmount();
});
