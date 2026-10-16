import {it,expect} from 'vitest';
import {identifyEffectRack,pasteEffectRack} from '../../../src/lib/builtinEffectIdentity';
import type {EffectConfig} from '../../../src/types/audio';
it('repairs duplicate/legacy IDs without mutating snapshots and retains distinct IDs on later edits',()=>{
 const rack:EffectConfig[]=[{instanceId:'existing',type:'delay',enabled:true,params:{time:.2}},{instanceId:'existing',type:'delay',enabled:true,params:{time:.4}},{type:'chorus',enabled:true,params:{rate:1}}],before=structuredClone(rack);
 const identified=identifyEffectRack(rack);
 expect(new Set(identified.map(effect=>effect.instanceId)).size).toBe(3);
 expect(identified[0].instanceId).toBe('existing');expect(identifyEffectRack(identified)).toEqual(identified);expect(rack).toEqual(before);
 const pasted=pasteEffectRack(identified);expect(pasted.every(effect=>!identified.some(source=>source.instanceId===effect.instanceId))).toBe(true);
 pasted[0].params.time=1;expect(identified[0].params.time).toBe(.2);
});
