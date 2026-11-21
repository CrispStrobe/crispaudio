import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {decodedPcmBytes,sessionMemoryBudget,stereoMinutes} from '../../../src/lib/sessionMemory';
import {SessionMemoryNotice} from '../../../src/components/timeline/SessionMemoryNotice';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {AudioSource} from '../../../src/types/audio';

vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
const GiB=1024**3;
// A fake AudioBuffer sized without allocating PCM.
const source=(id:string,frames:number,channels=2,buffer?:AudioBuffer)=>({id,name:id,buffer:buffer??({length:frames,numberOfChannels:channels} as AudioBuffer),duration:frames/48000,sampleRate:48000,channels} as unknown as AudioSource);

describe('session memory accounting',()=>{
  afterEach(()=>{cleanup();act(()=>useProjectStore.setState({sources:new Map()}));});
  it('counts decoded Float32 PCM once per shared buffer',()=>{
    const a=source('a',48000*60),shared=source('b',0,2,a.buffer);
    expect(decodedPcmBytes([a,shared,source('m',48000,1)])).toBe(48000*60*2*4+48000*4);
    expect(stereoMinutes(48000*60*2*4)).toBe(1);
  });
  it('uses a smaller budget on iPhone, iPad and Android than on desktop',()=>{
    expect(sessionMemoryBudget('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0)',5)).toBe(GiB);
    expect(sessionMemoryBudget('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',5)).toBe(GiB);
    expect(sessionMemoryBudget('Mozilla/5.0 (Linux; Android 15)',5)).toBe(GiB);
    expect(sessionMemoryBudget('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',0)).toBe(4*GiB);
  });
  it('warns above the budget, can be dismissed, and returns after further growth',()=>{
    const minutes=(m:number)=>48000*60*m;
    act(()=>useProjectStore.setState({sources:new Map([['a',source('a',minutes(60))]])}));
    render(<SessionMemoryNotice/>);
    expect(screen.queryByRole('status')).toBeNull();
    act(()=>useProjectStore.setState({sources:new Map([['a',source('a',minutes(200))]])}));
    expect(screen.getByRole('status').textContent).toContain('sessionMemory.warning');
    fireEvent.click(screen.getByText('sessionMemory.dismiss'));
    expect(screen.queryByRole('status')).toBeNull();
    act(()=>useProjectStore.setState({sources:new Map([['a',source('a',minutes(220))]])}));
    expect(screen.queryByRole('status')).toBeNull();
    act(()=>useProjectStore.setState({sources:new Map([['a',source('a',minutes(260))]])}));
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
