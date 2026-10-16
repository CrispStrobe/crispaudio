import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {AutomationRecorder} from '../../../src/components/timeline/AutomationRecorder';
import {ScopedAutomationRecorder} from '../../../src/components/timeline/ScopedAutomationRecorder';
import {useProjectStore} from '../../../src/stores/projectStore';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('../../../src/i18n',()=>({default:{language:'en',changeLanguage:vi.fn()}}));
import {useSettingsStore} from '../../../src/stores/settingsStore';
import {useUIStore} from '../../../src/stores/uiStore';
import {TimelineEngineContext} from '../../../src/components/timeline/timelineEngineContext';
import type {TimelineEngine} from '../../../src/audio/engine/TimelineEngine';
const noop=()=>{};
afterEach(()=>{cleanup();delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;vi.unstubAllGlobals();vi.restoreAllMocks();});

beforeEach(()=>{useUIStore.setState({timelineRecording:false});useSettingsStore.setState({nativePlaybackMode:'live'});useProjectStore.setState({...useProjectStore.getInitialState(),project:{...useProjectStore.getInitialState().project,duration:4,minimumDuration:4,masterEffects:[{type:'delay',enabled:true,params:{time:.2,mix:.3,feedback:.4}}],nativeEffects:[{instanceId:'fx',pluginId:'au:test',name:'Effect',format:'AU',enabled:true,bypass:false,state:'',parameters:{}}],tracks:[{id:'track',name:'Track',volume:1,pan:0,muted:false,solo:false,segments:[]}]}});});
it('prevents arming a track automation pass when its native audition is unavailable',()=>{
 render(<AutomationRecorder target={{trackId:'track',parameter:'gain'}} onBusy={noop}/>);
 expect(screen.getByRole('combobox',{name:'automation.recordMode'})).toBeDisabled();expect(screen.getByRole('button',{name:'automation.armPass'})).toBeDisabled();
});
it('prevents arming a scoped effect pass without changing its envelope or project',()=>{
 const snapshot=useProjectStore.getState().project;
 render(<ScopedAutomationRecorder snapshot={snapshot} scope="master" index={0} parameter="mix" points={[]} fallback={.3} onDraft={noop} onBusy={noop}/>);
 expect(screen.getByRole('button',{name:'automation.armPass'})).toBeDisabled();expect(screen.getByRole('slider',{name:'automation.recordValue'})).toBeDisabled();expect(useProjectStore.getState().project).toBe(snapshot);
});

function liveMac(){
 Object.assign(window,{__TAURI_INTERNALS__:{}});
 vi.spyOn(navigator,'platform','get').mockReturnValue('MacIntel');vi.spyOn(navigator,'userAgent','get').mockReturnValue('Macintosh');Object.defineProperty(navigator,'maxTouchPoints',{value:0,configurable:true});
 const callbacks=new Map<number,FrameRequestCallback>();let request=0;
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{callbacks.set(++request,callback);return request;});vi.stubGlobal('cancelAnimationFrame',(id:number)=>callbacks.delete(id));
 let time=.5;const previewAutomation=vi.fn(()=>true),engine={previewAutomation,automationClock:()=>({time,start:.5,generation:1})} as unknown as TimelineEngine;
 return {engine,previewAutomation,setTime:(next:number)=>{time=next;},frame:()=>act(()=>{const batch=[...callbacks.values()];callbacks.clear();for(const callback of batch)callback(0);})};
}
it('records a native Live level pass, restores Read and applies it with one Undo',()=>{
 const live=liveMac(),snapshot=useProjectStore.getState().project;useProjectStore.temporal.getState().clear();
 render(<TimelineEngineContext.Provider value={{current:live.engine}}><AutomationRecorder target={{trackId:'track',parameter:'gain'}} onBusy={noop}/></TimelineEngineContext.Provider>);
 expect(screen.getByRole('combobox',{name:'automation.recordMode'})).toBeEnabled();fireEvent.change(screen.getByRole('combobox',{name:'automation.recordMode'}),{target:{value:'touch'}});fireEvent.click(screen.getByRole('button',{name:'automation.armPass'}));
 act(()=>useProjectStore.getState().setIsPlaying(true));live.frame();
 const slider=screen.getByRole('slider',{name:'automation.recordValue'});Object.defineProperty(slider,'setPointerCapture',{value:vi.fn()});fireEvent.pointerDown(slider,{pointerId:1});fireEvent.change(slider,{target:{value:'-6'}});live.setTime(1);live.frame();fireEvent.pointerUp(slider);
 expect(live.previewAutomation).toHaveBeenCalledWith(snapshot,{trackId:'track',parameter:'gain'},10**(-6/20));expect(live.previewAutomation).toHaveBeenLastCalledWith(snapshot,{trackId:'track',parameter:'gain'});
 act(()=>useProjectStore.getState().setIsPlaying(false));expect(useProjectStore.getState().project).toBe(snapshot);fireEvent.click(screen.getByRole('button',{name:'automation.applyPass'}));
 const envelope=useProjectStore.getState().project.tracks[0].automation!;expect(envelope.some(point=>point.time===.5&&Math.abs(point.value-10**(-6/20))<1e-9)).toBe(true);expect(envelope.some(point=>point.time===1)).toBe(true);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
 act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project).toBe(snapshot);
});
it('keeps Preview and microphone capture guarded on Mac',()=>{
 liveMac();useSettingsStore.setState({nativePlaybackMode:'rendered'});
 const view=render(<AutomationRecorder target={{trackId:'track',parameter:'pan'}} onBusy={noop}/>);
 expect(screen.getByRole('combobox',{name:'automation.recordMode'})).toBeDisabled();view.unmount();useSettingsStore.setState({nativePlaybackMode:'live'});useUIStore.setState({timelineRecording:true});
 render(<AutomationRecorder target={{trackId:'track',parameter:'pan'}} onBusy={noop}/>);expect(screen.getByRole('combobox',{name:'automation.recordMode'})).toBeDisabled();
});
it('discards a native pass and its pending review when playback faults',()=>{
 const live=liveMac(),snapshot=useProjectStore.getState().project;
 render(<TimelineEngineContext.Provider value={{current:live.engine}}><AutomationRecorder target={{trackId:'track',parameter:'pan'}} onBusy={noop}/></TimelineEngineContext.Provider>);
 fireEvent.change(screen.getByRole('combobox',{name:'automation.recordMode'}),{target:{value:'write'}});fireEvent.click(screen.getByRole('button',{name:'automation.armPass'}));act(()=>useProjectStore.getState().setIsPlaying(true));live.frame();live.setTime(1);live.frame();
 act(()=>{useProjectStore.getState().setIsPlaying(false);window.dispatchEvent(new CustomEvent('crispaudio-edit-error',{detail:'native fault'}));});
 expect(screen.queryByRole('button',{name:'automation.applyPass'})).not.toBeInTheDocument();expect(useProjectStore.getState().project).toBe(snapshot);
});
it.each(['latch','write'])('keeps a native pan %s pass held after release and reviews it on Stop',mode=>{
 const live=liveMac(),snapshot=useProjectStore.getState().project;
 render(<TimelineEngineContext.Provider value={{current:live.engine}}><AutomationRecorder target={{trackId:'track',parameter:'pan'}} onBusy={noop}/></TimelineEngineContext.Provider>);
 fireEvent.change(screen.getByRole('combobox',{name:'automation.recordMode'}),{target:{value:mode}});fireEvent.click(screen.getByRole('button',{name:'automation.armPass'}));act(()=>useProjectStore.getState().setIsPlaying(true));live.frame();
 const slider=screen.getByRole('slider',{name:'automation.recordValue'});Object.defineProperty(slider,'setPointerCapture',{value:vi.fn()});fireEvent.pointerDown(slider,{pointerId:1});fireEvent.change(slider,{target:{value:'.8'}});live.setTime(1);live.frame();fireEvent.pointerUp(slider);
 expect(live.previewAutomation).toHaveBeenLastCalledWith(snapshot,{trackId:'track',parameter:'pan'},.8);live.setTime(1.5);live.frame();act(()=>useProjectStore.getState().setIsPlaying(false));expect(useProjectStore.getState().project).toBe(snapshot);
 fireEvent.click(screen.getByRole('button',{name:'automation.applyPass'}));const envelope=useProjectStore.getState().project.tracks[0].panAutomation!;expect(envelope.some(point=>point.time===1.5&&point.value===.8)).toBe(true);
});
it('discards a pass if the native graph cannot audition its control',()=>{
 const live=liveMac(),snapshot=useProjectStore.getState().project;live.previewAutomation.mockReturnValue(false);
 render(<TimelineEngineContext.Provider value={{current:live.engine}}><AutomationRecorder target={{trackId:'track',parameter:'gain'}} onBusy={noop}/></TimelineEngineContext.Provider>);
 fireEvent.change(screen.getByRole('combobox',{name:'automation.recordMode'}),{target:{value:'write'}});fireEvent.click(screen.getByRole('button',{name:'automation.armPass'}));act(()=>useProjectStore.getState().setIsPlaying(true));live.frame();
 expect(screen.getByRole('button',{name:'automation.armPass'})).toHaveAttribute('aria-pressed','false');expect(screen.queryByRole('button',{name:'automation.applyPass'})).not.toBeInTheDocument();expect(useProjectStore.getState().project).toBe(snapshot);
});

function trackMix(){const state=useProjectStore.getState();const snapshot={...state.project,tracks:state.project.tracks.map(track=>({...track,effects:[{type:'delay' as const,enabled:true,params:{time:.2,mix:.3}}]}))};useProjectStore.setState({project:snapshot});return snapshot;}
it('records a native track wet/dry pass and publishes it with one Undo',()=>{
 const live=liveMac(),snapshot=trackMix();useProjectStore.temporal.getState().clear();
 render(<TimelineEngineContext.Provider value={{current:live.engine}}><AutomationRecorder target={{trackId:'track',parameter:'mix',effectIndex:0}} onBusy={noop}/></TimelineEngineContext.Provider>);
 fireEvent.change(screen.getByRole('combobox',{name:'automation.recordMode'}),{target:{value:'touch'}});fireEvent.click(screen.getByRole('button',{name:'automation.armPass'}));act(()=>useProjectStore.getState().setIsPlaying(true));live.frame();
 const slider=screen.getByRole('slider',{name:'automation.recordValue'});Object.defineProperty(slider,'setPointerCapture',{value:vi.fn()});fireEvent.pointerDown(slider,{pointerId:1});fireEvent.change(slider,{target:{value:'80'}});live.setTime(1);live.frame();fireEvent.pointerUp(slider);
 expect(live.previewAutomation).toHaveBeenCalledWith(snapshot,{trackId:'track',parameter:'mix',effectIndex:0},.8);act(()=>useProjectStore.getState().setIsPlaying(false));expect(useProjectStore.getState().project).toBe(snapshot);
 fireEvent.click(screen.getByRole('button',{name:'automation.applyPass'}));expect(useProjectStore.getState().project.tracks[0].effects?.[0].automation?.mix).toContainEqual({time:.5,value:.8});expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project).toBe(snapshot);
});

it.each([{type:'delay' as const,parameter:'feedback' as const,held:80},{type:'chorus' as const,parameter:'depth' as const,held:90}])('records native $type $parameter in Write and applies a single reviewed edit',({type,parameter,held})=>{
 const live=liveMac(),state=useProjectStore.getState(),snapshot={...state.project,tracks:state.project.tracks.map(track=>({...track,effects:[{type,enabled:true,params:{mix:.3,feedback:.2,depth:.2}}]}))};useProjectStore.setState({project:snapshot});useProjectStore.temporal.getState().clear();
 render(<TimelineEngineContext.Provider value={{current:live.engine}}><AutomationRecorder target={{trackId:'track',parameter,effectIndex:0}} onBusy={noop}/></TimelineEngineContext.Provider>);
 fireEvent.change(screen.getByRole('combobox',{name:'automation.recordMode'}),{target:{value:'write'}});fireEvent.click(screen.getByRole('button',{name:'automation.armPass'}));act(()=>useProjectStore.getState().setIsPlaying(true));live.frame();
 fireEvent.change(screen.getByRole('slider',{name:'automation.recordValue'}),{target:{value:String(held)}});live.setTime(1);live.frame();expect(live.previewAutomation).toHaveBeenCalledWith(snapshot,{trackId:'track',parameter,effectIndex:0},held/100);
 act(()=>useProjectStore.getState().setIsPlaying(false));expect(useProjectStore.getState().project).toBe(snapshot);fireEvent.click(screen.getByRole('button',{name:'automation.applyPass'}));expect(useProjectStore.getState().project.tracks[0].effects?.[0].automation?.[parameter]).toContainEqual({time:1,value:held/100});expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project).toBe(snapshot);
});

it.each([{type:'delay' as const,parameter:'time' as const,control:700,value:.7},{type:'chorus' as const,parameter:'rate' as const,control:4.7,value:4.7},{type:'ringmod' as const,parameter:'freq' as const,control:731,value:731}])('reviews native $type $parameter passes with one Undo',({type,parameter,control,value})=>{
 const live=liveMac(),state=useProjectStore.getState(),snapshot={...state.project,tracks:state.project.tracks.map(track=>({...track,effects:[{type,enabled:true,params:{mix:.3,time:.2,rate:1.5,freq:200}}]}))};useProjectStore.setState({project:snapshot});useProjectStore.temporal.getState().clear();
 render(<TimelineEngineContext.Provider value={{current:live.engine}}><AutomationRecorder target={{trackId:'track',parameter,effectIndex:0}} onBusy={noop}/></TimelineEngineContext.Provider>);
 fireEvent.change(screen.getByRole('combobox',{name:'automation.recordMode'}),{target:{value:'write'}});fireEvent.click(screen.getByRole('button',{name:'automation.armPass'}));act(()=>useProjectStore.getState().setIsPlaying(true));live.frame();fireEvent.change(screen.getByRole('slider',{name:'automation.recordValue'}),{target:{value:String(control)}});live.setTime(1);live.frame();expect(live.previewAutomation).toHaveBeenCalledWith(snapshot,{trackId:'track',parameter,effectIndex:0},value);
 act(()=>useProjectStore.getState().setIsPlaying(false));expect(useProjectStore.getState().project).toBe(snapshot);fireEvent.click(screen.getByRole('button',{name:'automation.applyPass'}));expect(useProjectStore.getState().project.tracks[0].effects?.[0].automation?.[parameter]).toContainEqual({time:1,value});expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project).toBe(snapshot);
});
