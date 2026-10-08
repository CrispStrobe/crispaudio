import { act,cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import { TimeField } from '../../../src/components/timeline/TimeField';
afterEach(cleanup);
it('commits colon-formatted input with Enter and cancels with Escape',()=>{
 const commit=vi.fn();render(<TimeField label="POS" value={2} onCommit={commit}/>);const field=screen.getByLabelText('POS');
 act(()=>field.focus());fireEvent.change(field,{target:{value:'01:03.25'}});fireEvent.keyDown(field,{key:'Enter'});expect(commit).toHaveBeenLastCalledWith(63.25);
 commit.mockClear();act(()=>field.focus());fireEvent.change(field,{target:{value:'25'}});fireEvent.keyDown(field,{key:'Escape'});expect(commit).not.toHaveBeenCalled();expect(field).toHaveValue('00:02.000');
});
it('marks malformed input and preserves the timeline',()=>{const commit=vi.fn();render(<TimeField label="DUR" value={10} onCommit={commit}/>);const field=screen.getByLabelText('DUR');act(()=>field.focus());fireEvent.change(field,{target:{value:'1:99'}});act(()=>field.blur());expect(commit).not.toHaveBeenCalled();expect(field).toHaveAttribute('aria-invalid','true');});
