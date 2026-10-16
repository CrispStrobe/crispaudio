import {afterEach,beforeEach,expect,it} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import '../../../src/i18n';
import i18n from '../../../src/i18n';
import {TrackTemplates} from '../../../src/components/timeline/TrackTemplates';
import {runTimelineTool} from '../../../src/hooks/useTimelineTool';
import {useProjectStore} from '../../../src/stores/projectStore';
import {useTrackTemplateStore} from '../../../src/stores/trackTemplateStore';
import {useUIStore} from '../../../src/stores/uiStore';
beforeEach(async()=>{await i18n.changeLanguage('en');localStorage.clear();useTrackTemplateStore.setState({templates:[]});useUIStore.setState({timelineRecording:false});useProjectStore.getState().loadProjectState({...useProjectStore.getInitialState().project,tracks:[{id:'voice',name:'Interview',volume:.7,pan:0,segments:[],muted:false,solo:false}]},new Map());});
afterEach(cleanup);
it('opens from the menu, saves reusable settings, adds without changing source, and deletes a library entry',async()=>{
 render(<TrackTemplates/>);await act(()=>runTimelineTool('track-templates'));
 const details=screen.getByText('Save from track').closest('details')!;expect(details.open).toBe(false);fireEvent.click(screen.getByText('Save from track'));
 fireEvent.change(screen.getByRole('textbox',{name:'Template name'}),{target:{value:'Interview preset'}});fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));expect(useTrackTemplateStore.getState().templates).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Add track',exact:true}));expect(screen.queryByRole('dialog')).toBeNull();expect(useProjectStore.getState().project.tracks.map(t=>t.name)).toEqual(['Interview','Interview preset']);expect(useProjectStore.getState().project.tracks[1].volume).toBe(.7);
 await act(()=>runTimelineTool('track-templates'));fireEvent.click(screen.getByRole('button',{name:'Delete',exact:true}));expect(useTrackTemplateStore.getState().templates).toHaveLength(0);expect(useProjectStore.getState().project.tracks).toHaveLength(2);
});
it('blocks creation during recording or after switching projects and does not reuse stale source state',async()=>{
 render(<TrackTemplates/>);await act(()=>runTimelineTool('track-templates'));act(()=>useUIStore.setState({timelineRecording:true}));expect(screen.getByRole('button',{name:'Add track',exact:true})).toBeDisabled();act(()=>useUIStore.setState({timelineRecording:false}));
 act(()=>useProjectStore.getState().loadProjectState({...useProjectStore.getState().project,id:'different'},new Map()));expect(screen.getByRole('button',{name:'Add track',exact:true})).toBeDisabled();expect(screen.getByRole('alert')).toBeTruthy();
});
it('opens for the track requested by its inspector',()=>{render(<TrackTemplates/>);act(()=>window.dispatchEvent(new CustomEvent('crispaudio-track-templates',{detail:'voice'})));expect(screen.getByRole('textbox',{name:'Template name'})).toHaveValue('Interview');});

it('uses the selected clip track and falls back to audio for a selected bus',async()=>{
 const state=useProjectStore.getState(),second={...state.project.tracks[0],id:'second',name:'Selected clip track',segments:[{id:'selected-clip'} as never]},bus={...state.project.tracks[0],id:'bus',name:'Bus',kind:'bus' as const};
 useProjectStore.setState({project:{...state.project,tracks:[...state.project.tracks,second,bus]},selection:{segmentIds:['selected-clip'],startTime:0,endTime:1}});
 render(<TrackTemplates/>);await act(()=>runTimelineTool('track-templates'));expect(screen.getByRole('textbox',{name:'Template name'})).toHaveValue('Selected clip track');
 act(()=>window.dispatchEvent(new CustomEvent('crispaudio-track-templates',{detail:'bus'})));expect(screen.getByRole('textbox',{name:'Template name'})).toHaveValue('Interview');
});
