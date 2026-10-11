import {beforeEach,expect,it} from 'vitest';
import {copyEffectEnvelope,pasteEffectEnvelope,type EffectParameter} from '../../../src/lib/effectEnvelope';
import {mixAt} from '../../../src/lib/effectAutomation';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {TimelineProject} from '../../../src/types/audio';
const project=():TimelineProject=>({...useProjectStore.getInitialState().project,id:'fxcopy',sampleRate:48000,duration:10,minimumDuration:10,markers:[{id:'m',name:'Keep',time:5}],tracks:[
 {id:'a',name:'Source',locked:true,volume:1,pan:0,muted:true,solo:false,segments:[],effects:[{type:'delay',enabled:true,params:{mix:.3,feedback:.4},automation:{mix:[{time:0,value:0},{time:4,value:1},{time:8,value:0}],feedback:[{time:0,value:.1},{time:4,value:.9},{time:8,value:.1}]}}]},
 {id:'b',name:'Target',volume:1,pan:.2,muted:false,solo:false,segments:[],automation:[{time:0,value:.8}],effects:[{type:'delay',enabled:true,params:{mix:.2,feedback:.6},automation:{mix:[{time:0,value:.2},{time:10,value:.4}],feedback:[{time:0,value:.6},{time:10,value:.4}]}}]},
]});
beforeEach(()=>{useProjectStore.getState().loadProjectState(project(),new Map());useProjectStore.setState({effectClipboards:{mix:null,feedback:null}});useProjectStore.temporal.getState().clear();});
it('snapshots interpolated edges, duplicate clocks and empty static delay parameters independently',()=>{
 const p=project();p.tracks[0].effects![0].automation!.mix!.push({time:4,value:.8});
 const copied=copyEffectEnvelope(p,'a',0,'mix',1,7).points;expect(copied.map(p=>p.time)).toEqual([0,3,6]);expect(copied[0].value).toBeCloseTo(.2,15);expect(copied[1].value).toBe(.8);expect(copied[2].value).toBeCloseTo(.2,15);
 p.tracks[0].effects![0].automation=undefined;p.tracks[0].effects![0].params.feedback=1;
 expect(copyEffectEnvelope(p,'a',0,'feedback',1,3).points).toEqual([{time:0,value:.95},{time:2,value:.95}]);
 const copy=copyEffectEnvelope(p,'a',0,'mix',1,3);copy.points[0].value=0;expect(p.tracks[0].effects![0].params.mix).toBe(.3);
});
it('stretches both parameters while preserving outside guards, the other envelope and geometry',()=>{
 for(const parameter of ['mix','feedback'] as EffectParameter[]){
  const p=project(),copy=copyEffectEnvelope(p,'a',0,parameter,1,7),out=pasteEffectEnvelope(p,'b',0,parameter,copy,4,3),points=out.tracks[1].effects![0].automation![parameter],other=parameter==='mix'?'feedback':'mix';
  expect(mixAt(points,5.5,0)).toBe(parameter==='mix'?1:.9);
  for(const time of [0,3,4-1/48000,7+1/48000,9,10])expect(mixAt(points,time,0)).toBeCloseTo(mixAt(p.tracks[1].effects![0].automation![parameter],time,0),12);
  expect(out.tracks[0]).toBe(p.tracks[0]);expect(out.tracks[1].segments).toBe(p.tracks[1].segments);expect(out.tracks[1].automation).toBe(p.tracks[1].automation);expect(out.markers).toBe(p.markers);expect(out.duration).toBe(10);
  expect(out.tracks[1].effects![0].automation![other]).toBe(p.tracks[1].effects![0].automation![other]);expect(out.tracks[1].effects![0].params).toBe(p.tracks[1].effects![0].params);
 }
});
it('rejects mismatched parameter/type, missing insert, invalid clocks/values and locked targets atomically',()=>{
 const p=project(),copy=copyEffectEnvelope(p,'a',0,'feedback',1,7);
 expect(()=>pasteEffectEnvelope(p,'b',0,'mix',copy,0)).toThrow('parameterMismatch');
 expect(()=>pasteEffectEnvelope(p,'a',0,'feedback',copy,0)).toThrow('lockedEnvelope');
 expect(()=>pasteEffectEnvelope(p,'b',4,'feedback',copy,0)).toThrow('invalidEnvelope');
 for(const time of [-1,NaN,8])expect(()=>pasteEffectEnvelope(p,'b',0,'feedback',copy,time)).toThrow('bounds');
 for(const duration of [0,Infinity,1/96000])expect(()=>pasteEffectEnvelope(p,'b',0,'feedback',copy,0,duration)).toThrow('bounds');
 for(const bad of [{...copy,duration:0},{...copy,points:[{time:0,value:.96}]},{...copy,points:[{time:7,value:0}]},{...copy,points:[{time:0,value:NaN}]}])expect(()=>pasteEffectEnvelope(p,'b',0,'feedback',bad,0)).toThrow('invalidEnvelope');
 expect(p.tracks[1].effects![0].automation!.feedback).toHaveLength(2);
});
it('keeps separate session clipboards across loads, one-step history, identity redo and empty defaults',()=>{
 const store=useProjectStore.getState();store.setEditRange(1,7);useProjectStore.temporal.getState().clear();
 store.copyEffectAutomation('a',0,'mix');store.copyEffectAutomation('a',0,'feedback');const clipboards=useProjectStore.getState().effectClipboards;
 expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);const before=useProjectStore.getState().project;
 expect(store.pasteEffectAutomation('b',0,'mix',4,3)).toBe(true);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);const after=useProjectStore.getState().project;
 useProjectStore.temporal.getState().undo();expect(useProjectStore.getState().project).toBe(before);store.copyEffectAutomation('b',0,'mix');
 expect(store.pasteEffectAutomation('b',0,'mix',1,6)).toBe(true);expect(useProjectStore.getState().project).toBe(before);expect(useProjectStore.temporal.getState().futureStates).toHaveLength(1);
 useProjectStore.temporal.getState().redo();expect(useProjectStore.getState().project).toBe(after);
 store.loadProjectState({...project(),id:'new'},new Map());expect(useProjectStore.getState().effectClipboards.feedback).toBe(clipboards.feedback);
 const p=project();p.tracks[1].effects![0].automation=undefined;p.tracks[1].effects![0].params.mix=.3;
 expect(pasteEffectEnvelope(p,'b',0,'mix',{effectType:'delay',parameter:'mix',duration:2,points:[]},1)).toBe(p);
});
