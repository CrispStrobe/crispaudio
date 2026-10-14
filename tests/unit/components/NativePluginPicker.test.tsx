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
it('discovers and adds a disabled native insert with its program, then closes the inline picker',async()=>{
 const close=vi.fn();render(<NativePluginPicker scope="master" disabled={false} onClose={close}/>);await screen.findByRole('option',{name:'Bandpass · AU'});fireEvent.change(screen.getByRole('combobox'),{target:{value:'au:test'}});fireEvent.click(screen.getByRole('button',{name:'nativeRack.add'}));await waitFor(()=>expect(close).toHaveBeenCalledOnce());expect(useProjectStore.getState().project.nativeEffects?.[0]).toMatchObject({pluginId:'au:test',name:'Bandpass',format:'AU',enabled:false,bypass:false,state:'program',parameters:{}});
});
it('rejects stale initialization when the project changes and cancels before a late result can commit',async()=>{
 let release!:(value:unknown)=>void;job.mockImplementation(async(_command,args)=>args.operation==='plugin-scan'?{plugins:[plugin],warnings:[]}:new Promise(resolve=>{release=resolve;}));const close=vi.fn(),view=render(<NativePluginPicker scope="master" disabled={false} onClose={close}/>);await screen.findByRole('option',{name:'Bandpass · AU'});fireEvent.change(screen.getByRole('combobox'),{target:{value:'au:test'}});fireEvent.click(screen.getByRole('button',{name:'nativeRack.add'}));useProjectStore.setState({project:{...useProjectStore.getState().project,name:'Edited'}});release({state:'program',parameters:[]});await screen.findByRole('alert');expect(useProjectStore.getState().project.nativeEffects).toBeUndefined();expect(close).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'nativeRack.add'}));fireEvent.click(screen.getByRole('button',{name:'common.close'}));view.unmount();release({state:'late',parameters:[]});await Promise.resolve();expect(useProjectStore.getState().project.nativeEffects).toBeUndefined();
});
