import {beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {NativeRecordingMix} from '../../../src/components/timeline/NativeRecordingMix';
import {NativeRecordingController} from '../../../src/audio/plugins/NativeRecordingController';
import {useProjectStore} from '../../../src/stores/projectStore';
vi.mock('react-i18next',async importOriginal=>({...await importOriginal<typeof import('react-i18next')>(),useTranslation:()=>({t:(key:string)=>key})}));
function fixture(){
 const project=useProjectStore.getState().project,targets=project.tracks.map(track=>({trackId:track.id,name:track.name,input:track.recordingInput!}));
 const controller=new NativeRecordingController({project,sources:new Map(),targets,cursor:0,loop:false,crossfade:0,output:'',current:()=>useProjectStore.getState(),context:{}as BaseAudioContext,takeName:'Take',sourceName:'Recording'});
 return {controller,targets};
}
beforeEach(()=>{const p=useProjectStore.getInitialState().project;useProjectStore.getState().loadProjectState({...p,tracks:['a','b'].map((id,index)=>({id,name:`Input ${id}`,volume:1,pan:0,muted:false,solo:false,segments:[],recordArmed:true,recordingInput:{deviceId:'',channel:'mono',countIn:0,latencyMs:0,monitor:index===0}}))},new Map());useProjectStore.temporal.getState().clear();});
it('adjusts live levels numerically, preserves mute and restores faders across panel reopen without project edits',()=>{
 const {controller,targets}=fixture(),original=useProjectStore.getState().project,props={controller,targets,selectedId:'a',disabled:false,onError:vi.fn()};
 let view=render(<NativeRecordingMix {...props}/>);fireEvent.click(screen.getByText('recording.liveMix'));expect(screen.getByText('recording.liveMix').closest('details')).toHaveAttribute('open');
 const backing=screen.getByRole('spinbutton',{name:'recording.mix_backing'});fireEvent.focus(backing);fireEvent.change(backing,{target:{value:'-6'}});fireEvent.blur(backing);
 expect(controller.monitorState().mix.backing).toBeCloseTo(10**(-6/20));
 const mute=screen.getAllByRole('checkbox',{name:'recording.mixMute'})[0];fireEvent.click(mute);expect(controller.monitorState().mix.backing).toBe(0);
 fireEvent.change(screen.getByRole('slider',{name:'recording.mix_backing'}),{target:{value:'-12'}});expect(controller.monitorState().mix.backing).toBe(0);expect(controller.monitorState().lastMix.backing).toBeCloseTo(10**(-12/20));
 view.unmount();view=render(<NativeRecordingMix {...props}/>);fireEvent.click(screen.getByText('recording.liveMix'));expect(screen.getAllByRole('checkbox',{name:'recording.mixMute'})[0]).toBeChecked();expect(screen.getByRole('spinbutton',{name:'recording.mix_backing'})).toHaveValue(-12);
 fireEvent.click(screen.getAllByRole('checkbox',{name:'recording.mixMute'})[0]);expect(controller.monitorState().mix.backing).toBeCloseTo(10**(-12/20));expect(useProjectStore.getState().project).toBe(original);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);view.unmount();
});
it('changes cue pan/mono only for prepared monitored inputs and explains unavailable cue controls',()=>{
 const {controller,targets}=fixture();render(<NativeRecordingMix controller={controller} targets={targets} selectedId="a" disabled={false} onError={vi.fn()}/>);fireEvent.click(screen.getByText('recording.liveMix'));
 fireEvent.change(screen.getByRole('slider',{name:'recording.cuePan'}),{target:{value:'-.5'}});fireEvent.click(screen.getByRole('checkbox',{name:'recording.cueMono'}));expect(controller.monitorState().cues.a).toMatchObject({pan:-.5,mono:true});
 fireEvent.change(screen.getByRole('combobox',{name:'recording.mixTrack'}),{target:{value:'b'}});expect(screen.getByRole('slider',{name:'recording.cuePan'})).toBeDisabled();expect(screen.getByText('recording.mixNoCue')).toBeInTheDocument();expect(controller.monitorState().cues.b.pan).toBe(0);
});
it('keeps all live controls disabled during preparation/finalization',()=>{
 const {controller,targets}=fixture();render(<NativeRecordingMix controller={controller} targets={targets} selectedId="a" disabled onError={vi.fn()}/>);fireEvent.click(screen.getByText('recording.liveMix'));expect(screen.getByRole('slider',{name:'recording.mix_output'})).toBeDisabled();expect(screen.getByRole('slider',{name:'recording.cuePan'})).toBeDisabled();expect(screen.getByRole('combobox',{name:'recording.mixTrack'})).toBeDisabled();
});
