import {useRef} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import '../../../src/i18n';
import {Modal} from '../../../src/components/common/Modal';
afterEach(()=>{cleanup();vi.useRealTimers();});
function FormReview(){const ref=useRef<HTMLInputElement>(null);return <Modal isOpen onClose={()=>{}} initialFocusRef={ref}><input ref={ref} aria-label="Review value"/></Modal>;}
it('immediately focuses a review field, preserves fast input after 50 ms and restores previous focus',()=>{
 vi.useFakeTimers();const trigger=document.createElement('button');document.body.appendChild(trigger);trigger.focus();
 const view=render(<FormReview/>),field=screen.getByRole('textbox',{name:'Review value'});expect(document.activeElement).toBe(field);fireEvent.change(field,{target:{value:'20'}});act(()=>vi.advanceTimersByTime(60));expect(document.activeElement).toBe(field);expect((field as HTMLInputElement).value).toBe('20');view.unmount();expect(document.activeElement).toBe(trigger);trigger.remove();
});
it('retains the default delayed close-button focus for other dialogs',()=>{
 vi.useFakeTimers();render(<Modal isOpen onClose={()=>{}}><p>Other dialog</p></Modal>);act(()=>vi.advanceTimersByTime(60));expect(document.activeElement).toBe(screen.getByRole('button',{name:'Close panel',exact:true}));
});

it('preserves a field focused before the default timer and includes Help in the focus trap',()=>{
 vi.useFakeTimers();render(<Modal isOpen onClose={()=>{}}><input aria-label="Fast edit"/><details><summary>Help</summary><p>Explanation</p></details></Modal>);
 const field=screen.getByRole('textbox',{name:'Fast edit'});field.focus();fireEvent.change(field,{target:{value:'90'}});act(()=>vi.advanceTimersByTime(60));expect(document.activeElement).toBe(field);
 const help=screen.getByText('Help');help.focus();fireEvent.keyDown(help,{key:'Tab'});expect(document.activeElement).toBe(screen.getByRole('button',{name:'Close panel',exact:true}));
});

it('keeps fast paste-bound edits focused and applies the displayed retimed interval',async()=>{
 const {GainEnvelopePaste}=await import('../../../src/components/timeline/GainEnvelopePaste');
 const {useProjectStore}=await import('../../../src/stores/projectStore');
 const {copyEffectEnvelope}=await import('../../../src/lib/effectEnvelope');
 const {automationValue}=await import('../../../src/lib/automationRecording');
 vi.useFakeTimers();
 const project={...useProjectStore.getInitialState().project,duration:10,minimumDuration:10,tracks:[{id:'t',name:'Chorus',volume:1,pan:0,muted:false,solo:false,segments:[],effects:[{type:'chorus' as const,enabled:true,params:{rate:1.5},automation:{rate:[{time:0,value:.6},{time:10,value:.4}]}}]}]};
 useProjectStore.getState().loadProjectState(project,new Map());const onClose=vi.fn(),loaded=useProjectStore.getState().project;
 render(<GainEnvelopePaste project={loaded} trackId="t" effectIndex={0} envelope={copyEffectEnvelope(project,'t',0,'rate',1,7)} onClose={onClose}/>);
 const time=screen.getByRole('spinbutton',{name:'Destination time (s)'}),length=screen.getByRole('spinbutton',{name:'Destination length (s)'});
 expect(document.activeElement).toBe(time);fireEvent.change(time,{target:{value:'4'}});length.focus();fireEvent.change(length,{target:{value:'3'}});act(()=>vi.advanceTimersByTime(60));expect(document.activeElement).toBe(length);expect((length as HTMLInputElement).value).toBe('3');
 fireEvent.submit(length.closest('form')!);expect(onClose).toHaveBeenCalledOnce();
 const result=useProjectStore.getState().project,target={trackId:'t',effectIndex:0,parameter:'rate' as const};
 expect(automationValue(result,target,4)).toBeCloseTo(.58,12);expect(automationValue(result,target,7)).toBeCloseTo(.46,12);expect(automationValue(result,target,8)).toBeCloseTo(automationValue(project,target,8),12);
});
it('nested inspectors keep unique titles, focus only the top dialog and close one level on Escape',()=>{
 vi.useFakeTimers();const outer=vi.fn(),inner=vi.fn();render(<><Modal isOpen title="Clip inspector" onClose={outer}><p>Clip</p></Modal><Modal isOpen title="FX inspector" onClose={inner}><p>FX</p></Modal></>);
 const dialogs=screen.getAllByRole('dialog');expect(dialogs[0].getAttribute('aria-labelledby')).not.toBe(dialogs[1].getAttribute('aria-labelledby'));expect(screen.getByRole('dialog',{name:'FX inspector'})).toBe(dialogs[1]);act(()=>vi.advanceTimersByTime(60));expect(dialogs[1].contains(document.activeElement)).toBe(true);fireEvent.keyDown(document,{key:'Escape'});expect(inner).toHaveBeenCalledOnce();expect(outer).not.toHaveBeenCalled();
});
