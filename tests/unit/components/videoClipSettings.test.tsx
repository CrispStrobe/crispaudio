import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoClipSettings } from '../../../src/components/timeline/VideoClipSettings';
import { useProjectStore } from '../../../src/stores/projectStore';
import type { VideoClip, AudioSegment } from '../../../src/types/audio';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
const picture=(id:string,startTime:number):VideoClip=>({id,startTime,duration:4,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0});
beforeEach(()=>{
  const initial=useProjectStore.getInitialState();
  const audio:AudioSegment={id:'a',linkGroup:'g',trackId:'t',sourceId:'s',name:'mic',color:'blue',startTime:3,sourceOffset:0,duration:4,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'};
  const incoming={...picture('incoming',3),linkGroup:'g',transition:'fade' as const,transitionDuration:1};
  useProjectStore.setState({...initial,project:{...initial.project,duration:7,tracks:[{id:'t',name:'mic',muted:false,solo:false,volume:1,pan:0,segments:[audio]}],video:{path:'/v.mp4',duration:20,session:{} as never,clips:[picture('first',0),incoming]}},sources:new Map([['s',{id:'s',duration:5} as never]]),selection:{startTime:3,endTime:7,segmentIds:['incoming','a']}});
  useProjectStore.temporal.getState().clear();
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const edit=(label:string,value:string)=>{const field=screen.getByLabelText(label);act(()=>field.focus());fireEvent.change(field,{target:{value}});fireEvent.keyDown(field,{key:'Enter'});return field;};
describe('picture inspector edits',()=>{
  it('changes a linked blend style without moving sound and retains group selection',()=>{
    render(<VideoClipSettings id="incoming"/>);const before=JSON.stringify(useProjectStore.getState().project.tracks);
    expect(screen.getByLabelText('editing.transition')).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('editing.transition'),{target:{value:'wipeleft'}});
    expect(useProjectStore.getState().project.video?.clips?.[1]).toMatchObject({startTime:3,transition:'wipeleft',transitionDuration:1,linkGroup:'g'});
    expect(JSON.stringify(useProjectStore.getState().project.tracks)).toBe(before);
    expect(useProjectStore.getState().selection?.segmentIds.sort()).toEqual(['a','incoming']);
    expect(screen.getByLabelText('editing.transitionDuration')).toBeDisabled();
    expect(screen.getByRole('option',{name:'editing.transition_cut'})).toBeDisabled();
    act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project.video?.clips?.[1].transition).toBe('fade');
  });
  it('preserves a long unlinked overlap when only its transition style changes',()=>{
    useProjectStore.setState(state=>({project:{...state.project,video:{...state.project.video!,clips:[picture('first',0),{...picture('incoming',1),transition:'fade',transitionDuration:3}]}}}));
    render(<VideoClipSettings id="incoming"/>);fireEvent.change(screen.getByLabelText('editing.transition'),{target:{value:'wipeleft'}});
    expect(useProjectStore.getState().project.video?.clips?.[1]).toMatchObject({startTime:1,transition:'wipeleft',transitionDuration:3});
  });
  it('does not round or add undo history when a numeric field is only focused and blurred',()=>{
    useProjectStore.setState(state=>({project:{...state.project,video:{...state.project.video!,clips:[picture('first',0),{...picture('incoming',5),sourceOffset:.1234}]}}}));
    useProjectStore.temporal.getState().clear();render(<VideoClipSettings id="incoming"/>);
    const before=JSON.stringify(useProjectStore.getState().project),field=screen.getByLabelText('editing.sourceOffset');act(()=>field.focus());act(()=>field.blur());
    expect(JSON.stringify(useProjectStore.getState().project)).toBe(before);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
  });
  it('rejects blank input and cancels edits with Escape',()=>{
    render(<VideoClipSettings id="incoming"/>);const before=JSON.stringify(useProjectStore.getState().project),field=edit('editing.duration','');
    expect(field).toHaveAttribute('aria-invalid','true');expect(JSON.stringify(useProjectStore.getState().project)).toBe(before);
    act(()=>field.focus());fireEvent.change(field,{target:{value:'2'}});fireEvent.keyDown(field,{key:'Escape'});
    expect(field).toHaveValue(4);expect(field).toHaveAttribute('aria-invalid','false');expect(JSON.stringify(useProjectStore.getState().project)).toBe(before);
  });
  it('rejects typed changes beyond the linked audio source rather than silently clamping them',()=>{
    render(<VideoClipSettings id="incoming"/>);const before=JSON.stringify(useProjectStore.getState().project),field=edit('editing.duration','6');
    expect(field).toHaveAttribute('aria-invalid','true');expect(JSON.stringify(useProjectStore.getState().project)).toBe(before);expect(screen.getByRole('alert')).toBeTruthy();act(()=>field.focus());fireEvent.keyDown(field,{key:'Escape'});expect(screen.queryByRole('alert')).toBeNull();
  });
  it('moves a linked group into an overlap, updates selection bounds and undoes once',()=>{
    render(<VideoClipSettings id="incoming"/>);edit('editing.startTime','2');const state=useProjectStore.getState();
    expect(state.project.video?.clips?.[1]).toMatchObject({startTime:2,transitionDuration:2});expect(state.project.tracks[0].segments[0].startTime).toBe(2);expect(state.selection).toMatchObject({startTime:2,endTime:6});
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project.tracks[0].segments[0].startTime).toBe(3);
  });
  it('commits an unlinked transition duration on Enter and leaves sound in place',()=>{
    useProjectStore.setState(state=>({project:{...state.project,video:{...state.project.video!,clips:state.project.video!.clips!.map(c=>({...c,linkGroup:undefined}))}}}));
    render(<VideoClipSettings id="incoming"/>);edit('editing.transitionDuration','2');
    expect(useProjectStore.getState().project.video?.clips?.[1]).toMatchObject({startTime:2,transitionDuration:2});expect(useProjectStore.getState().project.tracks[0].segments[0].startTime).toBe(3);
  });
  it('keeps a picture gap when choosing Cut on an already unlinked cut',()=>{
    useProjectStore.setState(state=>({project:{...state.project,video:{...state.project.video!,clips:[picture('first',0),picture('incoming',6)]}}}));
    render(<VideoClipSettings id="incoming"/>);fireEvent.change(screen.getByLabelText('editing.transition'),{target:{value:'cut'}});
    expect(useProjectStore.getState().project.video?.clips?.[1].startTime).toBe(6);
  });
  it('rejects an incoming transition on the first picture without altering the project',()=>{
    render(<VideoClipSettings id="first"/>);const before=JSON.stringify(useProjectStore.getState().project);
    fireEvent.change(screen.getByLabelText('editing.transition'),{target:{value:'fade'}});
    expect(screen.getByRole('alert')).toHaveTextContent('editing.needPrevious');expect(JSON.stringify(useProjectStore.getState().project)).toBe(before);
  });

});
