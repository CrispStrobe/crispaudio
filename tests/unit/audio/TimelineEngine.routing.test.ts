import { describe, it, expect, vi } from 'vitest';
import { TimelineEngine } from '../../../src/audio/engine/TimelineEngine';
import { useProjectStore } from '../../../src/stores/projectStore';
import type { AudioSegment, AudioSource } from '../../../src/types/audio';

function audioContext() {
  const nodes: ReturnType<typeof node>[] = [];
  function node(type:string) {
    const param=()=>({value:1,setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()});
    return {kind:type, connect:vi.fn(),disconnect:vi.fn(),stop:vi.fn(),start:vi.fn(),gain:param(),frequency:param(),Q:param(),delayTime:param()};
  }
  const make=(type:string)=>{const n=node(type);nodes.push(n);return n;};
  const ctx={currentTime:0,destination:{},createGain:()=>make('gain'),createBufferSource:()=>make('source'),createBiquadFilter:()=>make('filter'),createOscillator:()=>make('osc'),createDelay:()=>make('delay')};
  return {ctx:ctx as unknown as AudioContext,nodes};
}
describe('timeline master routing and graph disposal',()=>{
 it('routes realtime tracks through the ordered master rack and releases effect oscillators',()=>{
  const {ctx,nodes}=audioContext(),engine=new TimelineEngine(ctx);
  const p={...useProjectStore.getInitialState().project,masterEffects:[{type:'lowpass' as const,enabled:true,params:{freq:1200}},{type:'chorus' as const,enabled:true,params:{}}],duration:1,
    tracks:[{id:'t',name:'T',muted:false,solo:false,volume:1,pan:0,segments:[{id:'a',sourceId:'s',trackId:'t',startTime:0,sourceOffset:0,duration:1,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'} as AudioSegment]}]};
  engine.setSources(new Map([['s',{id:'s',buffer:{} as AudioBuffer} as AudioSource]]));
  engine.play(p,0);
  const filter=nodes.find(n=>n.kind==='filter')!;
  expect(filter.frequency.value).toBe(1200);
  const masterInput=nodes[1];
  expect(masterInput.connect).toHaveBeenCalledWith(filter);
  expect(nodes.filter(n=>n.kind==='osc')).toHaveLength(2);
  expect(nodes.filter(n=>n.kind==='osc').every(n=>n.start.mock.calls.length===1)).toBe(true);
  engine.stop();
  expect(nodes.slice(1).every(n=>n.disconnect.mock.calls.length>0)).toBe(true);
  expect(nodes.filter(n=>n.kind==='osc').every(n=>n.stop.mock.calls.length===1)).toBe(true);
  expect(nodes[0].disconnect).not.toHaveBeenCalled(); // caller's output stays connected
  engine.stop();
  expect(nodes.filter(n=>n.kind==='osc').every(n=>n.stop.mock.calls.length===1)).toBe(true);
 });
});
