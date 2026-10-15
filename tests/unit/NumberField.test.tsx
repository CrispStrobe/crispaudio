import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {NumberField} from '../../src/components/timeline/NumberField';
afterEach(cleanup);
function field(onCommit=vi.fn(()=>true)){
 render(<NumberField label="Level" value={1} min={0} max={2} step={.1} onCommit={onCommit}/>);
 const input=screen.getByRole('spinbutton') as HTMLInputElement;
 input.setPointerCapture=vi.fn();
 return {input,onCommit};
}
function pointer(input:HTMLInputElement,type:string,y:number){
 const event=new Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerType:'touch',pointerId:1,clientY:y});fireEvent(input,event);
}
it('previews a touch drag and commits only once on release within its bounds',()=>{
 const {input,onCommit}=field();pointer(input,'pointerdown',100);pointer(input,'pointermove',60);
 expect(input.value).toBe('1.5');expect(onCommit).not.toHaveBeenCalled();pointer(input,'pointermove',-100);expect(input.value).toBe('2');pointer(input,'pointerup',-100);expect(onCommit).toHaveBeenCalledExactlyOnceWith(2);
});
it('ignores tiny touch movement and cancels an interrupted drag',()=>{
 const {input,onCommit}=field();pointer(input,'pointerdown',100);pointer(input,'pointermove',96);pointer(input,'pointerup',96);expect(document.activeElement).toBe(input);expect(onCommit).not.toHaveBeenCalled();fireEvent.blur(input);
 pointer(input,'pointerdown',100);pointer(input,'pointermove',140);pointer(input,'pointercancel',140);expect(input.value).toBe('1');expect(onCommit).not.toHaveBeenCalled();
});
it('validates exact entry before publishing',()=>{
 const {input,onCommit}=field();fireEvent.focus(input);fireEvent.change(input,{target:{value:'3'}});fireEvent.blur(input);expect(input.getAttribute('aria-invalid')).toBe('true');expect(onCommit).not.toHaveBeenCalled();
 fireEvent.focus(input);fireEvent.change(input,{target:{value:'1.7'}});fireEvent.blur(input);expect(onCommit).toHaveBeenCalledExactlyOnceWith(1.7);
});
it('does not edit when disabled',()=>{
 const onCommit=vi.fn(()=>true);render(<NumberField label="Locked" value={1} step={.1} disabled onCommit={onCommit}/>);const input=screen.getByRole('spinbutton') as HTMLInputElement;pointer(input,'pointerdown',100);pointer(input,'pointermove',60);pointer(input,'pointerup',60);expect(onCommit).not.toHaveBeenCalled();
});

it('Escape discards a typed draft',()=>{const {input,onCommit}=field();input.focus();fireEvent.change(input,{target:{value:'1.8'}});fireEvent.keyDown(input,{key:'Escape'});expect(onCommit).not.toHaveBeenCalled();expect(input.value).toBe('1');});

it('restores a live preview when a touch gesture is cancelled',()=>{
 const preview=vi.fn(),end=vi.fn(),commit=vi.fn(()=>true);
 render(<NumberField label="Live" value={1} min={0} max={2} step={.1} onPreview={preview} onEnd={end} onCommit={commit}/>);
 const input=screen.getByRole('spinbutton') as HTMLInputElement;input.setPointerCapture=vi.fn();pointer(input,'pointerdown',100);pointer(input,'pointermove',60);expect(preview).toHaveBeenLastCalledWith(1.5);pointer(input,'pointercancel',60);expect(preview).toHaveBeenLastCalledWith(1);expect(commit).not.toHaveBeenCalled();expect(end).toHaveBeenCalledOnce();
});
