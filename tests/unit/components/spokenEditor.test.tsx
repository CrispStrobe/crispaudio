import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SpokenEditor} from '../../../src/components/timeline/SpokenEditor';
import {useProjectStore} from '../../../src/stores/projectStore';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('../../../src/lib/native',()=>({isIOSApp:()=>false}));
const {job}=vi.hoisted(()=>({job:vi.fn()}));
vi.mock('../../../src/lib/mediaJob',()=>({mediaJob:job}));
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn().mockResolvedValue({executable:'/asr',model:'/model',aligner:'auto',language:'de'})}));
beforeEach(()=>{
 localStorage.clear();Object.defineProperty(window,'__TAURI_INTERNALS__',{configurable:true,value:{}});job.mockReset();
 const initial=useProjectStore.getInitialState();
 useProjectStore.getState().loadProjectState({...initial.project,sampleRate:48000,duration:5,tracks:[{id:'t',name:'Mic',volume:1,pan:0,muted:false,solo:false,segments:[{id:'a',trackId:'t',sourceId:'s',name:'Sound',color:'#fff',startTime:0,sourceOffset:0,duration:5,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'}]}]},new Map([['s',{id:'s',name:'Mic',filePath:'/mic.wav',duration:5,channels:1,sampleRate:48000,buffer:{} as AudioBuffer,peaks:new Float32Array()}]]));useProjectStore.temporal.getState().clear();
});
afterEach(()=>{cleanup();delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;});
const result={transcription:[{offsets:{from:1000,to:3000},text:'Hallo Welt',words:[{text:'Hallo',offsets:{from:1000,to:2000}},{text:'Welt',offsets:{from:2100,to:3000}}]}]};
it('invokes CrispASR on timeline audio and Delete cuts media with one undo',async()=>{
 job.mockResolvedValue(result);render(<SpokenEditor/>);fireEvent.click(screen.getByRole('button',{name:'spoken.transcribe'}));
 await screen.findByRole('button',{name:'Hallo'});expect(job.mock.calls[0][0]).toBe('transcribe_project');expect(job.mock.calls[0][1].document.sources[0].path).toBe('/mic.wav');
 const before=useProjectStore.getState().project;fireEvent.click(screen.getByRole('button',{name:'Hallo'}));fireEvent.keyDown(screen.getByRole('group',{name:'spoken.editor'}),{key:'Delete'});
 expect(useProjectStore.getState().project.duration).toBe(4);expect(useProjectStore.getState().project.transcript![0].text).toBe('Welt');
 act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project).toEqual(before);
});
it('does not apply results to a changed arrangement',async()=>{
 let resolve!:(value:unknown)=>void;job.mockReturnValue(new Promise(r=>{resolve=r;}));render(<SpokenEditor/>);fireEvent.click(screen.getByRole('button',{name:'spoken.transcribe'}));
 act(()=>useProjectStore.getState().addTrack('Changed'));await act(async()=>resolve(result));
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('sync.changed'));expect(useProjectStore.getState().project.transcript).toBeUndefined();
});
