import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {GainEnvelopePaste} from '../../../src/components/timeline/GainEnvelopePaste';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {EffectConfig,TimelineProject} from '../../../src/types/audio';
import type {EffectEnvelope} from '../../../src/lib/effectEnvelope';
import type {GainEnvelope} from '../../../src/lib/gainEnvelope';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('../../../src/i18n',()=>({default:{language:'en',changeLanguage:vi.fn()}}));
type Parameter='gain'|'pan'|EffectEnvelope['parameter'];
const cases:[Parameter,EffectConfig['type'],string][]=[['gain','delay','paste'],['pan','delay','panPaste'],['mix','reverb','reverbMixPaste'],['feedback','delay','feedbackPaste'],['time','delay','timePaste'],['depth','chorus','chorusDepthPaste'],['rate','chorus','chorusRatePaste'],['freq','ringmod','ringmodFreqPaste']];
function open(parameter:Parameter='freq',type:EffectConfig['type']='ringmod',locked=false){
 const value=parameter==='freq'?800:parameter==='rate'?4:.7;
 const effect:EffectConfig={type,enabled:true,params:{[parameter]:parameter==='freq'?200:.3},automation:parameter==='gain'||parameter==='pan'?{}:{[parameter]:[{time:0,value:.1},{time:10,value}],...(parameter==='mix'?{}:{mix:[{time:0,value:.3}]})}};
 const project:TimelineProject={...useProjectStore.getInitialState().project,id:crypto.randomUUID(),duration:10,minimumDuration:10,tracks:[{id:'t',name:'Destination',volume:1,pan:.2,locked,muted:false,solo:false,segments:[],automation:[{time:0,value:.1},{time:10,value:.8}],panAutomation:[{time:0,value:-.7},{time:10,value:.4}],effects:[effect]}]};
 useProjectStore.getState().loadProjectState(project,new Map());useProjectStore.getState().setPlayheadPosition(2);useProjectStore.temporal.getState().clear();const snapshot=useProjectStore.getState().project,close=vi.fn();
 const envelope:GainEnvelope|EffectEnvelope=parameter==='gain'||parameter==='pan'?{...(parameter==='pan'?{parameter:'pan' as const}:{}),duration:2,points:[{time:0,value:parameter==='pan'?-.8:.9},{time:2,value:.3}]}:{effectType:type as EffectEnvelope['effectType'],parameter,duration:2,points:[{time:0,value},{time:2,value:.2}]};
 render(<GainEnvelopePaste project={snapshot} trackId="t" envelope={envelope} effectIndex={0} onClose={close}/>);return{snapshot,envelope,close};
}
beforeEach(()=>{for(const t of useProjectStore.getState().project.tracks)if(t.locked)useProjectStore.getState().updateTrack(t.id,{locked:false});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const field=(name:string)=>screen.getByRole('spinbutton',{name:`automation.${name}`});
const plot=()=>screen.getByRole('img',{name:'automation.pastePreview'});
it.each(cases)('previews and pastes %s with the correct title, one Undo and unchanged other lanes', (parameter,type,title)=>{
 const {snapshot,close}=open(parameter,type);expect(screen.getByRole('dialog')).toHaveAccessibleName(`automation.${title}`);expect(screen.queryByText('automation.copiedRange')).toBeNull();const path=plot().querySelector('[data-paste-after]')!.getAttribute('d');fireEvent.change(field('destination'),{target:{value:'3'}});fireEvent.change(field('length'),{target:{value:'1'}});expect(plot().querySelector('[data-paste-after]')!.getAttribute('d')).not.toBe(path);expect(useProjectStore.getState().project).toBe(snapshot);fireEvent.submit(field('length').closest('form')!);expect(close).toHaveBeenCalledOnce();expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);const track=useProjectStore.getState().project.tracks[0];expect(track.segments).toBe(snapshot.tracks[0].segments);if(parameter!=='gain')expect(track.automation).toBe(snapshot.tracks[0].automation);if(parameter!=='pan')expect(track.panAutomation).toBe(snapshot.tracks[0].panAutomation);expect(track.effects![0].params).toBe(snapshot.tracks[0].effects![0].params);act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project).toBe(snapshot);
});
it('keeps explanations behind Info and closes the explanation before the paste dialog on Escape',()=>{
 const {close}=open();fireEvent.click(screen.getByRole('button',{name:'automation.pasteInfo'}));expect(screen.getByRole('note')).toHaveTextContent('automation.ringmodFreqPasteHelp');fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('note')).toBeNull();expect(close).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'automation.pasteInfo'})).toHaveFocus();
});
it('blocks invalid drafts and stale snapshots without drawing a proposed curve or publishing',()=>{
 const {snapshot}=open();fireEvent.change(field('length'),{target:{value:'20'}});expect(screen.getByRole('alert')).toHaveTextContent('automation.bounds');expect(screen.getByRole('button',{name:'automation.applyPaste'})).toBeDisabled();expect(plot().querySelector('[data-paste-after]')).toBeNull();fireEvent.change(field('length'),{target:{value:'2'}});expect(plot().querySelector('[data-paste-after]')).not.toBeNull();act(()=>useProjectStore.getState().updateTrack('t',{name:'Changed'}));expect(screen.getByRole('alert')).toHaveTextContent('automation.changed');expect(screen.getByRole('button',{name:'automation.applyPaste'})).toBeDisabled();expect(snapshot.tracks[0].name).toBe('Destination');
});
it('protects locked targets and Cancel keeps history untouched',()=>{
 const {snapshot,close}=open('gain','delay',true);expect(screen.getByRole('button',{name:'automation.applyPaste'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'common.cancel'}));expect(close).toHaveBeenCalledOnce();expect(useProjectStore.getState().project).toBe(snapshot);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
});
it('plots negative pan and Step segments without dropping or smoothing them',async()=>{
 const {CurvePastePreview}=await import('../../../src/components/timeline/CurvePastePreview');render(<CurvePastePreview before={[{time:0,value:-1,curve:'step'},{time:3,value:1}]} after={[{time:0,value:-.5},{time:3,value:.5}]} fallback={0} minimum={-1} maximum={1} start={1} length={1} canvas={4}/>);const path=plot().querySelector('[data-paste-before]')!.getAttribute('d')!;expect(path).toContain('H');expect(path).toContain(',100');expect(path).not.toMatch(/NaN|Infinity/);
});
it('keeps dense previews bounded while preserving their original data',async()=>{
 const {CurvePastePreview}=await import('../../../src/components/timeline/CurvePastePreview');const points=Array.from({length:10000},(_,i)=>({time:i/1000,value:i%2?.25:.75})),before=structuredClone(points);render(<CurvePastePreview before={points} after={points} fallback={1} minimum={0} maximum={1} start={0} length={10} canvas={10}/>);expect(plot().querySelector('[data-paste-before]')!.getAttribute('d')!.match(/[MLHV]/g)!.length).toBeLessThan(2100);expect(points).toEqual(before);
});
