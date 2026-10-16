import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SpokenEditor} from '../../../src/components/timeline/SpokenEditor';
import {useProjectStore} from '../../../src/stores/projectStore';
import {withTimelineTranscript} from '../../../src/lib/importedTranscript';
import type {AudioSource} from '../../../src/types/audio';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
const {invoke}=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke}));
const text=JSON.stringify({transcription:[{offsets:{from:1000,to:3000},text:'Hallo Welt',words:[{text:'Hallo',offsets:{from:1000,to:2000}},{text:'Welt',offsets:{from:2100,to:3000}}]}]});
beforeEach(()=>{
 localStorage.clear();Object.defineProperty(window,'__TAURI_INTERNALS__',{configurable:true,value:{}});invoke.mockReset();
 const initial=useProjectStore.getInitialState();
 useProjectStore.getState().loadProjectState({...initial.project,sampleRate:48000,duration:5,tracks:[{id:'t',name:'Mic',volume:1,pan:0,muted:false,solo:false,segments:[{id:'a',trackId:'t',sourceId:'s',name:'Sound',color:'#fff',startTime:0,sourceOffset:0,duration:5,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'}]}]},new Map([['s',{id:'s',name:'Mic',duration:5} as AudioSource]]));useProjectStore.temporal.getState().clear();
});
afterEach(()=>{cleanup();delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;});
it('edits imported word timing with one undo and no ASR calls or configuration',()=>{
 const state=useProjectStore.getState();useProjectStore.setState({project:withTimelineTranscript(state.project,text)});render(<SpokenEditor/>);
 expect(screen.queryByRole('button',{name:'spoken.transcribe'})).toBeNull();expect(screen.queryByText('spoken.settings')).toBeNull();expect(invoke).not.toHaveBeenCalled();
 const before=useProjectStore.getState().project;fireEvent.click(screen.getByRole('button',{name:'Hallo'}));fireEvent.keyDown(screen.getByRole('group',{name:'spoken.editor'}),{key:'Delete'});
 expect(useProjectStore.getState().project.duration).toBe(4);expect(useProjectStore.getState().project.transcript![0].text).toBe('Welt');
 act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project).toEqual(before);
});
it('guards imported words against a changed arrangement',()=>{
 const state=useProjectStore.getState(),aligned=withTimelineTranscript(state.project,text);useProjectStore.setState({project:{...aligned,tracks:aligned.tracks.map(t=>({...t,segments:t.segments.map(c=>({...c,sourceOffset:1}))}))}});
 render(<SpokenEditor/>);fireEvent.click(screen.getByRole('button',{name:'Hallo'}));fireEvent.keyDown(screen.getByRole('group',{name:'spoken.editor'}),{key:'Delete'});
 expect(screen.getByRole('alert').textContent).toBe('spoken.stale');expect(useProjectStore.getState().project.duration).toBe(5);
});
