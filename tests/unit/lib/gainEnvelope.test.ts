import {beforeEach,expect,it} from 'vitest';
import {copyGainEnvelope,pasteGainEnvelope} from '../../../src/lib/gainEnvelope';
import {gainAt} from '../../../src/lib/mixAutomation';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {TimelineProject} from '../../../src/types/audio';
const project=():TimelineProject=>({id:'p',name:'Copy test',sampleRate:48000,duration:10,minimumDuration:10,masterEffects:[],markers:[{id:'m',time:5,name:'Keep'}],transcriptLayout:[['keep']],tracks:[
 {id:'a',name:'Source',locked:true,muted:false,solo:false,volume:1,pan:0,segments:[],automation:[{time:0,value:0},{time:4,value:1}]},
 {id:'b',name:'Destination',muted:false,solo:false,volume:1,pan:0,segments:[],automation:[{time:0,value:.2},{time:10,value:.7}]},
]});
beforeEach(()=>{useProjectStore.getState().loadProjectState(project(),new Map());useProjectStore.setState({gainClipboard:null});useProjectStore.temporal.getState().clear();});
it('copies interpolated edges on a relative clock, including locked source tracks and duplicates',()=>{
 const p=project();p.tracks[0].automation!.push({time:0,value:.5});
 const copy=copyGainEnvelope(p,'a',1,3);expect(copy).toMatchObject({sourceStart:1,duration:2,points:[{time:0,value:.625},{time:2,value:.875}]});
 copy.points[0].value=9;expect(gainAt(p.tracks[0].automation,1)).toBe(.625);
});
it('stretches time without changing gain and preserves outside curves, geometry and metadata',()=>{
 const p=project(),out=pasteGainEnvelope(p,'b',copyGainEnvelope(p,'a',1,3),4,4),points=out.tracks[1].automation;
 expect(gainAt(points,4)).toBe(.25);expect(gainAt(points,6)).toBe(.5);expect(gainAt(points,8)).toBe(.75);
 for(const time of [0,3,4-1/48000,8+1/48000,9,10])expect(gainAt(points,time)).toBeCloseTo(gainAt(p.tracks[1].automation,time),12);
 expect(out.tracks[0]).toBe(p.tracks[0]);expect(out.tracks[1].segments).toBe(p.tracks[1].segments);expect(out.markers).toBe(p.markers);expect(out.transcriptLayout).toBe(p.transcriptLayout);expect(out.duration).toBe(10);
});
it('preserves all interior breakpoints under compression and exact silence',()=>{
 const p=project();p.tracks[0].automation=[{time:0,value:0},{time:2,value:1},{time:3,value:0},{time:4,value:.25}];
 const out=pasteGainEnvelope(p,'b',copyGainEnvelope(p,'a',0,4),0,2);
 expect(out.tracks[1].automation?.slice(0,4)).toEqual([{time:0,value:0},{time:1,value:1},{time:1.5,value:0},{time:2,value:.25}]);
 expect(gainAt(out.tracks[1].automation,2+1/48000)).toBeCloseTo(gainAt(p.tracks[1].automation,2+1/48000),12);
});
it('identity and constant pastes do not create redundant points or undo checkpoints',()=>{
 const p=project();expect(pasteGainEnvelope(p,'b',copyGainEnvelope(p,'b'),0)).toBe(p);
 p.tracks[1].automation=undefined;expect(pasteGainEnvelope(p,'b',{duration:2,points:[]},3)).toBe(p);
});
it('rejects bounds, bad envelopes, missing tracks and locked destinations atomically',()=>{
 const p=project(),copy=copyGainEnvelope(p,'a');
 for(const time of [NaN,-1,9])expect(()=>pasteGainEnvelope(p,'b',copy,time)).toThrow('automation.bounds');
 for(const duration of [NaN,0,1/96000])expect(()=>pasteGainEnvelope(p,'b',copy,0,duration)).toThrow('automation.bounds');
 expect(()=>pasteGainEnvelope(p,'a',copy,0)).toThrow('automation.lockedEnvelope');
 expect(()=>pasteGainEnvelope(p,'missing',copy,0)).toThrow('automation.missingTrack');
 expect(()=>copyGainEnvelope(p,'a',1,12)).toThrow('automation.bounds');
 for(const bad of [{duration:0,points:[]},{duration:1,points:[{time:2,value:1}]},{duration:1,points:[{time:0,value:Infinity}]}])expect(()=>pasteGainEnvelope(p,'b',bad,0)).toThrow('automation.invalidEnvelope');
 expect(p.tracks[1].automation).toHaveLength(2);
});
it('session clipboard survives lane/project changes, with one-step paste undo/redo and no-op history preservation',()=>{
 const store=useProjectStore.getState();store.setEditRange(1,3);useProjectStore.temporal.getState().clear();
 expect(store.copyGainAutomation('a')).toBe(true);const copy=useProjectStore.getState().gainClipboard;
 expect(copy?.duration).toBe(2);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
 const before=useProjectStore.getState().project;expect(store.pasteGainAutomation('b',4,4)).toBe(true);const after=useProjectStore.getState().project;
 expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);useProjectStore.temporal.getState().undo();expect(useProjectStore.getState().project).toBe(before);
 expect(useProjectStore.getState().gainClipboard).toBe(copy);useProjectStore.temporal.getState().redo();expect(useProjectStore.getState().project).toBe(after);
 useProjectStore.temporal.getState().undo();store.copyGainAutomation('b');
 expect(store.pasteGainAutomation('b',1,2)).toBe(true);expect(useProjectStore.getState().project).toBe(before);expect(useProjectStore.temporal.getState().futureStates).toHaveLength(1);
 store.loadProjectState({...project(),id:'new'},new Map());expect(useProjectStore.getState().gainClipboard).not.toBeNull();
});

it('copies signed pan and static fallback, stretches independently of gain and rejects cross-parameter paste',async()=>{
 const {copyPanEnvelope,pastePanEnvelope}=await import('../../../src/lib/gainEnvelope');
 const {panAt}=await import('../../../src/lib/mixAutomation');
 const p=project();p.tracks[0].panAutomation=[{time:0,value:-1},{time:4,value:1},{time:8,value:-1}];p.tracks[1].pan=.6;
 const copy=copyPanEnvelope(p,'a',1,7);expect(copy.parameter).toBe('pan');expect(copy.points).toEqual([{time:0,value:-.5},{time:3,value:1},{time:6,value:-.5}]);
 const out=pastePanEnvelope(p,'b',copy,4,3);expect(panAt(out.tracks[1].panAutomation,5.5)).toBe(1);
 for(const time of [0,3,4-1/48000,7+1/48000,9,10])expect(panAt(out.tracks[1].panAutomation,time)).toBeCloseTo(.6,12);
 expect(out.tracks[1].automation).toBe(p.tracks[1].automation);expect(out.tracks[1].pan).toBe(.6);expect(out.markers).toBe(p.markers);
 expect(()=>pasteGainEnvelope(p,'b',copy,0)).toThrow('parameterMismatch');expect(()=>pastePanEnvelope(p,'b',copyGainEnvelope(p,'a'),0)).toThrow('parameterMismatch');
 const constant=copyPanEnvelope(p,'b',1,3);expect(constant.points).toEqual([{time:0,value:.6},{time:2,value:.6}]);expect(pastePanEnvelope(p,'b',constant,1)).toBe(p);
});
it('keeps separate pan/gain clipboards across project loads and preserves no-op redo',()=>{
 const store=useProjectStore.getState();store.setEditRange(1,3);store.copyGainAutomation('a');store.copyPanAutomation('b');
 const gain=useProjectStore.getState().gainClipboard,pan=useProjectStore.getState().panClipboard;
 useProjectStore.temporal.getState().clear();store.updateTrack('b',{pan:.5});useProjectStore.temporal.getState().undo();
 expect(store.pastePanAutomation('b',1,2)).toBe(true);expect(useProjectStore.temporal.getState().futureStates).toHaveLength(1);
 store.loadProjectState({...project(),id:'pan-other'},new Map());expect(useProjectStore.getState().gainClipboard).toBe(gain);expect(useProjectStore.getState().panClipboard).toBe(pan);
});
