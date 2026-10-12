import {describe,it,expect} from 'vitest';
import {routingOrder,removeRoutingTrack} from '../../../src/lib/audioRouting';
import {audibleTracks} from '../../../src/lib/timelineView';
import type {TimelineTrack} from '../../../src/types/audio';
const track=(id:string,patch:Partial<TimelineTrack>={}):TimelineTrack=>({id,name:id,segments:[],volume:1,pan:0,muted:false,solo:false,...patch});
describe('saved routing topology',()=>{
  it('orders nested buses after sources while keeping legacy summation order',()=>{
    const tracks=[track('room',{kind:'bus',output:'mix'}),track('mix',{kind:'bus'}),track('voice',{output:'mix',sends:[{id:'r',target:'room',gain:.2,preFader:false}]})];
    expect(routingOrder(tracks).map(t=>t.id)).toEqual(['voice','room','mix']);
    expect(routingOrder([track('a'),track('b')]).map(t=>t.id)).toEqual(['a','b']);
  });
  it('rejects missing/non-bus outputs, cycles even at zero send gain and malformed sends',()=>{
    expect(()=>routingOrder([track('a',{output:'gone'})])).toThrow('routing.missing');
    expect(()=>routingOrder([track('a',{output:'b'}),track('b')])).toThrow();
    expect(()=>routingOrder([track('a',{kind:'bus',sends:[{id:'s',target:'a',gain:0,preFader:true}]})])).toThrow('routing.cycle');
    expect(()=>routingOrder([track('a',{sends:[{id:'s',target:'master',gain:NaN,preFader:true}]})])).toThrow();
  });
  it('removes references when deleting a bus, without losing remaining sends',()=>{
    const tracks=removeRoutingTrack([track('b',{kind:'bus'}),track('a',{output:'b',sends:[{id:'b',target:'b',gain:1,preFader:true},{id:'m',target:'master',gain:1,preFader:false}]})],'b');
    expect(tracks[0].output).toBe('master');expect(tracks[0].sends?.map(s=>s.id)).toEqual(['m']);
  });
  it('keeps a solo source destination audible without admitting unrelated sources',()=>{
    expect(audibleTracks([track('a',{solo:true,output:'b'}),track('c',{output:'b'}),track('b',{kind:'bus'})]).map(t=>t.id)).toEqual(['a','b']);
    expect(audibleTracks([track('a',{output:'b'}),track('b',{kind:'bus',solo:true})]).map(t=>t.id)).toEqual(['a','b']);
  });
});
