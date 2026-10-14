import {beforeEach,it,expect,vi} from 'vitest';
import {act,fireEvent,render,screen} from '@testing-library/react';
import {NativeEffectRack} from '../../../src/components/timeline/NativeEffectRack';
import {useProjectStore} from '../../../src/stores/projectStore';
import {useUIStore} from '../../../src/stores/uiStore';
import type {NativeEffect} from '../../../src/types/audio';
vi.mock('../../../src/lib/native',()=>({isTauri:()=>true,isIOSApp:()=>false}));
vi.mock('../../../src/lib/mediaJob',()=>({mediaJob:async()=>({parameters:[{address:'0',name:'Frequency',min:20,max:20000,value:440,unit:'Hz'}]})}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
const effect=(id:string,name:string):NativeEffect=>({instanceId:id,name,pluginId:'au:test',format:'AU',enabled:true,bypass:false,parameters:{'0':440},state:'program'});
beforeEach(()=>{Object.defineProperty(navigator,'userAgent',{value:'Macintosh',configurable:true});useProjectStore.setState({...useProjectStore.getInitialState(),project:{...useProjectStore.getInitialState().project,nativeEffects:[effect('a','Bandpass'),effect('b','Delay')]}});useUIStore.setState({timelineRecording:false});});
it('keeps parameters collapsed, exposes touch buttons, and persists ordered rack edits',async()=>{
 render(<NativeEffectRack scope="master"/>);expect(screen.queryByLabelText('Frequency')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Bandpass'}));await screen.findByText('Frequency');
 const buttons=screen.getAllByRole('button',{name:'rack.moveDown'});fireEvent.click(buttons[0]);expect(useProjectStore.getState().project.nativeEffects?.map(effect=>effect.name)).toEqual(['Delay','Bandpass']);
 fireEvent.click(screen.getAllByRole('button',{name:'sourcePlugins.bypass'})[0]);expect(useProjectStore.getState().project.nativeEffects![0].bypass).toBe(true);
 fireEvent.click(screen.getAllByRole('button',{name:'timeline.disableEffect'})[0]);expect(useProjectStore.getState().project.nativeEffects![0].enabled).toBe(false);
 fireEvent.click(screen.getAllByRole('button',{name:'timeline.removeEffect'})[0]);expect(useProjectStore.getState().project.nativeEffects?.map(effect=>effect.name)).toEqual(['Bandpass']);
});
it('prevents rack edits during playback and recording and leaves ordinary racks empty',()=>{
 useProjectStore.setState({isPlaying:true});const view=render(<NativeEffectRack scope="master"/>);expect(screen.getAllByRole('button',{name:'timeline.disableEffect'})[0]).toBeDisabled();act(()=>useProjectStore.setState({isPlaying:false}));expect(screen.getAllByRole('button',{name:'sourcePlugins.bypass'})[0]).not.toBeDisabled();act(()=>useUIStore.setState({timelineRecording:true}));expect(screen.getAllByRole('button',{name:'sourcePlugins.bypass'})[0]).toBeDisabled();view.unmount();const empty=render(<NativeEffectRack scope="track:missing"/>);expect(empty.container.textContent).toBe('');
});
