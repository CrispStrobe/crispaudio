import {create} from 'zustand';
import type {CurveEnvelope} from '../lib/curveRange';
import type {EffectEnvelope} from '../lib/effectEnvelope';
export type CurveDomain={kind:'builtin';effectType:EffectEnvelope['effectType'];parameter:EffectEnvelope['parameter']}|{kind:'native';pluginId:string;address:string;min:number;max:number};
export const nativeCurveKey=(domain:Extract<CurveDomain,{kind:'native'}>)=>JSON.stringify([domain.pluginId,domain.address,domain.min,domain.max]);
/** Session clipboard only. A different plug-in, parameter or reported range cannot reuse it. */
export const useCurveClipboardStore=create<{key:string;envelope:CurveEnvelope|null}>(()=>({key:'',envelope:null}));
