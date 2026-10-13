import {it,expect} from 'vitest';
import {recordedEnvelope} from '../../../src/lib/recordedEnvelope';
import {gainAt} from '../../../src/lib/mixAutomation';
import {supportsEffectParameter,validEffectAutomation,effectParameterDefault} from '../../../src/lib/effectAutomation';
import {effectClipboardKey} from '../../../src/lib/effectEnvelope';
const bounds={rate:48000,duration:10,minimum:0,maximum:2000,fallback:200};
it('reviewed passes preserve the envelope outside one-sample guards and retain no-op identity',()=>{
 const old=[{time:0,value:100},{time:5,value:400,curve:'step' as const},{time:8,value:200}],points=recordedEnvelope(old,[{points:[{time:2,value:600},{time:3,value:900}]}],bounds);
 expect(gainAt(points,1)).toBe(gainAt(old,1));expect(gainAt(points,4)).toBe(gainAt(old,4));expect(gainAt(points,6)).toBe(gainAt(old,6));expect(gainAt(points,2)).toBe(600);expect(old).toHaveLength(3);
 expect(recordedEnvelope([{time:0,value:200}],[{points:[{time:2,value:200},{time:3,value:200}]}],bounds)).toEqual([{time:0,value:200}]);const flat=[{time:0,value:200}];expect(recordedEnvelope(flat,[{points:[{time:2,value:200},{time:3,value:200}]}],bounds)).toBe(flat);
});
it('rejects overlapping, unordered, out-of-range and over-limit passes before publication',()=>{
 for(const spans of [[{points:[{time:2,value:600},{time:2,value:900}]}],[{points:[{time:2,value:600},{time:3,value:2001}]}],[{points:[{time:9,value:600},{time:11,value:900}]}],[{points:[{time:2,value:600},{time:3,value:900}]},{points:[{time:3,value:600},{time:4,value:900}]}]])expect(()=>recordedEnvelope([],spans,bounds)).toThrow();
});
it('frequency belongs only to the ring carrier and uses an independent tagged clipboard',()=>{
 expect(supportsEffectParameter('ringmod','freq')).toBe(true);expect(supportsEffectParameter('chorus','freq')).toBe(false);expect(effectParameterDefault('ringmod','freq')).toBe(200);expect(effectClipboardKey('ringmod','freq')).toBe('ringmodFreq');expect(effectClipboardKey('ringmod','mix')).toBe('ringmodMix');
 const effect={type:'ringmod' as const,enabled:true,params:{freq:200,mix:.5},automation:{freq:[{time:0,value:0},{time:1,value:2000}]}};expect(validEffectAutomation(effect)).toBe(true);effect.automation.freq[1].value=2001;expect(validEffectAutomation(effect)).toBe(false);
});
