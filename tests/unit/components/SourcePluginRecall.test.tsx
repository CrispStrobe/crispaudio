import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {SourcePluginRecall} from '../../../src/components/timeline/SourcePluginRecall';
import {useProjectStore} from '../../../src/stores/projectStore';
import {useUIStore} from '../../../src/stores/uiStore';
import {recallFixture} from '../../fixtures/sourcePluginRecall';
import {TimelineEngineContext} from '../../../src/components/timeline/timelineEngineContext';
import type {TimelineEngine} from '../../../src/audio/engine/TimelineEngine';
const mocks=vi.hoisted(()=>({job:vi.fn(),pass:vi.fn(),commit:vi.fn(),stop:vi.fn(),draw:vi.fn()}));
vi.mock('../../../src/lib/mediaJob',()=>({mediaJob:mocks.job}));
vi.mock('../../../src/audio/engine/SourcePluginWaveform',async original=>({...await original<object>(),renderSourcePluginPass:mocks.pass}));
vi.mock('../../../src/audio/plugins/SourcePluginRecallCommit',()=>({commitSourcePluginRecall:mocks.commit}));
vi.mock('../../../src/audio/engine/NativeSourceOwner',()=>({nativeSourceOwner:{stop:mocks.stop}}));
vi.mock('../../../src/hooks/useAudioEngine',()=>({useAudioEngine:()=>({getContext:()=>{throw new Error('Audio access forbidden in control fixture');},resume:vi.fn(),masterGain:{}})}));
vi.mock('../../../src/lib/drawSourceWaveform',()=>({drawSourceWaveform:mocks.draw}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('../../../src/components/shared/ParamSlider',()=>({ParamSlider:({label,value,onChange}:{label:string;value:number;onChange:(v:number)=>void})=><input type="number" aria-label={label} value={value} onChange={e=>onChange(Number(e.target.value))}/>}));
const info={state:'normalized-base',parameters:[{address:'gain',name:'Gain',min:0,max:1,value:.5,unit:''}]};
function mount(){const onBack=vi.fn(),view=render(<SourcePluginRecall clipId="clip" onBack={onBack}/>);return {...view,onBack};}
const renderPreview=()=>fireEvent.click(screen.getByRole('button',{name:'sourcePlugins.preview'}));
const change=(value:number)=>fireEvent.change(screen.getByRole('spinbutton',{name:'Gain'}),{target:{value:String(value)}});
function deferred<T>(){let resolve!:(value:T)=>void;return {promise:new Promise<T>(done=>{resolve=done;}),resolve:(value:T)=>resolve(value)};}
beforeEach(()=>{
 vi.clearAllMocks();useProjectStore.setState(recallFixture().state);useProjectStore.temporal.getState().clear();useUIStore.setState({timelineRecording:false});mocks.job.mockResolvedValue(info);mocks.stop.mockResolvedValue(undefined);mocks.draw.mockResolvedValue(undefined);mocks.commit.mockResolvedValue(undefined);mocks.pass.mockImplementation(async input=>({pcm:input.channels.map((c:Float32Array)=>Float32Array.from(c,v=>v*.25)),latency:.002}));
});
afterEach(cleanup);
it('restores the saved plug-in state/parameters without rendering or editing the arrangement',async()=>{
 const before=useProjectStore.getState().project;mount();await screen.findByRole('spinbutton',{name:'Gain'});expect(mocks.job).toHaveBeenCalledWith('audio_unit_plugin',{operation:'plugin-info',request:{id:'vst3:test',state:'saved-base',parameters:{gain:.5}}},expect.any(AbortSignal));expect(mocks.pass).not.toHaveBeenCalled();expect(useProjectStore.getState().project).toBe(before);expect(screen.queryByRole('button',{name:'sourceEditor.apply'})).toBeNull();
});
it('renders repeated edits from identical original PCM/base state and invalidates Apply on parameter edits',async()=>{
 mount();await screen.findByRole('spinbutton',{name:'Gain'});change(.25);renderPreview();await screen.findByRole('button',{name:'sourceEditor.apply'});change(.75);expect(screen.queryByRole('button',{name:'sourceEditor.apply'})).toBeNull();renderPreview();await screen.findByRole('button',{name:'sourceEditor.apply'});
 const calls=mocks.pass.mock.calls;expect(calls).toHaveLength(2);expect(calls[0][0].channels).toBe(calls[1][0].channels);expect(calls[0][0].channels[0][0]).not.toBe(3);expect(calls.map(([input])=>input.effect.parameters.gain)).toEqual([.25,.75]);expect(calls.map(([input])=>input.effect.state)).toEqual(['normalized-base','normalized-base']);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
});
it.each(['recording','project','sources','arrangement'])('cancels and discards a pending render on %s change',async kind=>{
 const gate=deferred<{pcm:Float32Array[];latency:number}>();mocks.pass.mockReturnValue(gate.promise);mount();await screen.findByRole('spinbutton',{name:'Gain'});renderPreview();await waitFor(()=>expect(mocks.pass).toHaveBeenCalled());const [input,signal]=mocks.pass.mock.calls[0];
 act(()=>{const state=useProjectStore.getState();if(kind==='recording')useUIStore.setState({timelineRecording:true});else useProjectStore.setState(kind==='project'?{project:{...state.project}}:kind==='sources'?{sources:new Map(state.sources)}:{isPlaying:true});});expect(signal.aborted).toBe(true);await act(async()=>gate.resolve({pcm:input.channels,latency:.001}));expect(screen.queryByRole('button',{name:'sourceEditor.apply'})).toBeNull();expect(mocks.commit).not.toHaveBeenCalled();
});
it('aborts a render on close without publishing the late result',async()=>{
 const gate=deferred<{pcm:Float32Array[];latency:number}>();mocks.pass.mockReturnValue(gate.promise);const view=mount();await screen.findByRole('spinbutton',{name:'Gain'});renderPreview();await waitFor(()=>expect(mocks.pass).toHaveBeenCalled());const [input,signal]=mocks.pass.mock.calls[0];view.unmount();expect(signal.aborted).toBe(true);await act(async()=>gate.resolve({pcm:input.channels,latency:0}));expect(mocks.commit).not.toHaveBeenCalled();
});
it('reports missing plug-in metadata and a failed render without changing project audio',async()=>{
 const before=useProjectStore.getState().project;mocks.job.mockRejectedValueOnce(new Error('Missing plug-in'));const view=mount();await screen.findByText('Error: Missing plug-in');expect(screen.getByRole('button',{name:'sourcePlugins.preview'})).toBeDisabled();view.unmount();mocks.job.mockResolvedValue(info);mount();await screen.findByRole('spinbutton',{name:'Gain'});mocks.pass.mockRejectedValueOnce(new Error('Helper failed'));renderPreview();await screen.findByText('Helper failed');expect(useProjectStore.getState().project).toBe(before);expect(screen.queryByRole('button',{name:'sourceEditor.apply'})).toBeNull();
});
it('passes prepared original-based samples and the restored base recipe to the owned Apply coordinator',async()=>{
 mount();await screen.findByRole('spinbutton',{name:'Gain'});change(.25);renderPreview();await screen.findByRole('button',{name:'sourceEditor.apply'});fireEvent.click(screen.getByRole('button',{name:'sourceEditor.apply'}));await waitFor(()=>expect(mocks.commit).toHaveBeenCalled());const [plan,prepared]=mocks.commit.mock.calls[0];expect(prepared.recipe).toMatchObject({parameters:{gain:.25},state:'normalized-base',latency:.002});expect(prepared.pcm[0][0]).toBe(plan.input.channels[0][0]);expect(prepared.pcm[0][500]).toBeCloseTo(plan.input.channels[0][500]*.25);expect(plan.visible).toEqual({start:1200,end:3600});
});
it('shows a recoverable message when the original disappears before the editor mounts',()=>{
 const state=useProjectStore.getState();useProjectStore.setState({sources:new Map([...state.sources].filter(([id])=>id!=='original'))});const view=mount();expect(screen.getByRole('alert')).toHaveTextContent('sourceRecall.missing');expect(mocks.job).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'sourceRecall.back'}));expect(view.onBack).toHaveBeenCalledOnce();
});
it.each(['project','sources','arrangement','recording'])('invalidates a pending render even if %s changes and returns within one UI batch',async kind=>{
 const gate=deferred<{pcm:Float32Array[];latency:number}>();mocks.pass.mockReturnValue(gate.promise);mount();await screen.findByRole('spinbutton',{name:'Gain'});renderPreview();await waitFor(()=>expect(mocks.pass).toHaveBeenCalled());const [input,signal]=mocks.pass.mock.calls[0];
 act(()=>{if(kind==='project'){const project=useProjectStore.getState().project;useProjectStore.setState({project:{...project}});useProjectStore.setState({project});}else if(kind==='sources'){const sources=useProjectStore.getState().sources;useProjectStore.setState({sources:new Map(sources)});useProjectStore.setState({sources});}else if(kind==='arrangement'){useProjectStore.setState({isPlaying:true});useProjectStore.setState({isPlaying:false});}else{useUIStore.setState({timelineRecording:true});useUIStore.setState({timelineRecording:false});}});
 expect(signal.aborted).toBe(true);await act(async()=>gate.resolve({pcm:input.channels,latency:0}));expect(screen.queryByRole('button',{name:'sourceEditor.apply'})).toBeNull();
});
it('joins the arrangement output before allocating a helper pass',async()=>{
 const gate=deferred<void>(),engine={stop:vi.fn(),closeNativeOwned:vi.fn(()=>gate.promise)};render(<TimelineEngineContext.Provider value={{current:engine as unknown as TimelineEngine}}><SourcePluginRecall clipId="clip" onBack={vi.fn()}/></TimelineEngineContext.Provider>);await screen.findByRole('spinbutton',{name:'Gain'});renderPreview();expect(engine.stop).toHaveBeenCalledOnce();expect(engine.closeNativeOwned).toHaveBeenCalledOnce();expect(mocks.pass).not.toHaveBeenCalled();await act(async()=>gate.resolve());await screen.findByRole('button',{name:'sourceEditor.apply'});expect(mocks.pass).toHaveBeenCalledOnce();
});
it('discards a pending audition close acknowledgement after unmount, before touching a replacement source owner',async()=>{
 const gate=deferred<void>(),engine={stop:vi.fn(),closeNativeOwned:vi.fn(()=>gate.promise)},view=render(<TimelineEngineContext.Provider value={{current:engine as unknown as TimelineEngine}}><SourcePluginRecall clipId="clip" onBack={vi.fn()}/></TimelineEngineContext.Provider>);await screen.findByRole('spinbutton',{name:'Gain'});fireEvent.click(screen.getByRole('button',{name:'sourceEditor.audition'}));expect(engine.stop).toHaveBeenCalledOnce();expect(engine.closeNativeOwned).toHaveBeenCalledOnce();expect(mocks.stop).not.toHaveBeenCalled();view.unmount();await act(async()=>gate.resolve());expect(mocks.stop).not.toHaveBeenCalled();expect(mocks.pass).not.toHaveBeenCalled();
});
it('invalidates a prepared result on range edits and publishes the edited channel/mask only after rendering again',async()=>{
 mount();await screen.findByRole('spinbutton',{name:'Gain'});renderPreview();await screen.findByRole('button',{name:'sourceEditor.apply'});
 fireEvent.change(screen.getByRole('combobox',{name:'sourceEditor.channel'}),{target:{value:'1'}});expect(screen.queryByRole('button',{name:'sourceEditor.apply'})).toBeNull();
 const start=screen.getByRole('spinbutton',{name:'sourceRecall.start'});fireEvent.focus(start);fireEvent.change(start,{target:{value:'1500'}});fireEvent.blur(start);
 const end=screen.getByRole('spinbutton',{name:'sourceRecall.end'});fireEvent.focus(end);fireEvent.change(end,{target:{value:'3500'}});fireEvent.blur(end);
 expect(mocks.commit).not.toHaveBeenCalled();renderPreview();await screen.findByRole('button',{name:'sourceEditor.apply'});fireEvent.click(screen.getByRole('button',{name:'sourceEditor.apply'}));await waitFor(()=>expect(mocks.commit).toHaveBeenCalled());const [plan,prepared]=mocks.commit.mock.calls[0];expect(prepared.selection).toEqual({channel:1,ranges:[{start:1500,end:3500}]});expect(prepared.pcm[0]).toEqual(plan.input.channels[0]);expect(prepared.pcm[1][1499]).toBe(plan.input.channels[1][1499]);expect(prepared.pcm[1][1500]).toBeCloseTo(plan.input.channels[1][1500]*.25);expect(mocks.pass.mock.calls[1][0].channels).toBe(mocks.pass.mock.calls[0][0].channels);
});
it('restores saved ranges, selects the visible clip or full source and adds/removes disjoint ranges',async()=>{
 mount();await screen.findByRole('spinbutton',{name:'Gain'});const choose=screen.getByRole('combobox',{name:'sourceRecall.ranges'}),current=()=>screen.getAllByRole('spinbutton',{name:'sourceRecall.start'}).map(el=>(el as HTMLInputElement).value);
 fireEvent.change(choose,{target:{value:'clip'}});expect(current()).toEqual(['1200']);expect((screen.getByRole('spinbutton',{name:'sourceRecall.end'}) as HTMLInputElement).value).toBe('3600');
 fireEvent.change(choose,{target:{value:'all'}});expect(current()).toEqual(['0']);expect(screen.getByRole('button',{name:'sourceRecall.add'})).toBeDisabled();expect(screen.getByRole('button',{name:'sourceRecall.remove'})).toBeDisabled();
 fireEvent.change(choose,{target:{value:'saved'}});expect(current()).toEqual(['400']);
 // Add a separate range in the first gap without merging the existing one.
 fireEvent.click(screen.getByRole('button',{name:'sourceRecall.add'}));expect(current()).toEqual(['100','400']);fireEvent.click(screen.getAllByRole('button',{name:'sourceRecall.remove'})[0]);expect(current()).toEqual(['400']);
});
it('discarding a preview for an invalid numeric draft never edits the project',async()=>{
 const before=useProjectStore.getState().project;mount();await screen.findByRole('spinbutton',{name:'Gain'});renderPreview();await screen.findByRole('button',{name:'sourceEditor.apply'});
 const start=screen.getByRole('spinbutton',{name:'sourceRecall.start'});fireEvent.focus(start);fireEvent.change(start,{target:{value:'3000'}});fireEvent.blur(start);expect(start).toHaveAttribute('aria-invalid','true');expect(screen.queryByRole('button',{name:'sourceEditor.apply'})).toBeNull();expect(useProjectStore.getState().project).toBe(before);expect(mocks.commit).not.toHaveBeenCalled();
});
it('selects saved effects explicitly, restores their settings and discards drafts when switching',async()=>{
 const {replayFixture}=await import('../../fixtures/sourcePluginReplay');useProjectStore.setState(replayFixture().state);mocks.job.mockImplementation(async(_command,args)=>({...info,state:args.request.state,parameters:info.parameters.map(p=>({...p,value:args.request.parameters.gain}))}));mount();
 expect(await screen.findByRole('spinbutton',{name:'Gain'})).toHaveValue(.25);const choose=screen.getByRole('combobox',{name:'sourceRecall.operation'});expect(choose).toHaveValue('3');fireEvent.change(choose,{target:{value:'1'}});await waitFor(()=>expect(screen.getByRole('spinbutton',{name:'Gain'})).toHaveValue(.5));
 renderPreview();await screen.findByRole('button',{name:'sourceEditor.apply'});expect(mocks.pass.mock.calls.map(([input])=>input.effect.state)).toEqual(['base-a','base-b']);fireEvent.change(screen.getByRole('combobox',{name:'sourceRecall.operation'}),{target:{value:'3'}});await waitFor(()=>expect(screen.getByRole('spinbutton',{name:'Gain'})).toHaveValue(.25));expect(screen.queryByRole('button',{name:'sourceEditor.apply'})).toBeNull();expect(mocks.commit).not.toHaveBeenCalled();
});
it('shows the final all-channel window while editing an earlier effect and translates the clip preset into that effect clock',async()=>{
 const {replayFixture}=await import('../../fixtures/sourcePluginReplay');useProjectStore.setState(replayFixture().state);mount();await screen.findByRole('spinbutton',{name:'Gain'});fireEvent.change(screen.getByRole('combobox',{name:'sourceRecall.operation'}),{target:{value:'1'}});await screen.findByRole('spinbutton',{name:'Gain'});
 await waitFor(()=>{const args=mocks.draw.mock.calls.at(-1)!;expect(args[1]).toHaveLength(2);expect(args[2]).toEqual({start:0,end:4800});expect(args[3]).toEqual([{start:0,end:1400},{start:2400,end:4800}]);});
 fireEvent.change(screen.getByRole('combobox',{name:'sourceRecall.ranges'}),{target:{value:'clip'}});expect(screen.getByRole('spinbutton',{name:'sourceRecall.start'})).toHaveValue(1800);expect(screen.getByRole('spinbutton',{name:'sourceRecall.end'})).toHaveValue(4200);renderPreview();await screen.findByRole('button',{name:'sourceEditor.apply'});fireEvent.click(screen.getByRole('button',{name:'sourceEditor.apply'}));await waitFor(()=>expect(mocks.commit).toHaveBeenCalled());const [plan,prepared]=mocks.commit.mock.calls[0];expect(plan.operationIndex).toBe(1);expect(prepared.pcm[0]).toHaveLength(4800);expect(prepared.selection.ranges).toEqual([{start:1800,end:4200}]);
});
it('keeps epoch invalidation sticky across an operation switch and a same-batch project round trip',async()=>{
 const {replayFixture}=await import('../../fixtures/sourcePluginReplay');useProjectStore.setState(replayFixture().state);mount();await screen.findByRole('spinbutton',{name:'Gain'});
 act(()=>{fireEvent.change(screen.getByRole('combobox',{name:'sourceRecall.operation'}),{target:{value:'1'}});const project=useProjectStore.getState().project;useProjectStore.setState({project:{...project}});useProjectStore.setState({project});});expect(screen.getByRole('button',{name:'sourcePlugins.preview'})).toBeDisabled();expect(screen.getByRole('alert')).toHaveTextContent('sourceRecall.changed');expect(mocks.pass).not.toHaveBeenCalled();
});
it('cancels the complete multi-effect render on unmount and never starts a downstream helper',async()=>{
 const {replayFixture}=await import('../../fixtures/sourcePluginReplay');useProjectStore.setState(replayFixture().state);const gate=deferred<{pcm:Float32Array[];latency:number}>();mocks.pass.mockReturnValue(gate.promise);const view=mount();await screen.findByRole('spinbutton',{name:'Gain'});renderPreview();await waitFor(()=>expect(mocks.pass).toHaveBeenCalledOnce());const [input,signal]=mocks.pass.mock.calls[0];view.unmount();expect(signal.aborted).toBe(true);await act(async()=>gate.resolve({pcm:input.channels,latency:0}));expect(mocks.pass).toHaveBeenCalledOnce();expect(mocks.commit).not.toHaveBeenCalled();
});
