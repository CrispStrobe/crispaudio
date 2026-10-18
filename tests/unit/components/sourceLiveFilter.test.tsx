import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import '../../../src/i18n';
import {SourceLiveFilter} from '../../../src/components/timeline/SourceLiveFilter';
import {renderSourceFilter} from '../../../src/audio/engine/SourceFilter';
import {useProjectStore} from '../../../src/stores/projectStore';
vi.mock('../../../src/audio/engine/SourceFilter',async original=>({...await original<object>(),renderSourceFilter:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const channels=[new Float32Array(4800)],ranges=[{start:0,end:4800}];
function fixture(){let resolve!:(pcm:Float32Array[])=>void;vi.mocked(renderSourceFilter).mockImplementation(()=>new Promise(done=>{resolve=done;}));const props={channels,ranges,rate:48000,channel:-1,disabled:false,active:true,onPrepare:()=>()=>true,onPreview:vi.fn(),onChange:vi.fn()},view=render(<SourceLiveFilter {...props}/>);fireEvent.click(screen.getByText('Live effects',{exact:true}));return {props,view,finish:()=>resolve(channels),prepare:()=>fireEvent.click(screen.getByRole('button',{name:'Prepare',exact:true}))};}
it('publishes a prepared preview only after the render finishes',async()=>{const h=fixture();h.prepare();expect(h.props.onPreview).not.toHaveBeenCalled();await act(async()=>h.finish());expect(h.props.onPreview).toHaveBeenCalledWith(channels,{highpass:80,lowpass:16000,gainDb:0});});
it('cancels a prepared preview when live parameters change',async()=>{const h=fixture();h.prepare();fireEvent.change(screen.getByRole('slider',{name:'High-pass',exact:true}),{target:{value:'200'}});expect(h.props.onChange).toHaveBeenCalledWith({highpass:200,lowpass:16000,gainDb:0});expect(vi.mocked(renderSourceFilter).mock.calls[0][5].aborted).toBe(true);await act(async()=>h.finish());expect(h.props.onPreview).not.toHaveBeenCalled();});
it('rejects late renders after source-map replacement even when project identity stays the same',async()=>{const h=fixture();h.prepare();useProjectStore.setState({sources:new Map(useProjectStore.getState().sources)});await act(async()=>h.finish());expect(h.props.onPreview).not.toHaveBeenCalled();});
it('aborts selection invalidation and unmount',async()=>{const h=fixture();h.prepare();const first=vi.mocked(renderSourceFilter).mock.calls[0][5];h.view.rerender(<SourceLiveFilter {...h.props} ranges={[{start:10,end:100}]}/>);expect(first.aborted).toBe(true);await act(async()=>h.finish());expect(h.props.onPreview).not.toHaveBeenCalled();h.prepare();const last=vi.mocked(renderSourceFilter).mock.calls.at(-1)![5];h.view.unmount();expect(last.aborted).toBe(true);});

it('discards work superseded by a different preview or by project replacement',async()=>{
 const h=fixture();let current=true;h.view.rerender(<SourceLiveFilter {...h.props} onPrepare={()=>()=>current}/>);h.prepare();current=false;await act(async()=>h.finish());expect(h.props.onPreview).not.toHaveBeenCalled();
 current=true;h.prepare();useProjectStore.setState({project:{...useProjectStore.getState().project}});await act(async()=>h.finish());expect(h.props.onPreview).not.toHaveBeenCalled();
});
it('cancels recording-state invalidation and the explicit Cancel button',async()=>{
 const h=fixture();h.prepare();fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}));expect(vi.mocked(renderSourceFilter).mock.calls[0][5].aborted).toBe(true);await act(async()=>h.finish());expect(h.props.onPreview).not.toHaveBeenCalled();
 h.prepare();h.view.rerender(<SourceLiveFilter {...h.props} disabled/>);expect(vi.mocked(renderSourceFilter).mock.calls.at(-1)![5].aborted).toBe(true);await act(async()=>h.finish());expect(h.props.onPreview).not.toHaveBeenCalled();
});

it('waits for background rendering before allocating Prepare, and respects cancellation while waiting',async()=>{
 const h=fixture();let release!:()=>void;const beforeRender=vi.fn(()=>new Promise<void>(resolve=>{release=resolve;})),onBusyChange=vi.fn();h.view.rerender(<SourceLiveFilter {...h.props} beforeRender={beforeRender} onBusyChange={onBusyChange}/>);h.prepare();expect(beforeRender).toHaveBeenCalledOnce();expect(onBusyChange).toHaveBeenCalledWith(true);expect(renderSourceFilter).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}));await act(async()=>release());expect(renderSourceFilter).not.toHaveBeenCalled();expect(h.props.onPreview).not.toHaveBeenCalled();expect(onBusyChange).toHaveBeenLastCalledWith(false);
 h.prepare();await act(async()=>release());expect(renderSourceFilter).toHaveBeenCalledOnce();await act(async()=>h.finish());expect(h.props.onPreview).toHaveBeenCalledOnce();expect(onBusyChange).toHaveBeenLastCalledWith(false);
});

it('allows disabling an active filter when a source/channel choice becomes unsupported',()=>{
 const h=fixture();h.view.rerender(<SourceLiveFilter {...h.props} disabled/>);const enabled=screen.getByRole('checkbox',{name:'Enabled',exact:true});expect(enabled).not.toBeDisabled();fireEvent.click(enabled);expect(h.props.onChange).toHaveBeenCalledWith(null);expect(screen.getByRole('button',{name:'Prepare',exact:true})).toBeDisabled();
});
