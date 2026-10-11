import {expect,it,vi} from 'vitest';
import {gainAt,panAt,scheduleGain,schedulePan} from '../../../src/lib/mixAutomation';
import {scheduleMix,scheduleFeedback} from '../../../src/lib/effectAutomation';
import {copyGainEnvelope,pasteGainEnvelope,copyPanEnvelope,pastePanEnvelope} from '../../../src/lib/gainEnvelope';
import {copyEffectEnvelope,pasteEffectEnvelope} from '../../../src/lib/effectEnvelope';
import {applyAutomationPass,automationValue,type AutomationTarget} from '../../../src/lib/automationRecording';
import {editTimeRange} from '../../../src/lib/rangeEdits';
import {deserializeProject,serializeProject} from '../../../src/lib/projectFile';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {GainPoint,TimelineProject} from '../../../src/types/audio';
const points:GainPoint[]=[{time:0,value:0,curve:'step'},{time:4,value:1,curve:'step'},{time:8,value:.2}];
const project=():TimelineProject=>({...useProjectStore.getInitialState().project,sampleRate:48000,minimumDuration:10,duration:10,tracks:[{id:'t',name:'Voice',volume:1,pan:0,muted:false,solo:false,segments:[],automation:points.map(p=>({...p})),panAutomation:points.map(p=>({...p})),effects:[{type:'delay',enabled:true,params:{mix:.3,feedback:.4},automation:{mix:points.map(p=>({...p})),feedback:points.map(p=>({...p,value:p.value*.9}))}}]}]});
it('holds outgoing segments, jumps at the exact next clock, and keeps signed pan/linear defaults',()=>{
 for(const time of [-1,0,2,4-1/48000])expect(gainAt(points,time)).toBe(0);
 for(const time of [4,6,8-1/48000])expect(gainAt(points,time)).toBe(1);expect(gainAt(points,8)).toBe(.2);
 expect(gainAt(points.map(p=>({time:p.time,value:p.value})),2)).toBe(.5);
 expect(panAt([{time:0,value:-1,curve:'step'},{time:4,value:1}],3)).toBe(-1);
});
it('schedules jumps and subsequent linear ramps correctly after a seek, including complementary delay gains',()=>{
 const fake=()=>({setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()}) as unknown as AudioParam;
 const ps:GainPoint[]=[{time:0,value:.2,curve:'step'},{time:4,value:.8},{time:8,value:.4}];
 for(const schedule of [scheduleGain,schedulePan,scheduleFeedback]){const p=fake();schedule(p,ps,20,2,.3);expect(p.setValueAtTime).toHaveBeenCalledWith(.2,20);expect(p.setValueAtTime).toHaveBeenCalledWith(.8,22);expect(p.linearRampToValueAtTime).toHaveBeenCalledWith(.4,26);expect(p.linearRampToValueAtTime).not.toHaveBeenCalledWith(.8,22);}
 const wet=fake(),dry=fake();scheduleMix(wet,dry,ps,20,2,.3);expect(wet.setValueAtTime).toHaveBeenCalledWith(.8,22);expect(dry.setValueAtTime).toHaveBeenCalledWith(1-.8,22);
});
it('copies partial Step edges and retimes all lane types while restoring the original outside curves',()=>{
 const p=project();for(const parameter of ['gain','pan','mix','feedback'] as const){
  const copy=parameter==='gain'?copyGainEnvelope(p,'t',1,7):parameter==='pan'?copyPanEnvelope(p,'t',1,7):copyEffectEnvelope(p,'t',0,parameter,1,7);
  expect(copy.points[0]).toMatchObject({time:0,value:0,curve:'step'});expect(copy.points[1].curve).toBe('step');
  const out=parameter==='gain'?pasteGainEnvelope(p,'t',copy as ReturnType<typeof copyGainEnvelope>,1,3):parameter==='pan'?pastePanEnvelope(p,'t',copy as ReturnType<typeof copyPanEnvelope>,1,3):pasteEffectEnvelope(p,'t',0,parameter,copy as ReturnType<typeof copyEffectEnvelope>,1,3);
  const target:AutomationTarget={trackId:'t',parameter,...(['mix','feedback'].includes(parameter)?{effectIndex:0}:{})};
  expect(automationValue(out,target,2)).toBe(0);expect(automationValue(out,target,2.5)).toBe(parameter==='feedback'?.9:1);
  for(const time of [0,.5,4+1/48000,5,7,8,9])expect(automationValue(out,target,time)).toBe(automationValue(p,target,time));
 }
});
it('does not mistake a Step/Linear change for an identity paste and preserves equivalent Step identity',()=>{
 const p=project();const out=pasteGainEnvelope(p,'t',{duration:8,points:points.map(p=>({time:p.time,value:p.value}))},0);expect(out).not.toBe(p);expect(gainAt(out.tracks[0].automation,2)).toBe(.5);
 expect(pasteGainEnvelope(p,'t',copyGainEnvelope(p,'t'),0)).toBe(p);
 const pass=applyAutomationPass(p,{trackId:'t',parameter:'gain'},[{points:[{time:1,value:.5},{time:2,value:.5}]}]);expect(gainAt(pass.tracks[0].automation,3)).toBe(0);expect(gainAt(pass.tracks[0].automation,6)).toBe(1);
});
it('preserves Step segments and jumps through insert/extract without changing excluded lanes',()=>{
 const p=project();for(const op of ['insert','extract'] as const){
  const out=editTimeRange(p,2,3,op);for(const parameter of ['gain','pan','mix','feedback'] as const){const target:AutomationTarget={trackId:'t',parameter,...(['mix','feedback'].includes(parameter)?{effectIndex:0}:{})};
   for(const time of [0,1,3.5,4,6,7,8,9]){const moved=time>=3?time+(op==='insert'?1:-1):time;if(time<2||time>=3)expect(automationValue(out,target,moved)).toBe(automationValue(p,target,time));}
  }
 }
});
it('round trips Step metadata and rejects unsupported curves on all lanes before opening',async()=>{
 const p=project(),ctx={} as BaseAudioContext;expect((await deserializeProject(serializeProject(p,new Map()),ctx)).project.tracks[0].automation).toEqual(points);
 for(const parameter of ['gain','pan','mix','feedback'] as const){const bad=project(),target=parameter==='gain'?bad.tracks[0].automation:parameter==='pan'?bad.tracks[0].panAutomation:bad.tracks[0].effects![0].automation![parameter];target![0]={...target![0],curve:'bezier' as never};await expect(deserializeProject(serializeProject(bad,new Map()),ctx)).rejects.toThrow('automation');}
});
