import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,renderHook} from '@testing-library/react';
import {useTimelineMetronome} from '../../../src/hooks/useTimelineMetronome';
import {useProjectStore} from '../../../src/stores/projectStore';
import {useUIStore} from '../../../src/stores/uiStore';
import {DEFAULT_MUSIC} from '../../../src/lib/musicalTime';
import type {TimelineEngine} from '../../../src/audio/engine/TimelineEngine';
import type {AudioEngineHandle} from '../../../src/hooks/useAudioEngine';
const {instances}=vi.hoisted(()=>({instances:[] as {start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>;args:unknown[]}[]}));
vi.mock('../../../src/audio/engine/TimelineMetronome',()=>({TimelineMetronome:class{
 start=vi.fn();stop=vi.fn();args:unknown[];
 constructor(...args:unknown[]){this.args=args;instances.push(this);}
}}));
beforeEach(()=>{
 instances.length=0;const initial=useProjectStore.getInitialState();
 useProjectStore.setState({...initial,isPlaying:true,project:{...initial.project,duration:10,music:{...DEFAULT_MUSIC,metronome:true},nativeEffects:[{instanceId:'fx',pluginId:'au:fake',name:'Test',format:'AU',enabled:true,bypass:false,state:'',parameters:{}}]}});
 useUIStore.setState({timelineRecording:false});
});
afterEach(cleanup);
function fixture(){
 const clock={anchor:{frame:48000,timeline:2},end:7,loop:{start:1,end:7}};
 let current:typeof clock|undefined=clock,listener=()=>{};
 const unsubscribe=vi.fn(),engine={monitorPlaybackClock:()=>current,onPlaybackClock:(fn:()=>void)=>{listener=fn;return unsubscribe;}} as unknown as TimelineEngine;
 const audio={getContext:()=>({sampleRate:48000}),masterGain:{}} as AudioEngineHandle;
 return {engine,audio,clock,unsubscribe,notify:()=>act(()=>listener()),setClock:(value:typeof clock|undefined)=>{current=value;}};
}
it('uses the actual rendered Preview clock and loop despite a native rack',()=>{
 const f=fixture(),{unmount}=renderHook(()=>useTimelineMetronome({current:f.engine},f.audio));
 expect(instances).toHaveLength(1);expect(instances[0].start).toHaveBeenCalledOnce();
 expect(instances[0].args.slice(3)).toEqual([f.clock.anchor,7,f.clock.loop]);
 unmount();expect(instances[0].stop).toHaveBeenCalledOnce();expect(f.unsubscribe).toHaveBeenCalledOnce();
});
it('waits for asynchronous preparation and never adds Web Audio clicks without a Web Audio clock',()=>{
 const f=fixture();f.setClock(undefined);renderHook(()=>useTimelineMetronome({current:f.engine},f.audio));
 expect(instances).toHaveLength(0);f.setClock(f.clock);f.notify();expect(instances).toHaveLength(1);
 f.setClock(undefined);f.notify();expect(instances[0].stop).toHaveBeenCalledOnce();expect(instances).toHaveLength(1);
});
it('reanchors seeks, applies level changes and cleans up on pause',()=>{
 const f=fixture(),ref={current:f.engine};renderHook(()=>useTimelineMetronome(ref,f.audio));
 f.setClock({...f.clock,anchor:{frame:96000,timeline:4}});f.notify();
 expect(instances[0].stop).toHaveBeenCalledOnce();expect(instances[1].args[3]).toEqual({frame:96000,timeline:4});
 act(()=>{const state=useProjectStore.getState();useProjectStore.setState({project:{...state.project,music:{...state.project.music!,clickLevel:.8}}});});
 expect(instances[1].stop).toHaveBeenCalledOnce();expect(instances[2].args[2]).toMatchObject({clickLevel:.8});
 act(()=>useProjectStore.getState().setIsPlaying(false));expect(instances[2].stop).toHaveBeenCalledOnce();
});
it('leaves recording clicks to the capture session and never doubles them',()=>{
 const f=fixture(),ref={current:f.engine};useUIStore.setState({timelineRecording:true});
 renderHook(()=>useTimelineMetronome(ref,f.audio));expect(instances).toHaveLength(0);
 act(()=>useUIStore.setState({timelineRecording:false}));expect(instances).toHaveLength(1);
 act(()=>useUIStore.setState({timelineRecording:true}));expect(instances[0].stop).toHaveBeenCalledOnce();
});
it.each([false,0])('does not start when the click is disabled or silent (%s)',value=>{
 const f=fixture(),state=useProjectStore.getState();useProjectStore.setState({project:{...state.project,music:{...state.project.music!,...(value===false?{metronome:false}:{clickLevel:0})}}});
 renderHook(()=>useTimelineMetronome({current:f.engine},f.audio));expect(instances).toHaveLength(0);
});
