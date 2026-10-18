import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {SourcePluginEffects} from '../../../src/components/timeline/SourcePluginEffects';
import {useProjectStore} from '../../../src/stores/projectStore';
import {useUIStore} from '../../../src/stores/uiStore';
import type {AudioSource,AudioSegment,PluginRecipe} from '../../../src/types/audio';
const mocks=vi.hoisted(()=>({job:vi.fn(),read:vi.fn(),remove:vi.fn(),invoke:vi.fn()}));
vi.mock('../../../src/lib/mediaJob',()=>({mediaJob:mocks.job}));
vi.mock('@tauri-apps/plugin-fs',()=>({readFile:mocks.read,remove:mocks.remove}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.invoke}));
vi.mock('@tauri-apps/plugin-dialog',()=>({open:vi.fn()}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('../../../src/components/shared/ParamSlider',()=>({ParamSlider:({label,value,onChange}:{label:string;value:number;onChange:(v:number)=>void})=><input aria-label={label} type="number" value={value} onChange={e=>onChange(Number(e.target.value))}/> }));
const parameters=[{address:'100',name:'Gain',min:0,max:1,value:.2,unit:''}];
const info={parameters,state:'restored-base',latency:.004};
const result=()=>({...info,state:'post-render-history',path:'/fixture/rendered.wav'});
const pcm=[new Float32Array(4800).fill(.1),new Float32Array(4800).fill(-.1)];
let source:AudioSource,clip:AudioSegment;
function view(saved?:PluginRecipe){
 if(saved){clip={...clip,sourceEdit:{sourceId:'retained',offset:0,operations:[{type:'plugin',channel:-1,ranges:[{start:0,end:4800}],targetDb:0,plugin:saved}]}};useProjectStore.setState({project:{...useProjectStore.getState().project,tracks:[{...useProjectStore.getState().project.tracks[0],segments:[clip]}]}});}
 const callbacks={onPreview:vi.fn(),onBypass:vi.fn(),onInvalidate:vi.fn(),onPrepare:vi.fn(()=>()=>true)};
 const props={source,clip,disabled:false,...callbacks};return {...render(<SourcePluginEffects {...props}/>),callbacks,props};
}
async function choose(){
 fireEvent.click(screen.getByRole('button',{name:'sourcePlugins.scan'}));await screen.findByRole('option',{name:'Fixture · VST3'});
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'vst3:fixture'}});await screen.findByRole('button',{name:'sourcePlugins.preview'});
}
async function prepare(){fireEvent.click(screen.getByRole('button',{name:'sourcePlugins.preview'}));await waitFor(()=>expect(screen.queryByRole('status')).not.toBeInTheDocument());}
function defer<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
beforeEach(()=>{
 vi.clearAllMocks();useUIStore.setState({timelineRecording:false});
 const buffer={length:4800,sampleRate:48000,numberOfChannels:2,duration:.1,getChannelData:(i:number)=>pcm[i]} as AudioBuffer;
 source={id:'source',name:'Source',buffer,filePath:'/fixture/source.wav',duration:.1,sampleRate:48000,channels:2,peaks:{min:new Float32Array(),max:new Float32Array()}};
 clip={id:'clip',sourceId:source.id,trackId:'track',sourceOffset:0,startTime:0,duration:.1,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear',name:'Clip',color:'#123456'};
 const initial=useProjectStore.getInitialState();useProjectStore.setState({...initial,project:{...initial.project,duration:.1,tracks:[{id:'track',name:'Track',volume:1,pan:0,muted:false,solo:false,effects:[],segments:[clip]}]},sources:new Map([[source.id,source]])});
 mocks.job.mockImplementation(async(_command,args)=>args.operation==='plugin-scan'?{plugins:[{id:'vst3:fixture',name:'Fixture',manufacturer:'Fixture',format:'VST3'}],warnings:[]}:args.operation==='plugin-info'?info:result());
 mocks.read.mockResolvedValue(new Uint8Array(8));mocks.remove.mockResolvedValue(undefined);
 vi.stubGlobal('OfflineAudioContext',class {decodeAudioData=vi.fn(async()=>buffer);});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
it('uses the same restored base for repeated renders and recipes, never post-render DSP history',async()=>{
 const {callbacks}=view();await choose();await prepare();
 fireEvent.change(screen.getByRole('spinbutton',{name:'Gain'}),{target:{value:'.7'}});await prepare();
 const requests=mocks.job.mock.calls.filter(([,args])=>args.operation==='plugin-render').map(([,args])=>args.request);
 expect(requests.map(r=>r.state)).toEqual(['restored-base','restored-base']);expect(requests.map(r=>r.parameters)).toEqual([{'100':.2},{'100':.7}]);
 expect(callbacks.onPreview.mock.calls.map(([,recipe])=>recipe.state)).toEqual(['restored-base','restored-base']);
 expect(callbacks.onPreview).toHaveBeenLastCalledWith(pcm,expect.objectContaining({parameters:{'100':.7},latency:.004}));
 expect(mocks.remove).toHaveBeenCalledTimes(2);expect(source.buffer.getChannelData(0)).toBe(pcm[0]);
});
it('restores saved parameters together with saved state before reporting controls',async()=>{
 const {callbacks}=view({id:'vst3:fixture',name:'Fixture',parameters:{'100':.6},state:'saved-base',latency:.004});
 mocks.job.mockImplementation(async(_command,args)=>args.operation==='plugin-info'?{...info,state:'normalized-saved',parameters:[{...parameters[0],value:.6}]}:result());
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'vst3:fixture'}});await screen.findByRole('button',{name:'sourcePlugins.preview'});
 expect(mocks.job).toHaveBeenCalledWith('audio_unit_plugin',expect.objectContaining({operation:'plugin-info',request:{id:'vst3:fixture',state:'saved-base',parameters:{'100':.6}}}),expect.any(AbortSignal));
 expect(screen.getByRole('spinbutton',{name:'Gain'})).toHaveValue(.6);await prepare();expect(callbacks.onPreview).toHaveBeenCalledWith(pcm,expect.objectContaining({state:'normalized-saved',parameters:{'100':.6}}));
});
it('invalidates the prepared result immediately on parameter edits and discards a late render',async()=>{
 const {callbacks}=view();await choose();const pending=defer<ReturnType<typeof result>>();mocks.job.mockImplementationOnce(()=>pending.promise);
 fireEvent.click(screen.getByRole('button',{name:'sourcePlugins.preview'}));const signal=mocks.job.mock.calls.at(-1)![2] as AbortSignal,prior=callbacks.onInvalidate.mock.calls.length;
 fireEvent.change(screen.getByRole('spinbutton',{name:'Gain'}),{target:{value:'.9'}});
 expect(signal.aborted).toBe(true);expect(callbacks.onInvalidate).toHaveBeenCalledTimes(prior+1);
 await act(async()=>pending.resolve(result()));expect(callbacks.onPreview).not.toHaveBeenCalled();expect(mocks.remove).toHaveBeenCalledWith('/fixture/rendered.wav');
});
it('suppresses late metadata after choosing a different effect or clearing the selection',async()=>{
 view();fireEvent.click(screen.getByRole('button',{name:'sourcePlugins.scan'}));await screen.findByRole('option',{name:'Fixture · VST3'});
 const pending=defer<typeof info>();mocks.job.mockImplementationOnce(()=>pending.promise);
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'vst3:fixture'}});
 // Programmatic change models an already-dispatched selection event while info is pending.
 fireEvent.change(screen.getByRole('combobox'),{target:{value:''}});
 await act(async()=>pending.resolve(info));expect(screen.queryByRole('button',{name:'sourcePlugins.preview'})).not.toBeInTheDocument();expect(screen.getByRole('combobox')).toHaveValue('');
});
it.each(['cancel','disabled','unmount','recording','project','source','selection'] as const)('does not publish a pending render after %s',async action=>{
 const v=view();await choose();let current=true;v.callbacks.onPrepare.mockImplementation(()=>()=>current);const pending=defer<ReturnType<typeof result>>();mocks.job.mockImplementationOnce(()=>pending.promise);
 fireEvent.click(screen.getByRole('button',{name:'sourcePlugins.preview'}));
 if(action==='cancel')fireEvent.click(screen.getByRole('button',{name:'common.cancel'}));
 if(action==='disabled')v.rerender(<SourcePluginEffects {...v.props} disabled/>);
 if(action==='unmount')v.unmount();
 if(action==='recording')useUIStore.setState({timelineRecording:true});
 if(action==='project')useProjectStore.setState({project:{...useProjectStore.getState().project,name:'Other'}});
 if(action==='source')useProjectStore.setState({sources:new Map([[source.id,{...source,buffer:{...source.buffer} as AudioBuffer}]])});
 if(action==='selection')current=false;
 await act(async()=>pending.resolve(result()));
 expect(v.callbacks.onPreview).not.toHaveBeenCalled();
 expect(mocks.remove).toHaveBeenCalledWith('/fixture/rendered.wav');
});

it('debounces automatic preview after rapid edits using only the latest parameters and stable base',async()=>{
 const v=view();await choose();fireEvent.click(screen.getByRole('checkbox',{name:'sourcePlugins.autoPreview'}));
 for(const value of ['.3','.5','.8'])fireEvent.change(screen.getByRole('spinbutton',{name:'Gain'}),{target:{value}});
 await waitFor(()=>expect(v.callbacks.onPreview).toHaveBeenCalledOnce());
 const renders=mocks.job.mock.calls.filter(([,args])=>args.operation==='plugin-render');
 expect(renders).toHaveLength(1);expect(renders[0][1].request).toMatchObject({parameters:{'100':.8},state:'restored-base'});
});
it('keeps a newer render intact when a cancelled old job eventually fails',async()=>{
 const v=view();await choose();let reject!:(error:Error)=>void;mocks.job.mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail;}));
 fireEvent.click(screen.getByRole('button',{name:'sourcePlugins.preview'}));
 fireEvent.change(screen.getByRole('spinbutton',{name:'Gain'}),{target:{value:'.6'}});await prepare();
 await act(async()=>reject(new Error('old failure')));expect(screen.queryByRole('alert')).not.toBeInTheDocument();
 expect(v.callbacks.onPreview).toHaveBeenCalledOnce();expect(v.callbacks.onPreview).toHaveBeenCalledWith(pcm,expect.objectContaining({parameters:{'100':.6}}));
});
