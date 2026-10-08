import { useState } from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { EffectChainEditor } from '../../../src/components/timeline/EffectChainEditor';
import type { EffectConfig } from '../../../src/types/audio';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
afterEach(cleanup);
const effects: EffectConfig[] = [{type:'lowpass',enabled:true,params:{freq:3000,q:1}},{type:'compressor',enabled:true,params:{threshold:-18}}];
function Rack({label,initial=effects}:{label:string;initial?:EffectConfig[]}) {
  const [value,setValue]=useState(initial);
  return <><EffectChainEditor label={label} effects={value} onChange={setValue}/><output data-testid={label}>{JSON.stringify(value)}</output></>;
}
const value=(label:string)=>JSON.parse(screen.getByTestId(label).textContent!);
describe('shared effect rack',()=>{
 it('reorders, bypasses, copies and pastes independent settings between scopes',()=>{
  render(<><Rack label="clip"/><Rack label="master" initial={[]}/></>);
  const clip=within(screen.getByRole('region',{name:'clip'})),master=within(screen.getByRole('region',{name:'master'}));
  fireEvent.click(clip.getAllByRole('button',{name:'rack.moveDown'})[0]);
  expect(value('clip').map((e:EffectConfig)=>e.type)).toEqual(['compressor','lowpass']);
  fireEvent.click(clip.getByRole('button',{name:'rack.bypass'}));
  expect(value('clip').every((e:EffectConfig)=>!e.enabled)).toBe(true);
  fireEvent.click(clip.getByRole('button',{name:'rack.copy'}));
  fireEvent.click(master.getByRole('button',{name:'rack.paste'}));
  expect(value('master')).toEqual(value('clip'));
  fireEvent.click(master.getByRole('button',{name:'rack.enable'}));
  expect(value('master').every((e:EffectConfig)=>e.enabled)).toBe(true);
  expect(value('clip').every((e:EffectConfig)=>!e.enabled)).toBe(true);
  fireEvent.change(master.getByRole('combobox',{name:'timeline.addEffect'}),{target:{value:'highpass'}});
  expect(value('master').map((e:EffectConfig)=>e.type)).toEqual(['compressor','lowpass','highpass']);
 });
});
