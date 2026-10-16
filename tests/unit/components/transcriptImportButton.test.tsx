import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TranscriptImportButton} from '../../../src/components/timeline/TranscriptImportButton';
import {useProjectStore} from '../../../src/stores/projectStore';
const {open,readTextFile}=vi.hoisted(()=>({open:vi.fn(),readTextFile:vi.fn()}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('../../../src/lib/native',()=>({isIOSApp:()=>false}));
vi.mock('../../../src/lib/nativeDialog',()=>({open}));
vi.mock('@tauri-apps/plugin-fs',()=>({readTextFile}));
beforeEach(()=>{open.mockReset();readTextFile.mockReset();useProjectStore.getState().loadProjectState({...useProjectStore.getInitialState().project,id:'import',duration:5},new Map());});
afterEach(()=>{cleanup();delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;});
function fixture(load:()=>Promise<string>){const file=new File(['text'],'transcript.json',{type:'application/json'});Object.defineProperty(file,'text',{value:load});return file;}
function start(onImport=vi.fn()){
 const view=render(<TranscriptImportButton label="Import" help="CrisperWeaver timing" onImport={onImport}/>);
 fireEvent.click(screen.getByRole('button',{name:'Import',exact:true}));return {...view,onImport,input:screen.getByLabelText('Import',{selector:'input'})};
}
it('uses a browser file without launching a backend and captures the original project',async()=>{
 const snapshot=useProjectStore.getState().project,{input,onImport}=start();fireEvent.change(input,{target:{files:[fixture(async()=>'timed JSON')]}});
 await waitFor(()=>expect(onImport).toHaveBeenCalledWith('timed JSON',snapshot));expect(open).not.toHaveBeenCalled();expect(input).toHaveValue('');
});
it('rejects results when the project changes during the picker/read',async()=>{
 let finish!:(text:string)=>void;const {input,onImport}=start();fireEvent.change(input,{target:{files:[fixture(()=>new Promise(resolve=>{finish=resolve;}))]}});
 act(()=>useProjectStore.getState().addTrack('Changed'));await act(async()=>finish('late'));
 expect(onImport).not.toHaveBeenCalled();expect(screen.getByRole('alert')).toHaveTextContent('sync.changed');
});
it('discards a pending read on unmount',async()=>{
 let finish!:(text:string)=>void;const {input,onImport,unmount}=start();fireEvent.change(input,{target:{files:[fixture(()=>new Promise(resolve=>{finish=resolve;}))]}});
 unmount();await act(async()=>finish('late'));expect(onImport).not.toHaveBeenCalled();
});
it('reports a bad file without committing or creating history',async()=>{
 const {input,onImport}=start();useProjectStore.temporal.getState().clear();fireEvent.change(input,{target:{files:[fixture(async()=>{throw Error('Unreadable file');})]}});
 expect(await screen.findByRole('alert')).toHaveTextContent('Unreadable file');expect(onImport).not.toHaveBeenCalled();expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
});
it('uses the native desktop picker and treats cancellation as no change',async()=>{
 Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{},configurable:true});open.mockResolvedValue(null);const {onImport}=start();
 await waitFor(()=>expect(open).toHaveBeenCalled());expect(onImport).not.toHaveBeenCalled();expect(readTextFile).not.toHaveBeenCalled();expect(screen.queryByRole('alert')).toBeNull();
});
it('reads native selected text and propagates parse errors from the importer',async()=>{
 Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{},configurable:true});open.mockResolvedValue('/transcript.json');readTextFile.mockResolvedValue('bad JSON');const onImport=vi.fn(()=>{throw Error('Invalid timed transcript');});start(onImport);
 expect(await screen.findByRole('alert')).toHaveTextContent('Invalid timed transcript');expect(readTextFile).toHaveBeenCalledWith('/transcript.json');
});
