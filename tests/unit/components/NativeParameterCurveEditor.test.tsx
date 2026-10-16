import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {NativeParameterAutomation} from '../../../src/components/timeline/NativeParameterAutomation';
import {useProjectStore} from '../../../src/stores/projectStore';
import {useUIStore} from '../../../src/stores/uiStore';
import type {NativeEffect,TimelineProject} from '../../../src/types/audio';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('../../../src/i18n',()=>({default:{language:'en',changeLanguage:vi.fn()}}));
vi.mock('../../../src/hooks/useAudioEngine',()=>({useAudioEngine:()=>({resume:vi.fn().mockResolvedValue(undefined)})}));
const target={instanceId:'fx',address:'gain',min:-24,max:12,defaultValue:-6};
const fx=():NativeEffect=>({instanceId:'fx',pluginId:'au:test',name:'Gain',format:'AU',enabled:true,bypass:false,state:'opaque',parameters:{gain:-6,other:7},parameterAutomation:{gain:{min:-24,max:12,points:[{time:1,value:.25},{time:3,value:.75}]},other:{min:0,max:10,points:[{time:0,value:.7}]}}});
function fixture(scope='master'):TimelineProject{const initial=useProjectStore.getInitialState().project;return {...initial,id:crypto.randomUUID(),duration:4,minimumDuration:4,nativeEffects:scope==='master'?[fx()]:[],tracks:[{id:'t',name:'Track',volume:1,pan:0,muted:false,solo:false,nativeEffects:scope==='track:t'?[fx()]:[],segments:[{id:'c',trackId:'t',sourceId:'s',name:'clip',color:'#fff',startTime:1,duration:3,sourceOffset:0,gain:1,effects:[],nativeEffects:scope==='clip:c'?[fx()]:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'}]}]};}
const effect=(scope='master')=>{const p=useProjectStore.getState().project;return scope==='master'?p.nativeEffects![0]:scope==='track:t'?p.tracks[0].nativeEffects![0]:p.tracks[0].segments[0].nativeEffects![0];};
beforeEach(()=>{for(const track of useProjectStore.getState().project.tracks)if(track.locked)useProjectStore.getState().updateTrack(track.id,{locked:false});useUIStore.setState({timelineRecording:false});});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
function open(scope='master',snapshot=fixture(scope)){
 useProjectStore.getState().loadProjectState(snapshot,new Map());snapshot=useProjectStore.getState().project;useProjectStore.temporal.getState().clear();const close=vi.fn();
 const view=render(<NativeParameterAutomation snapshot={snapshot} scope={scope} target={target} name="Gain" unit="dB" onClose={close}/>);return {snapshot,close,...view};
}
function number(label:string,value:string){const input=screen.getByRole('spinbutton',{name:label});act(()=>input.focus());fireEvent.change(input,{target:{value}});act(()=>input.blur());return input;}
function graph(){const svg=screen.getByRole('img',{name:'fxInspector.curve'});vi.spyOn(svg,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:600,height:160,right:600,bottom:160,x:0,y:0,toJSON:()=>({})});Object.defineProperty(svg,'setPointerCapture',{value:vi.fn()});return svg;}
// Keep touch/pen coordinates and pointer IDs on jsdom's native MouseEvent implementation.
function pointer(node:HTMLElement|SVGElement,type:string,x:number,y:number,extra:Record<string,unknown>={}){const event=new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperties(event,Object.fromEntries(Object.entries({pointerId:1,pointerType:'mouse',...extra}).map(([key,value])=>[key,{value}])));fireEvent(node,event);}
it.each(['master','track:t','clip:c'])('edits time/value/Step in %s units, preserves other lanes/state and publishes one Undo',scope=>{
 const {snapshot}=open(scope);expect(screen.queryByRole('button',{name:'automation.armPass'})).toBeNull();number('fxInspector.point','1');number('fxInspector.value (dB)','-6');number('fxInspector.time','2');fireEvent.change(screen.getByRole('combobox',{name:'fxInspector.segment'}),{target:{value:'step'}});
 expect(useProjectStore.getState().project).toBe(snapshot);fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));expect(effect(scope).parameterAutomation!.gain.points[0]).toEqual({time:2,value:.5,curve:'step'});expect(effect(scope).parameterAutomation!.other).toEqual(fx().parameterAutomation!.other);expect(effect(scope).state).toBe('opaque');expect(effect(scope).parameters).toEqual(fx().parameters);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project).toBe(snapshot);act(()=>useProjectStore.temporal.getState().redo());expect(effect(scope).parameterAutomation!.gain.points[0].time).toBe(2);
});
it.each(['mouse','touch','pen'])('drags a point with %s, updates the curve live and leaves saved project untouched until Apply',pointerType=>{
 const {snapshot}=open(),svg=graph(),path=svg.querySelector('path')!.getAttribute('d');pointer(svg,'pointerdown',156,114,{pointerType});expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeDisabled();pointer(svg,'pointermove',300,80,{pointerType});expect(svg.querySelector('path')!.getAttribute('d')).not.toBe(path);expect(useProjectStore.getState().project).toBe(snapshot);pointer(svg,'pointerup',300,80,{pointerType});fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));expect(effect().parameterAutomation!.gain.points[0]).toEqual({time:2,value:.5});
});
it.each(['pointercancel','lostpointercapture','Escape','blur'])('rolls back the whole gesture on %s, including temporary point collisions',cause=>{
 open();const svg=graph(),before=svg.querySelector('path')!.getAttribute('d');pointer(svg,'pointerdown',156,114);expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeDisabled();pointer(svg,'pointermove',444,12);expect(svg.querySelector('path')!.getAttribute('d')).not.toBe(before);pointer(svg,'pointermove',300,80);
 if(cause==='Escape')fireEvent.keyDown(svg,{key:'Escape'});else if(cause==='blur')fireEvent(window,new Event('blur'));else pointer(svg,cause,300,80);
 expect(svg.querySelector('path')!.getAttribute('d')).toBe(before);fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);expect(effect().parameterAutomation!.gain.points).toEqual(fx().parameterAutomation!.gain.points);
});
it('adds at the playhead or by tapping the graph, deletes, clears and cancels without publishing drafts',()=>{
 const {snapshot}=open();act(()=>useProjectStore.getState().setPlayheadPosition(2));fireEvent.click(screen.getByRole('button',{name:'fxInspector.add'}));expect(screen.getByRole('spinbutton',{name:'fxInspector.value (dB)'})).toHaveValue(-6);fireEvent.click(screen.getByRole('button',{name:'fxInspector.remove'}));const svg=graph();pointer(svg,'pointerdown',300,80,{pointerType:'touch'});pointer(svg,'pointerup',300,80,{pointerType:'touch'});fireEvent.click(screen.getByRole('button',{name:'fxInspector.clear'}));fireEvent.click(screen.getByRole('button',{name:'common.cancel'}));expect(useProjectStore.getState().project).toBe(snapshot);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
});
it('previews numeric changes visually and Escape cancels them without changing the draft',()=>{
 open();number('fxInspector.point','1');const svg=graph(),before=svg.querySelector('path')!.getAttribute('d'),input=screen.getByRole('spinbutton',{name:'fxInspector.value (dB)'});act(()=>input.focus());fireEvent.change(input,{target:{value:'6'}});expect(svg.querySelector('path')!.getAttribute('d')).not.toBe(before);act(()=>input.focus());fireEvent.keyDown(input,{key:'Escape'});expect(svg.querySelector('path')!.getAttribute('d')).toBe(before);fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
});
it('blocks stale, locked and microphone-capture edits and keeps invalid numeric input out of saved points',()=>{
 const {snapshot}=open();number('fxInspector.point','1');const input=number('fxInspector.value (dB)','100');expect(input).toHaveAttribute('aria-invalid','true');expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeDisabled();act(()=>input.focus());fireEvent.keyDown(input,{key:'Escape'});expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeEnabled();expect(useProjectStore.getState().project).toBe(snapshot);act(()=>useUIStore.setState({timelineRecording:true}));expect(screen.getByRole('button',{name:'fxInspector.add'})).toBeDisabled();act(()=>useUIStore.setState({timelineRecording:false}));act(()=>useProjectStore.getState().updateTrack('t',{name:'changed'}));expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeDisabled();expect(screen.getByRole('status')).toHaveTextContent('fxInspector.stale');
});
it('keeps dense curve rendering bounded and can select/edit a point omitted from the overview',()=>{
 const snapshot=fixture();snapshot.nativeEffects![0].parameterAutomation!.gain.points=Array.from({length:10000},(_,i)=>({time:i/1000,value:.5}));open('master',snapshot);const svg=graph();expect(svg.querySelectorAll('circle').length).toBeLessThan(2100);number('fxInspector.point','4322');number('fxInspector.value (dB)','12');fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));expect(effect().parameterAutomation!.gain.points[4321]).toMatchObject({time:4.321,value:1});expect(effect().parameterAutomation!.gain.points).toHaveLength(10000);
});

it('scrubs numeric values on touch with live curve feedback and cancels without publishing',()=>{
 open();number('fxInspector.point','1');const svg=graph(),before=svg.querySelector('path')!.getAttribute('d'),input=screen.getByRole('spinbutton',{name:'fxInspector.value (dB)'});Object.defineProperty(input,'setPointerCapture',{value:vi.fn()});
 pointer(input,'pointerdown',100,100,{pointerType:'touch'});pointer(input,'pointermove',100,60,{pointerType:'touch'});expect(svg.querySelector('path')!.getAttribute('d')).not.toBe(before);pointer(input,'pointercancel',100,60,{pointerType:'touch'});expect(svg.querySelector('path')!.getAttribute('d')).toBe(before);fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
});
it('protects the manual editor on a locked track',()=>{
 const snapshot=fixture('track:t');snapshot.tracks[0].locked=true;open('track:t',snapshot);expect(screen.getByRole('img',{name:'fxInspector.curve'})).toHaveAttribute('aria-disabled','true');for(const name of ['fxInspector.add','fxInspector.clear','fxInspector.apply'])expect(screen.getByRole('button',{name})).toBeDisabled();
});
it('creates a first manual curve using the queried static default without changing opaque state',()=>{
 const snapshot=fixture();delete snapshot.nativeEffects![0].parameters.gain;delete snapshot.nativeEffects![0].parameterAutomation!.gain;open('master',snapshot);fireEvent.click(screen.getByRole('button',{name:'fxInspector.add'}));fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));expect(effect().parameters.gain).toBe(-6);expect(effect().parameterAutomation!.gain.points).toEqual([{time:0,value:.5}]);expect(effect().state).toBe('opaque');
});
it('formats readable numbers without quantizing untouched saved points',()=>{
 const snapshot=fixture();snapshot.nativeEffects![0].parameterAutomation!.gain.points[0].value=.123456789;const opened=open('master',snapshot);number('fxInspector.point','1');const input=screen.getByRole('spinbutton',{name:'fxInspector.value (dB)'}) as HTMLInputElement;expect(input.value.length).toBeLessThan(10);number('fxInspector.value (dB)',input.value);fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));expect(useProjectStore.getState().project).toBe(opened.snapshot);expect(effect().parameterAutomation!.gain.points[0].value).toBe(.123456789);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
});

it('edits with arrow keys and consumes Delete without triggering timeline shortcuts',()=>{
 open();number('fxInspector.point','1');const svg=graph(),shortcut=vi.fn();window.addEventListener('keydown',shortcut);try{fireEvent.keyDown(svg,{key:'ArrowUp'});expect(screen.getByRole('spinbutton',{name:'fxInspector.value (dB)'})).toHaveValue(-14.964);fireEvent.keyDown(svg,{key:'ArrowRight',shiftKey:true});expect(screen.getByRole('spinbutton',{name:'fxInspector.time'})).toHaveValue(1.01);fireEvent.keyDown(svg,{key:'Delete'});expect(shortcut).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));expect(effect().parameterAutomation!.gain.points).toEqual([{time:3,value:.75}]);}finally{window.removeEventListener('keydown',shortcut);}
});

it('replaces an invalid numeric draft when returning to graph edits',()=>{
 open();number('fxInspector.point','1');number('fxInspector.value (dB)','100');expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeDisabled();const svg=graph();fireEvent.keyDown(svg,{key:'ArrowUp'});expect(screen.getByRole('spinbutton',{name:'fxInspector.value (dB)'})).toHaveValue(-14.964);expect(screen.getByRole('spinbutton',{name:'fxInspector.value (dB)'})).toHaveAttribute('aria-invalid','false');expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeEnabled();fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));expect(effect().parameterAutomation!.gain.points[0].value).toBeCloseTo(.251,12);
});

it('keeps fractional point indices invalid and clears stale numeric drafts on a new graph selection',()=>{
 open();const index=number('fxInspector.point','1.5');expect(index).toHaveAttribute('aria-invalid','true');expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeDisabled();act(()=>index.focus());fireEvent.keyDown(index,{key:'Escape'});number('fxInspector.point','1');number('fxInspector.value (dB)','100');const svg=graph();pointer(svg,'pointerdown',444,46);pointer(svg,'pointerup',444,46);expect(screen.getByRole('spinbutton',{name:'fxInspector.value (dB)'})).toHaveValue(3);expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeEnabled();
});

function menu(action:string){vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});fireEvent.click(screen.getByRole('button',{name:'curveRange.actions'}));fireEvent.click(screen.getByRole('menuitem',{name:action}));}
it('copies a native interval and pastes a guarded draft without changing opaque state or other lanes',()=>{
 const {snapshot}=open();menu('curveRange.select');number('curveRange.start','1');number('curveRange.end','2');menu('curveRange.copy');number('curveRange.end','4');number('curveRange.start','3');menu('curveRange.fit');expect(useProjectStore.getState().project).toBe(snapshot);fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));expect(effect().parameterAutomation!.gain.points.find(p=>p.time===3)?.value).toBe(.25);expect(effect().parameterAutomation!.gain.points.find(p=>p.time===4)?.value).toBe(.5);expect(effect().parameterAutomation!.other).toEqual(fx().parameterAutomation!.other);expect(effect().state).toBe('opaque');expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
});
it('matches native clipboard to plug-in, address and reported range',()=>{
 open();menu('curveRange.copy');cleanup();const other=fixture();other.nativeEffects![0].pluginId='au:other';open('master',other);vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});fireEvent.click(screen.getByRole('button',{name:'curveRange.actions'}));expect(screen.getByRole('menuitem',{name:'curveRange.paste'})).toBeDisabled();
});

it.each(['master','track:t','clip:c'])('shapes normalized native curves in %s without changing plugin state',scope=>{
 const {snapshot}=open(scope);number('fxInspector.point','1');menu('automation.shapeSegment');fireEvent.change(screen.getByRole('combobox',{name:'automation.shape'}),{target:{value:'ease-out'}});fireEvent.click(screen.getByRole('button',{name:'curveShape.use'}));number('fxInspector.point','8');menu('automation.shapeSegment');expect(screen.getByRole('combobox',{name:'automation.shape'})).toHaveValue('ease-out');fireEvent.click(screen.getByRole('button',{name:'curveShape.use'}));expect(useProjectStore.getState().project).toBe(snapshot);fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));const points=effect(scope).parameterAutomation!.gain.points;expect(points).toHaveLength(17);expect(points[8].value).toBe(.625);expect(effect(scope).state).toBe('opaque');expect(effect(scope).parameters).toEqual(fx().parameters);expect(effect(scope).parameterAutomation!.other).toEqual(fx().parameterAutomation!.other);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
});

it('releases the parent review lock when refreshed native range metadata replaces the shape editor',()=>{
 const {snapshot,rerender}=open();number('fxInspector.point','1');menu('automation.shapeSegment');rerender(<NativeParameterAutomation snapshot={snapshot} scope="master" target={{...target,min:-12}} name="Gain" unit="dB" onClose={()=>{}}/>);expect(screen.getByRole('button',{name:'fxInspector.clear'})).toBeEnabled();fireEvent.click(screen.getByRole('button',{name:'fxInspector.clear'}));expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeEnabled();expect(useProjectStore.getState().project).toBe(snapshot);
});
