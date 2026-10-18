import {afterEach,it,expect,vi} from 'vitest';
import {act,cleanup,renderHook} from '@testing-library/react';
import {useAutosave,restoreAutosave} from '../../../src/hooks/useAutosave';
import {useProjectStore} from '../../../src/stores/projectStore';
import {freezeTrack} from '../../../src/lib/trackFreeze';
import type {AudioSource} from '../../../src/types/audio';
afterEach(()=>{cleanup();vi.useRealTimers();Reflect.deleteProperty(window,'__TAURI_INTERNALS__');useProjectStore.getState().loadProjectState({...useProjectStore.getInitialState().project,id:crypto.randomUUID()},new Map());localStorage.clear();});
it('linked autosave retains both frozen audio and original sources; layout-only restore refuses frozen tracks',()=>{
 vi.useFakeTimers();Object.assign(window,{__TAURI_INTERNALS__:{}});
 const make=(id:string,length:number):AudioSource=>({id,name:id,filePath:`/${id}.wav`,sampleRate:48000,channels:2,duration:length/48000,peaks:{min:new Float32Array(1),max:new Float32Array(1)},buffer:{length,sampleRate:48000,numberOfChannels:2,duration:length/48000} as AudioBuffer});
 const raw=make('raw',48000),rendered=make('frozen',144000),sources=new Map([['raw',raw],['frozen',rendered]]),project={...useProjectStore.getInitialState().project,id:crypto.randomUUID(),sampleRate:48000,tracks:[{id:'track',name:'Track',muted:false,solo:false,volume:1,pan:0,segments:[{id:'clip',trackId:'track',sourceId:'raw',startTime:0,duration:1,sourceOffset:0,fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear' as const,fadeOutCurve:'linear' as const,effects:[],gain:1,name:'Clip',color:'#fff'}]}]};
 const frozen=freezeTrack(project,'track',rendered,2);useProjectStore.getState().loadProjectState(frozen,sources);renderHook(()=>useAutosave());act(()=>vi.advanceTimersByTime(30000));const saved=JSON.parse(localStorage.getItem('crispaudio-autosave')!),linked=JSON.parse(saved.linked);expect(linked.version).toBe(5);expect(linked.sources.map((s:{id:string})=>s.id).sort()).toEqual(['frozen','raw']);const current=useProjectStore.getState().project;expect(restoreAutosave()).toBe(false);expect(useProjectStore.getState().project).toBe(current);
});
