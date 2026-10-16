import {NativeParameterAutomation} from '../../../src/components/timeline/NativeParameterAutomation';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {AutomationRecorder} from '../../../src/components/timeline/AutomationRecorder';
import {ScopedEffectAutomation} from '../../../src/components/timeline/ScopedEffectAutomation';
import {ScopedAutomationRecorder} from '../../../src/components/timeline/ScopedAutomationRecorder';
import {useProjectStore} from '../../../src/stores/projectStore';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('../../../src/hooks/useAudioEngine',()=>({useAudioEngine:()=>({resume:vi.fn().mockResolvedValue(undefined)})}));
vi.mock('../../../src/i18n',()=>({default:{language:'en',changeLanguage:vi.fn()}}));
import {useSettingsStore} from '../../../src/stores/settingsStore';
import {useUIStore} from '../../../src/stores/uiStore';
import {TimelineEngineContext} from '../../../src/components/timeline/timelineEngineContext';
import type {TimelineEngine} from '../../../src/audio/engine/TimelineEngine';
const noop=()=>{};
afterEach(()=>{cleanup();delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;vi.unstubAllGlobals();vi.restoreAllMocks();});

beforeEach(()=>{for(const track of useProjectStore.getState().project.tracks)if(track.locked)useProjectStore.getState().updateTrack(track.id,{locked:false});useUIStore.setState({timelineRecording:false});useSettingsStore.setState({nativePlaybackMode:'live'});useProjectStore.setState({...useProjectStore.getInitialState(),project:{...useProjectStore.getInitialState().project,duration:4,minimumDuration:4,masterEffects:[{type:'delay',enabled:true,params:{time:.2,mix:.3,feedback:.4}}],nativeEffects:[{instanceId:'fx',pluginId:'au:test',name:'Effect',format:'AU',enabled:true,bypass:false,state:'',parameters:{}}],tracks:[{id:'track',name:'Track',volume:1,pan:0,muted:false,solo:false,segments:[]}]}});});
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
 let time=.5;const previewAutomation=vi.fn(()=>true),previewEffectAutomation=vi.fn(()=>true),previewNativeParameterAutomation=vi.fn(()=>true),engine={previewAutomation,previewEffectAutomation,previewNativeParameterAutomation,automationClock:()=>({time,start:.5,generation:1})} as unknown as TimelineEngine;
 return {engine,previewAutomation,previewEffectAutomation,previewNativeParameterAutomation,setTime:(next:number)=>{time=next;},frame:()=>act(()=>{const batch=[...callbacks.values()];callbacks.clear();for(const callback of batch)callback(0);})};
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

function scopedProject(scope:string){
 const state=useProjectStore.getState(),effect={type:'delay' as const,enabled:true,params:{time:.2,mix:.3,feedback:.4}};
 const snapshot={...state.project,masterEffects:[effect],tracks:state.project.tracks.map(track=>({...track,segments:[{id:'clip',trackId:track.id,sourceId:'s',name:'Clip',color:'#fff',startTime:.25,sourceOffset:0,duration:2,gain:1,effects:[structuredClone(effect)],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear' as const,fadeOutCurve:'linear' as const}]}))};
 useProjectStore.setState({project:snapshot});return {snapshot,original:scope==='master'?snapshot.masterEffects[0]:snapshot.tracks[0].segments[0].effects[0]};
}
it.each(['master','clip:clip'])('records a native %s pass through the inspector and applies one Undo',scope=>{
 const live=liveMac(),{snapshot,original}=scopedProject(scope);useProjectStore.temporal.getState().clear();
 render(<TimelineEngineContext.Provider value={{current:live.engine}}><ScopedEffectAutomation snapshot={snapshot} original={original} scope={scope} index={0} onClose={noop}/></TimelineEngineContext.Provider>);
 const details=document.querySelector('[data-scoped-record-section]')!;act(()=>{details.setAttribute('open','');details.dispatchEvent(new Event('toggle'));});
 fireEvent.change(screen.getByRole('combobox',{name:'automation.recordMode'}),{target:{value:'write'}});fireEvent.click(screen.getByRole('button',{name:'automation.armPass'}));act(()=>useProjectStore.getState().setIsPlaying(true));live.frame();
 fireEvent.change(screen.getByRole('slider',{name:'automation.recordValue'}),{target:{value:'70'}});live.setTime(1);live.frame();expect(live.previewEffectAutomation).toHaveBeenCalledWith(snapshot,scope,0,'mix',.7);
 act(()=>useProjectStore.getState().setIsPlaying(false));expect(live.previewEffectAutomation).toHaveBeenLastCalledWith(snapshot,scope,0,'mix');expect(useProjectStore.getState().project).toBe(snapshot);
 fireEvent.click(screen.getByRole('button',{name:'fxInspector.usePass'}));expect(useProjectStore.getState().project).toBe(snapshot);fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));
 const project=useProjectStore.getState().project,effect=scope==='master'?project.masterEffects[0]:project.tracks[0].segments[0].effects[0];expect(effect.automation?.mix).toContainEqual({time:1,value:.7});expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project).toBe(snapshot);
});
it('guards native scoped passes in Preview, during capture and on locked clips',()=>{
 liveMac();const {snapshot}=scopedProject('clip:clip');useSettingsStore.setState({nativePlaybackMode:'rendered'});
 const view=render(<ScopedAutomationRecorder snapshot={snapshot} scope="clip:clip" index={0} parameter="mix" points={[]} fallback={.3} onDraft={noop} onBusy={noop}/>);expect(screen.getByRole('button',{name:'automation.armPass'})).toBeDisabled();view.unmount();
 useSettingsStore.setState({nativePlaybackMode:'live'});useUIStore.setState({timelineRecording:true});const capture=render(<ScopedAutomationRecorder snapshot={snapshot} scope="master" index={0} parameter="mix" points={[]} fallback={.3} onDraft={noop} onBusy={noop}/>);expect(screen.getByRole('button',{name:'automation.armPass'})).toBeDisabled();capture.unmount();
 useUIStore.setState({timelineRecording:false});const locked={...snapshot,tracks:snapshot.tracks.map(track=>({...track,locked:true}))};useProjectStore.setState({project:locked});render(<ScopedAutomationRecorder snapshot={locked} scope="clip:clip" index={0} parameter="mix" points={[]} fallback={.3} onDraft={noop} onBusy={noop}/>);expect(screen.getByRole('button',{name:'automation.armPass'})).toBeDisabled();
});
it.each(['failed audition','native fault','mode change'])('discards a native scoped draft on %s',cause=>{
 const live=liveMac(),{snapshot}=scopedProject('master'),onDraft=vi.fn();if(cause==='failed audition')live.previewEffectAutomation.mockReturnValue(false);
 render(<TimelineEngineContext.Provider value={{current:live.engine}}><ScopedAutomationRecorder snapshot={snapshot} scope="master" index={0} parameter="mix" points={[]} fallback={.3} onDraft={onDraft} onBusy={noop}/></TimelineEngineContext.Provider>);
 expect(screen.getByRole('button',{name:'automation.armPass'})).toBeEnabled();fireEvent.change(screen.getByRole('combobox',{name:'automation.recordMode'}),{target:{value:'write'}});fireEvent.click(screen.getByRole('button',{name:'automation.armPass'}));expect(screen.getByRole('button',{name:'automation.discardPass'})).toHaveAttribute('aria-pressed','true');act(()=>useProjectStore.getState().setIsPlaying(true));live.frame();live.setTime(1);live.frame();
 if(cause==='native fault'){expect(live.previewEffectAutomation).toHaveBeenCalledWith(snapshot,'master',0,'mix',.3);act(()=>useProjectStore.getState().setIsPlaying(false));expect(screen.getByRole('button',{name:'fxInspector.usePass'})).toBeInTheDocument();act(()=>window.dispatchEvent(new CustomEvent('crispaudio-edit-error')));}
 if(cause==='mode change'){act(()=>useSettingsStore.setState({nativePlaybackMode:'rendered'}));live.frame();}
 expect(screen.queryByRole('button',{name:'fxInspector.usePass'})).not.toBeInTheDocument();expect(onDraft).not.toHaveBeenCalled();expect(useProjectStore.getState().project).toBe(snapshot);expect(screen.getByRole('button',{name:'automation.armPass'})).toHaveAttribute('aria-pressed','false');
});

const pluginTarget={instanceId:'fx',address:'gain',min:-24,max:12};
function pluginScope(scope:string){
 const {snapshot:base}=scopedProject('clip:clip');const effect={...base.nativeEffects![0],parameters:{gain:-6}};
 const snapshot={...base,nativeEffects:scope==='master'?[effect]:[],tracks:base.tracks.map(track=>({...track,nativeEffects:scope==='track:track'?[effect]:[],segments:track.segments.map(clip=>({...clip,nativeEffects:scope==='clip:clip'?[effect]:[]}))}))};
 useProjectStore.setState({project:snapshot});return snapshot;
}
it.each([['master','write'],['track:track','touch'],['clip:clip','latch']])('records a native plug-in %s pass in %s with review and one Undo', (scope,mode)=>{
 const live=liveMac(),snapshot=pluginScope(scope);useProjectStore.temporal.getState().clear();
 render(<TimelineEngineContext.Provider value={{current:live.engine}}><NativeParameterAutomation snapshot={snapshot} scope={scope} target={pluginTarget} name="Gain" unit="dB" onClose={noop}/></TimelineEngineContext.Provider>);
 fireEvent.change(screen.getByRole('combobox',{name:'automation.recordMode'}),{target:{value:mode}});fireEvent.click(screen.getByRole('button',{name:'automation.armPass'}));act(()=>useProjectStore.getState().setIsPlaying(true));live.frame();
 const slider=screen.getByRole('slider',{name:'automation.recordValue'});Object.defineProperty(slider,'setPointerCapture',{value:vi.fn()});fireEvent.pointerDown(slider,{pointerId:1});fireEvent.change(slider,{target:{value:'3'}});live.setTime(1);live.frame();fireEvent.pointerUp(slider);
 expect(live.previewNativeParameterAutomation).toHaveBeenCalledWith(snapshot,scope,expect.objectContaining(pluginTarget),.75);
 act(()=>useProjectStore.getState().setIsPlaying(false));expect(live.previewNativeParameterAutomation).toHaveBeenLastCalledWith(snapshot,scope,expect.objectContaining(pluginTarget));expect(useProjectStore.getState().project).toBe(snapshot);
 fireEvent.click(screen.getByRole('button',{name:'fxInspector.usePass'}));expect(useProjectStore.getState().project).toBe(snapshot);fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));
 const project=useProjectStore.getState().project,effect=scope==='master'?project.nativeEffects![0]:scope==='track:track'?project.tracks[0].nativeEffects![0]:project.tracks[0].segments[0].nativeEffects![0];
 expect(effect.parameterAutomation?.gain.points).toContainEqual({time:1,value:.75});expect(effect.state).toBe(snapshot.nativeEffects?.[0]?.state??snapshot.tracks[0].nativeEffects?.[0]?.state??snapshot.tracks[0].segments[0].nativeEffects![0].state);expect(effect.parameters).toEqual({gain:-6});
 expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project).toBe(snapshot);
});
it.each(['failed audition','mode change','native fault'])('discards native plugin capture on %s',cause=>{
 const live=liveMac(),snapshot=pluginScope('master');if(cause==='failed audition')live.previewNativeParameterAutomation.mockReturnValue(false);
 render(<TimelineEngineContext.Provider value={{current:live.engine}}><NativeParameterAutomation snapshot={snapshot} scope="master" target={pluginTarget} name="Gain" unit="dB" onClose={noop}/></TimelineEngineContext.Provider>);
 fireEvent.change(screen.getByRole('combobox',{name:'automation.recordMode'}),{target:{value:'write'}});fireEvent.click(screen.getByRole('button',{name:'automation.armPass'}));act(()=>useProjectStore.getState().setIsPlaying(true));live.frame();live.setTime(1);live.frame();
 if(cause==='mode change'){act(()=>useSettingsStore.setState({nativePlaybackMode:'rendered'}));live.frame();}
 if(cause==='native fault'){act(()=>useProjectStore.getState().setIsPlaying(false));expect(screen.getByRole('button',{name:'fxInspector.usePass'})).toBeInTheDocument();act(()=>window.dispatchEvent(new CustomEvent('crispaudio-edit-error')));}
 expect(screen.queryByRole('button',{name:'fxInspector.usePass'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'automation.armPass'})).toHaveAttribute('aria-pressed','false');expect(useProjectStore.getState().project).toBe(snapshot);
});
it('guards plugin passes in Preview, during recording and on locked tracks',()=>{
 liveMac();const snapshot=pluginScope('track:track'),props={snapshot,scope:'track:track',target:pluginTarget,name:'Gain',unit:'dB',onClose:noop};
 useSettingsStore.setState({nativePlaybackMode:'rendered'});const preview=render(<NativeParameterAutomation {...props}/>);expect(screen.getByRole('button',{name:'automation.armPass'})).toBeDisabled();preview.unmount();
 useSettingsStore.setState({nativePlaybackMode:'live'});useUIStore.setState({timelineRecording:true});const recording=render(<NativeParameterAutomation {...props}/>);expect(screen.getByRole('button',{name:'automation.armPass'})).toBeDisabled();recording.unmount();useUIStore.setState({timelineRecording:false});
 const locked={...snapshot,tracks:snapshot.tracks.map(track=>({...track,locked:true}))};useProjectStore.setState({project:locked});render(<NativeParameterAutomation {...props} snapshot={locked}/>);expect(screen.getByRole('button',{name:'automation.armPass'})).toBeDisabled();
});
it('requires clearing an old parameter range before recording with changed plugin metadata',()=>{
 liveMac();const old=pluginScope('master'),snapshot={...old,nativeEffects:old.nativeEffects.map(effect=>({...effect,parameterAutomation:{gain:{min:-12,max:12,points:[{time:0,value:.5}]}}}))};useProjectStore.setState({project:snapshot});
 render(<NativeParameterAutomation snapshot={snapshot} scope="master" target={pluginTarget} name="Gain" unit="dB" onClose={noop}/>);expect(screen.getByRole('alert')).toHaveTextContent('nativeRack.rangeChanged');expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'fxInspector.clear'}));expect(screen.getByRole('button',{name:'automation.armPass'})).toBeEnabled();expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeEnabled();
});
