import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {ScopedEffectAutomation} from '../../../src/components/timeline/ScopedEffectAutomation';
import {useProjectStore} from '../../../src/stores/projectStore';
import {useUIStore} from '../../../src/stores/uiStore';
import type {EffectConfig,TimelineProject} from '../../../src/types/audio';
import type {DelayParameter} from '../../../src/lib/effectAutomation';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('../../../src/i18n',()=>({default:{language:'en',changeLanguage:vi.fn()}}));
vi.mock('../../../src/hooks/useAudioEngine',()=>({useAudioEngine:()=>({resume:vi.fn().mockResolvedValue(undefined)})}));
const cases: [DelayParameter,EffectConfig['type'],string,number,number][]=[['mix','delay','%',50,.5],['feedback','delay','%',95,.95],['time','delay','ms',350,.35],['depth','chorus','%',60,.6],['rate','chorus','Hz',5,5],['freq','ringmod','Hz',1200,1200]];
function open(parameter:DelayParameter='mix',type:EffectConfig['type']='delay',scope='master',locked=false){
 const original:EffectConfig={type,enabled:true,params:{[parameter]:.2},automation:{[parameter]:[{time:1,value:.123456789},{time:3,value:.7}]}};
 const project:TimelineProject={...useProjectStore.getInitialState().project,id:crypto.randomUUID(),duration:4,minimumDuration:4,masterEffects:scope==='master'?[original]:[],tracks:[{id:'t',name:'Track',volume:1,pan:0,muted:false,solo:false,locked,segments:[{id:'c',trackId:'t',sourceId:'s',name:'Clip',color:'#fff',startTime:1,duration:3,sourceOffset:0,gain:1,effects:scope==='clip:c'?[original]:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'}]}]};
 useProjectStore.getState().loadProjectState(project,new Map());const snapshot=useProjectStore.getState().project,effect=scope==='master'?snapshot.masterEffects[0]:snapshot.tracks[0].segments[0].effects[0];useProjectStore.temporal.getState().clear();const close=vi.fn();
 render(<ScopedEffectAutomation snapshot={snapshot} original={effect} scope={scope} index={0} onClose={close}/>);fireEvent.change(screen.getByRole('combobox',{name:'fxInspector.parameter'}),{target:{value:parameter}});
 return {snapshot,effect,close,saved:()=>scope==='master'?useProjectStore.getState().project.masterEffects[0]:useProjectStore.getState().project.tracks[0].segments[0].effects[0]};
}
beforeEach(()=>{for(const track of useProjectStore.getState().project.tracks)if(track.locked)useProjectStore.getState().updateTrack(track.id,{locked:false});useUIStore.setState({timelineRecording:false});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function number(label:string,value:string){const input=screen.getByRole('spinbutton',{name:label});act(()=>input.focus());fireEvent.change(input,{target:{value}});act(()=>input.blur());return input;}
function graph(){const svg=screen.getByRole('img',{name:'fxInspector.curve'});vi.spyOn(svg,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:600,height:160,right:600,bottom:160,x:0,y:0,toJSON:()=>({})});Object.defineProperty(svg,'setPointerCapture',{value:vi.fn()});return svg;}
// Keep touch/pen coordinates and pointer IDs on jsdom's native MouseEvent implementation.
function pointer(node:HTMLElement|SVGElement,type:string,x:number,y:number,extra:Record<string,unknown>={}){const event=new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperties(event,Object.fromEntries(Object.entries({pointerId:1,pointerType:'mouse',...extra}).map(([key,value])=>[key,{value}])));fireEvent(node,event);}

it.each(cases)('edits %s in readable %s units without changing stored units or untouched precision', (parameter,type,unit,display,raw)=>{
 const {snapshot,saved}=open(parameter,type);expect(screen.queryByRole('button',{name:'automation.armPass'})).toBeNull();number('fxInspector.point','2');number(`fxInspector.value (${unit})`,String(display));number('fxInspector.time','2');fireEvent.change(screen.getByRole('combobox',{name:'fxInspector.segment'}),{target:{value:'step'}});expect(useProjectStore.getState().project).toBe(snapshot);fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));expect(saved().automation![parameter]).toEqual([{time:1,value:.123456789},{time:2,value:raw,curve:'step'}]);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project).toBe(snapshot);
});
it.each(cases)('keeps untouched %s values exact on focus and Apply', (parameter,type,unit)=>{
 const {snapshot}=open(parameter,type);number('fxInspector.point','1');const field=screen.getByRole('spinbutton',{name:`fxInspector.value (${unit})`}) as HTMLInputElement;number(`fxInspector.value (${unit})`,field.value);fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));expect(useProjectStore.getState().project).toBe(snapshot);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
});
it.each(['master','clip:c'])('drags raw delay points live in %s, cancels a gesture and applies only one Undo',scope=>{
 const {snapshot,saved}=open('time','delay',scope),svg=graph();number('fxInspector.point','2');const before=svg.querySelector('path')!.getAttribute('d');pointer(svg,'pointerdown',444,100.4,{pointerType:'touch'});pointer(svg,'pointermove',300,80,{pointerType:'touch'});expect(svg.querySelector('path')!.getAttribute('d')).not.toBe(before);expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeDisabled();expect(useProjectStore.getState().project).toBe(snapshot);pointer(svg,'pointercancel',300,80);expect(svg.querySelector('path')!.getAttribute('d')).toBe(before);
 pointer(svg,'pointerdown',444,100.4,{pointerType:'touch'});pointer(svg,'pointermove',300,80,{pointerType:'touch'});pointer(svg,'pointerup',300,80,{pointerType:'touch'});fireEvent.click(screen.getByRole('button',{name:'fxInspector.apply'}));expect(saved().automation!.time).toEqual([{time:1,value:.123456789},{time:2,value:1}]);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
});
it('blocks invalid drafts, capture, stale snapshots and locked clips',()=>{
 open('feedback');number('fxInspector.point','1');const input=number('fxInspector.value (%)','96');expect(input).toHaveAttribute('aria-invalid','true');expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeDisabled();expect(screen.getByRole('combobox',{name:'fxInspector.parameter'})).toBeDisabled();act(()=>input.focus());fireEvent.keyDown(input,{key:'Escape'});expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeEnabled();act(()=>useUIStore.setState({timelineRecording:true}));expect(screen.getByRole('button',{name:'fxInspector.add'})).toBeDisabled();act(()=>useUIStore.setState({timelineRecording:false}));act(()=>useProjectStore.getState().updateTrack('t',{volume:.5}));expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeDisabled();cleanup();open('time','delay','clip:c',true);expect(screen.getByRole('button',{name:'fxInspector.apply'})).toBeDisabled();
});
