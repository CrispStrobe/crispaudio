import {beforeEach,it,expect,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {NativePluginPicker} from '../../../src/components/timeline/NativePluginPicker';
import {useProjectStore} from '../../../src/stores/projectStore';
import {useUIStore} from '../../../src/stores/uiStore';
const job=vi.hoisted(()=>vi.fn());
vi.mock('../../../src/lib/mediaJob',()=>({mediaJob:job}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
const plugin={id:'au:test',name:'Bandpass',format:'AU',manufacturer:'Apple'};
beforeEach(()=>{useProjectStore.setState(useProjectStore.getInitialState());useUIStore.setState({timelineRecording:false});job.mockReset();job.mockImplementation(async(_command,args)=>args.operation==='plugin-scan'?{plugins:[plugin],warnings:[]}:{state:'program',parameters:[{address:'0',value:440}]});});
it('discovers and adds an enabled native insert with its program, then closes the inline picker',async()=>{
 const close=vi.fn();render(<NativePluginPicker scope="master" disabled={false} onClose={close}/>);await screen.findByRole('option',{name:'Bandpass · AU'});fireEvent.change(screen.getByRole('combobox'),{target:{value:'au:test'}});fireEvent.click(screen.getByRole('button',{name:'nativeRack.add'}));await waitFor(()=>expect(close).toHaveBeenCalledOnce());expect(useProjectStore.getState().project.nativeEffects?.[0]).toMatchObject({pluginId:'au:test',name:'Bandpass',format:'AU',enabled:true,bypass:false,state:'program',parameters:{}});
});
it('rejects stale initialization when the project changes and cancels before a late result can commit',async()=>{
 let release!:(value:unknown)=>void;job.mockImplementation(async(_command,args)=>args.operation==='plugin-scan'?{plugins:[plugin],warnings:[]}:new Promise(resolve=>{release=resolve;}));const close=vi.fn(),view=render(<NativePluginPicker scope="master" disabled={false} onClose={close}/>);await screen.findByRole('option',{name:'Bandpass · AU'});fireEvent.change(screen.getByRole('combobox'),{target:{value:'au:test'}});fireEvent.click(screen.getByRole('button',{name:'nativeRack.add'}));useProjectStore.setState({project:{...useProjectStore.getState().project,name:'Edited'}});release({state:'program',parameters:[]});await screen.findByRole('alert');expect(useProjectStore.getState().project.nativeEffects).toBeUndefined();expect(close).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'nativeRack.add'}));fireEvent.click(screen.getByRole('button',{name:'common.close'}));view.unmount();release({state:'late',parameters:[]});await Promise.resolve();expect(useProjectStore.getState().project.nativeEffects).toBeUndefined();
});

const dialog=vi.hoisted(()=>vi.fn());
const invoke=vi.hoisted(()=>vi.fn());
vi.mock('@tauri-apps/plugin-dialog',()=>({open:dialog}));
vi.mock('@tauri-apps/api/core',()=>({invoke}));
it('remembers native folder access before saving its path or starting a new scan',async()=>{
 localStorage.removeItem('crispaudio-plugin-folders');dialog.mockResolvedValue('/Volumes/Effects');
 let grant!:(value:unknown)=>void;invoke.mockImplementation(()=>new Promise(resolve=>{grant=resolve;}));
 render(<NativePluginPicker scope="master" disabled={false} onClose={()=>{}}/>);
 await screen.findByRole('option',{name:'Bandpass · AU'});fireEvent.click(screen.getByRole('button',{name:'sourcePlugins.folder'}));
 await waitFor(()=>expect(invoke).toHaveBeenCalledWith('remember_plugin_folder',{path:'/Volumes/Effects'}));
 expect(localStorage.getItem('crispaudio-plugin-folders')).toBeNull();
 grant(undefined);await waitFor(()=>expect(localStorage.getItem('crispaudio-plugin-folders')).toBe('["/Volumes/Effects"]'));
 await waitFor(()=>expect(job).toHaveBeenCalledWith('audio_unit_plugin',{operation:'plugin-scan',request:{folders:['/Volumes/Effects'],report:true}},expect.any(AbortSignal)));
});
it('keeps the existing folder list when native access cannot be saved',async()=>{
 localStorage.setItem('crispaudio-plugin-folders','["/old"]');dialog.mockResolvedValue('/Volumes/Missing');invoke.mockRejectedValue(new Error('Select folder again'));
 render(<NativePluginPicker scope="master" disabled={false} onClose={()=>{}}/>);await screen.findByRole('option',{name:'Bandpass · AU'});
 fireEvent.click(screen.getByRole('button',{name:'sourcePlugins.folder'}));expect(await screen.findByRole('alert')).toHaveTextContent('Select folder again');
 expect(localStorage.getItem('crispaudio-plugin-folders')).toBe('["/old"]');
});
