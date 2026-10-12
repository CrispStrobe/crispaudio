import {it,expect} from 'vitest';
import {Ducking,duckingDefaults} from '../../../src/audio/dsp/ducking';
import {routingOrder} from '../../../src/lib/audioRouting';
import type {TimelineTrack} from '../../../src/types/audio';
it('ducks the destination with attack/release, bounded attenuation and unity with no detector',()=>{
  const follower=new Ducking(48000),config={...duckingDefaults,maximum:12};
  expect(follower.gain(0,config)).toBe(1);
  let gain=1;for(let i=0;i<48000;i++)gain=follower.gain(.5,config);
  expect(gain).toBeCloseTo(10**(-12/20),8);
  const start=gain;for(let i=0;i<48000*3;i++)gain=follower.gain(0,config);
  expect(gain).toBeGreaterThan(start);expect(gain).toBe(1);
});
it('adds detector dependencies to routing and rejects sidechain/audio feedback',()=>{
  const base={segments:[],name:'Track',volume:1,pan:0,muted:false,solo:false};
  const target:TimelineTrack={...base,id:'music',ducking:{...duckingDefaults,source:'voice'}};
  expect(routingOrder([target,{...base,id:'voice'}]).map(t=>t.id)).toEqual(['voice','music']);
  expect(()=>routingOrder([{...target,kind:'bus'},{...base,id:'voice',output:'music'}])).not.toThrow();
  expect(()=>routingOrder([{...target,kind:'bus'},{...base,id:'voice',kind:'bus',ducking:{...duckingDefaults,source:'music'}}])).toThrow('routing.cycle');
});
