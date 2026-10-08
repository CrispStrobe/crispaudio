import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchNativeMenu, registerTimelineMenu, nativeMenuContext, nativeMenuBusy } from '../../../src/lib/nativeMenu';
import { useSynthStore } from '../../../src/stores/synthStore';
import { useUIStore } from '../../../src/stores/uiStore';
import { useProjectStore } from '../../../src/stores/projectStore';
let stop:(()=>void)|undefined;
beforeEach(()=>{useUIStore.setState(useUIStore.getInitialState());useProjectStore.setState(useProjectStore.getInitialState());document.body.replaceChildren();});
afterEach(()=>{stop?.();stop=undefined;document.body.replaceChildren();});
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
describe('native menu routing',()=>{
 it('uses the active SFX history without changing the timeline',async()=>{
  useUIStore.getState().setActivePanel('sfx');useSynthStore.temporal.getState().clear();
  const original=useSynthStore.getState().paramsA.p_base_freq;
  useSynthStore.getState().setParams({p_base_freq:original===.7?.6:.7});
  expect(nativeMenuContext().canUndo).toBe(true);dispatchNativeMenu('undo');await settle();
  expect(useSynthStore.getState().paramsA.p_base_freq).toBe(original);
  expect(useUIStore.getState().activePanel).toBe('sfx');
 });
 it('opens the lazy timeline before dispatching a file command exactly once',async()=>{
  useUIStore.getState().setActivePanel('voice');dispatchNativeMenu('open');expect(useUIStore.getState().activePanel).toBe('timeline');
  const action=vi.fn();stop=registerTimelineMenu(action);await settle();expect(action).toHaveBeenCalledExactlyOnceWith('open');
  stop();stop=registerTimelineMenu(action);await settle();expect(action).toHaveBeenCalledOnce();
 });
 it('keeps text editing separate from clip editing',async()=>{
  const action=vi.fn();stop=registerTimelineMenu(action);const input=document.createElement('input');document.body.append(input);input.focus();
  expect(nativeMenuContext().textEditing).toBe(true);dispatchNativeMenu('cut');await settle();expect(action).not.toHaveBeenCalled();
  input.blur();dispatchNativeMenu('cut');await settle();expect(action).toHaveBeenCalledWith('cut');
 });
 it('blocks menu edits behind modal and contextual-help overlays',async()=>{
  const action=vi.fn();stop=registerTimelineMenu(action);const dialog=document.createElement('div');dialog.setAttribute('role','dialog');document.body.append(dialog);
  dispatchNativeMenu('delete');expect(nativeMenuContext().blocked).toBe(true);expect(action).not.toHaveBeenCalled();
  dialog.remove();const editor=document.createElement('div');editor.dataset.timelineHelp='true';document.body.append(editor);dispatchNativeMenu('undo');expect(action).not.toHaveBeenCalled();
  editor.remove();dispatchNativeMenu('delete');await settle();expect(action).toHaveBeenCalledExactlyOnceWith('delete');
 });
 it('serializes asynchronous dialogs and ignores stale duplicate commands',async()=>{
  let finish:()=>void=()=>{};const action=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));stop=registerTimelineMenu(action);
  dispatchNativeMenu('save');dispatchNativeMenu('open');expect(action).toHaveBeenCalledExactlyOnceWith('save');expect(nativeMenuBusy()).toBe(true);
  finish();await settle();expect(nativeMenuBusy()).toBe(false);
 });
 it('routes app commands independently and ignores unknown commands',async()=>{
  const action=vi.fn();stop=registerTimelineMenu(action);dispatchNativeMenu('settings');expect(useUIStore.getState().activeModal).toBe('settings');
  useUIStore.getState().closeModal();dispatchNativeMenu('sfx');expect(useUIStore.getState().activePanel).toBe('sfx');dispatchNativeMenu('bogus');await settle();expect(action).not.toHaveBeenCalled();
 });
});
