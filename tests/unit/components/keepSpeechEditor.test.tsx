import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {KeepSpeechEditor} from '../../../src/components/timeline/KeepSpeechEditor';
import {useProjectStore} from '../../../src/stores/projectStore';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
beforeEach(()=>{
 const initial=useProjectStore.getInitialState(),words='ja gut ja besser'.split(' ').map((text,i)=>({id:`w${i}`,text,start:i+.2,end:i+.7}));
 useProjectStore.getState().loadProjectState({...initial.project,sampleRate:48000,duration:5,tracks:[{id:'t',name:'Mic',volume:1,pan:0,muted:false,solo:false,segments:[{id:'a',trackId:'t',sourceId:'s',startTime:0,sourceOffset:0,duration:5,name:'Mic',color:'#fff',gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'}]}],transcript:[{id:'c',start:.2,end:3.7,text:'ja gut ja besser',words}]},new Map());useProjectStore.temporal.getState().clear();
});
afterEach(cleanup);
it('pasted edits preview before committing one undoable all-lane cut',()=>{
 const before=useProjectStore.getState().project;render(<KeepSpeechEditor/>);
 fireEvent.change(screen.getByRole('textbox',{name:'keepSpeech.text'}),{target:{value:'Gut besser.'}});fireEvent.click(screen.getByRole('button',{name:'keepSpeech.compare'}));expect(useProjectStore.getState().project).toBe(before);
 fireEvent.click(screen.getByRole('button',{name:'keepSpeech.apply'}));expect(useProjectStore.getState().project.transcript![0].text).toBe('gut besser');expect(useProjectStore.getState().project.duration).toBeCloseTo(1);
 act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project).toBe(before);
});
it('blocks ambiguous repeated speech until the occurrence is chosen',()=>{
 render(<KeepSpeechEditor/>);fireEvent.change(screen.getByRole('textbox',{name:'keepSpeech.text'}),{target:{value:'ja'}});fireEvent.click(screen.getByRole('button',{name:'keepSpeech.compare'}));expect(screen.getByRole('button',{name:'keepSpeech.apply'})).toBeDisabled();
 fireEvent.change(screen.getByRole('combobox',{name:'keepSpeech.occurrence'}),{target:{value:'2'}});expect(screen.getByRole('button',{name:'keepSpeech.apply'})).not.toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'keepSpeech.apply'}));expect(useProjectStore.getState().project.tracks[0].segments[0].sourceOffset).toBe(2.2);
});
it('invalidates the review when the draft or arrangement changes',()=>{
 render(<KeepSpeechEditor/>);fireEvent.change(screen.getByRole('textbox',{name:'keepSpeech.text'}),{target:{value:'gut'}});fireEvent.click(screen.getByRole('button',{name:'keepSpeech.compare'}));act(()=>useProjectStore.getState().addTrack('Changed'));expect(screen.getByRole('button',{name:'keepSpeech.apply'})).toBeDisabled();
 fireEvent.change(screen.getByRole('textbox',{name:'keepSpeech.text'}),{target:{value:'besser'}});expect(screen.queryByRole('button',{name:'keepSpeech.apply'})).toBeNull();
});
it('rejects rewritten text and supports loading the original for editing',()=>{
 render(<KeepSpeechEditor/>);fireEvent.change(screen.getByRole('textbox',{name:'keepSpeech.text'}),{target:{value:'nicht gesprochen'}});fireEvent.click(screen.getByRole('button',{name:'keepSpeech.compare'}));expect(screen.getByRole('alert')).toHaveTextContent('keepSpeech.mismatch');fireEvent.click(screen.getByRole('button',{name:'keepSpeech.load'}));expect(screen.getByRole('textbox',{name:'keepSpeech.text'})).toHaveValue('ja gut ja besser');
});
