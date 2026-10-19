import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {act,renderHook,cleanup} from '@testing-library/react';
import {useNativeSourcePreview} from '../../../src/hooks/useNativeSourcePreview';
import {useProjectStore} from '../../../src/stores/projectStore';
import {useUIStore} from '../../../src/stores/uiStore';
const fixture=vi.hoisted(()=>({instances:[] as Array<{active:boolean;status?:{phase:string};events:{change:()=>void;ended:()=>void;fault:(error:unknown)=>void};play:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>;update:ReturnType<typeof vi.fn>}>}));
vi.mock('../../../src/audio/engine/NativeSourceAudition',()=>({NativeSourceAudition:class{
 active=false;status?:{phase:string};
 constructor(public events:{change:()=>void;ended:()=>void;fault:(error:unknown)=>void}){fixture.instances.push(this);}
 setEvents(events:typeof this.events){this.events=events;}
 stop=vi.fn(async()=>{this.active=false;this.status=undefined;this.events.change();});
 play=vi.fn(async()=>{this.active=true;this.status={phase:'playing'};this.events.change();});
 update=vi.fn(async()=>{});poll=vi.fn(async()=>{});position(){return .25;}
}}));
const input=()=>({channels:[new Float32Array(2048),new Float32Array(2048)],sampleRate:48000,effect:{instanceId:'fx',pluginId:'vst3:fixture',name:'Fixture',format:'VST3' as const,state:'base',enabled:true,bypass:false,parameters:{'100':.2}}});
function options(){return {input:input(),identity:{},enabled:true,loop:true,bypass:false,levelDb:-12,beforeStart:vi.fn(async()=>{}),onFault:vi.fn()};}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
beforeEach(()=>{fixture.instances.length=0;useUIStore.setState({timelineRecording:false});useProjectStore.setState({isPlaying:false});});
afterEach(()=>cleanup());
it('joins the prior source and arrangement before native output and enables monitor protection only for listening',async()=>{
 const spec=options(),gate=deferred();spec.beforeStart.mockReturnValueOnce(gate.promise);const hook=renderHook(()=>useNativeSourcePreview(spec)),audio=fixture.instances[0];
 let opening!:Promise<void>;await act(async()=>{opening=hook.result.current.start();});expect(hook.result.current.phase).toBe('preparing');expect(audio.play).not.toHaveBeenCalled();
 await act(async()=>{gate.resolve();await opening;});expect(audio.play).toHaveBeenCalledWith(spec.input,expect.objectContaining({protectOutput:true,loop:true,levelDb:-12,isCurrent:expect.any(Function)}));expect(hook.result.current.phase).toBe('playing');expect(hook.result.current.position()).toBe(.25);
});
it.each(['stop','identity','disabled','unmount','recording','arrangement'] as const)('suppresses pending source start after %s',async action=>{
 const spec=options(),gate=deferred();spec.beforeStart.mockReturnValue(gate.promise);const hook=renderHook(p=>useNativeSourcePreview(p),{initialProps:spec}),audio=fixture.instances[0];
 let opening!:Promise<void>;await act(async()=>{opening=hook.result.current.start();});
 if(action==='stop')await act(async()=>{await hook.result.current.stop();});
 if(action==='identity')hook.rerender({...spec,identity:{}});
 if(action==='disabled')hook.rerender({...spec,enabled:false});
 if(action==='unmount')hook.unmount();
 if(action==='recording')useUIStore.setState({timelineRecording:true});
 if(action==='arrangement')useProjectStore.setState({isPlaying:true});
 await act(async()=>{gate.resolve();await opening;});expect(audio.play).not.toHaveBeenCalled();expect(spec.onFault).not.toHaveBeenCalled();
});
it('updates parameters, warm bypass and monitor gain on the same source owner',async()=>{
 const spec=options(),hook=renderHook(p=>useNativeSourcePreview(p),{initialProps:spec}),audio=fixture.instances[0];
 await act(async()=>hook.result.current.start());const changed={...spec,input:{...spec.input,effect:{...spec.input.effect,parameters:{'100':.7}}},bypass:true,levelDb:-6};hook.rerender(changed);
 expect(audio.play).toHaveBeenCalledOnce();expect(audio.update).toHaveBeenLastCalledWith({parameters:{'100':.7},bypass:true,levelDb:-6});expect(spec.input.effect.parameters).toEqual({'100':.2});
});
it('shows a native fault without falling back to another playback engine',async()=>{
 const spec=options(),hook=renderHook(()=>useNativeSourcePreview(spec)),audio=fixture.instances[0];await act(async()=>hook.result.current.start());
 act(()=>{audio.active=false;audio.events.fault(new Error('helper failed'));audio.events.change();});expect(hook.result.current.phase).toBe('idle');expect(spec.onFault).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({message:'helper failed'}));expect(audio.play).toHaveBeenCalledOnce();
});
it('suppresses an old controls failure after stopping and starting a replacement',async()=>{
 const spec=options(),hook=renderHook(p=>useNativeSourcePreview(p),{initialProps:spec}),audio=fixture.instances[0];await act(async()=>hook.result.current.start());
 let reject!:(error:Error)=>void;audio.update.mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail;}));hook.rerender({...spec,levelDb:-6});
 await act(async()=>{await hook.result.current.stop();});await act(async()=>hook.result.current.start());await act(async()=>reject(new Error('old failure')));expect(spec.onFault).not.toHaveBeenCalled();expect(hook.result.current.phase).toBe('playing');
});
