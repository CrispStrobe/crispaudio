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
