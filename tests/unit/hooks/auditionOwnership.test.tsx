import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {act,renderHook,cleanup} from '@testing-library/react';
import {useMixAudition} from '../../../src/hooks/useMixAudition';
import {useTakeAudition} from '../../../src/hooks/useTakeAudition';
import {requestAudition} from '../../../src/lib/auditionEvent';
import {useProjectStore} from '../../../src/stores/projectStore';
const fixture=vi.hoisted(()=>({resume:vi.fn(),prepare:vi.fn(),graphs:[] as {stop:ReturnType<typeof vi.fn>;play:ReturnType<typeof vi.fn>}[],nodes:[] as {stop:ReturnType<typeof vi.fn>;start:ReturnType<typeof vi.fn>;connect:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>}[]}));
vi.mock('../../../src/hooks/useAudioEngine',()=>({useAudioEngine:()=>({resume:fixture.resume,masterGain:{},getContext:()=>({currentTime:0,createBufferSource:()=>{const node={stop:vi.fn(),start:vi.fn(),connect:vi.fn(),disconnect:vi.fn()};fixture.nodes.push(node);return node;},createGain:()=>({gain:{value:1,setTargetAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()})})})}));
vi.mock('../../../src/audio/engine/TimelineEngine',()=>({TimelineEngine:class{
 stop=vi.fn();play=vi.fn();prepare=fixture.prepare;setSources=vi.fn();constructor(){fixture.graphs.push(this);}
}}));
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
beforeEach(()=>{fixture.nodes.length=0;fixture.graphs.length=0;fixture.resume.mockReset().mockResolvedValue(undefined);fixture.prepare.mockReset().mockResolvedValue(undefined);useProjectStore.setState({isPlaying:false});});
afterEach(()=>cleanup());
it('stops both Mix A/B voices synchronously before a source can claim output',async()=>{
 const hook=renderHook(()=>useMixAudition());await act(async()=>hook.result.current.play([{} as AudioBuffer,{} as AudioBuffer],'A',[1,1],true));expect(hook.result.current.playing).toBe(true);
 act(()=>{expect(requestAudition('source',true)).toBe(true);});expect(hook.result.current.playing).toBe(false);expect(fixture.nodes).toHaveLength(2);expect(fixture.nodes.every(node=>node.stop.mock.calls.length===1)).toBe(true);
});
it('does not start pending Mix A/B after source takeover during audio resume',async()=>{
 const gate=deferred();fixture.resume.mockReturnValueOnce(gate.promise);const hook=renderHook(()=>useMixAudition());let opening!:Promise<void>;
 await act(async()=>{opening=hook.result.current.play([{} as AudioBuffer,{} as AudioBuffer],'A',[1,1],true);});act(()=>{requestAudition('source',true);});await act(async()=>{gate.resolve();await opening;});expect(fixture.nodes).toHaveLength(0);expect(hook.result.current.playing).toBe(false);
});
it('stops a take preview before another audition and cancels its timer',async()=>{
 const project=useProjectStore.getState().project,hook=renderHook(()=>useTakeAudition(project,false));await act(async()=>hook.result.current.play('take',project,0,1));expect(hook.result.current.playing).toBe('take');
 act(()=>{requestAudition('source',true);});expect(hook.result.current.playing).toBe('');expect(fixture.graphs[0].stop).toHaveBeenCalledOnce();
});
it('does not publish a take graph prepared after source takeover',async()=>{
 const gate=deferred();fixture.prepare.mockReturnValueOnce(gate.promise);const project=useProjectStore.getState().project,hook=renderHook(()=>useTakeAudition(project,false));let opening!:Promise<void>;
 await act(async()=>{opening=hook.result.current.play('take',project,0,1);});act(()=>{requestAudition('source',true);});await act(async()=>{gate.resolve();await opening;});expect(fixture.graphs[0].play).not.toHaveBeenCalled();expect(hook.result.current.playing).toBe('');
});
