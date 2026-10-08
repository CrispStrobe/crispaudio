import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineHelp } from '../../../src/components/timeline/TimelineHelp';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
beforeEach(()=>vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function Editor({action}:{action:()=>void}){
 const [open,setOpen]=useState(true);
 return <div className="timeline-editor">
  <button data-help-toggle onClick={()=>setOpen(value=>!value)}>Help</button>
  <button data-help="move" onClick={action}>Move</button>
  <input data-help="height" aria-label="Height" type="range"/>
  <button data-help="remove" disabled>Delete</button>
  {open&&<TimelineHelp open onClose={()=>setOpen(false)}/>}
 </div>;
}
describe('contextual timeline help',()=>{
 it('shows one explanation beside the inspected control without a modal',()=>{
  render(<Editor action={vi.fn()}/>);
  fireEvent.pointerOver(screen.getByRole('button',{name:'Move'}));
  expect(screen.getByRole('note')).toHaveTextContent('usability.help_move');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button',{name:'Move'})).toHaveAttribute('data-help-target','true');
  fireEvent.focus(screen.getByRole('slider'));
  expect(screen.getAllByRole('note')).toHaveLength(1);
  expect(screen.getByRole('note')).toHaveTextContent('usability.help_height');
  expect(screen.getByRole('button',{name:'Move'})).not.toHaveAttribute('data-help-target');
 });
 it('lets touch/click inspect without executing actions; Escape restores normal editing',()=>{
  const action=vi.fn();render(<Editor action={action}/>);
  fireEvent.pointerDown(screen.getByRole('button',{name:'Move'}));
  fireEvent.click(screen.getByRole('button',{name:'Move'}));
  expect(action).not.toHaveBeenCalled();expect(screen.getByRole('note')).toHaveTextContent('usability.help_move');
  fireEvent.keyDown(document,{key:'Escape'});
  expect(screen.queryByRole('note')).toBeNull();expect(document.querySelector('[data-timeline-help]')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Move'}));expect(action).toHaveBeenCalledOnce();
 });
 it('explains disabled actions and exits through the help toggle or close control',()=>{
  render(<Editor action={vi.fn()}/>);
  fireEvent.pointerOver(screen.getByRole('button',{name:'Delete'}));expect(screen.getByRole('note')).toHaveTextContent('usability.help_remove');
  fireEvent.click(screen.getByRole('button',{name:'Help'}));expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Help'}));expect(screen.queryByRole('note')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'usability.closeHelp'}));expect(screen.queryByRole('status')).toBeNull();
 });
});
