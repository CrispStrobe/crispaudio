import {it,expect} from 'vitest';
import {captureMix,mixProject,saveMixVersion,validMixVersions} from '../../../src/lib/mixVersions';
import {comparisonGain} from '../../../src/lib/mixComparison';
import {useProjectStore} from '../../../src/stores/projectStore';
import {playbackGraphKey} from '../../../src/lib/playbackGraphKey';
import type {TimelineProject} from '../../../src/types/audio';
import type {MixMeasurement} from '../../../src/lib/mixComparison';
const p=():TimelineProject=>({...useProjectStore.getInitialState().project,id:'mix',masterEffects:[],tracks:[{id:'t',name:'Voice',volume:1,pan:0,muted:false,solo:false,segments:[{id:'c',trackId:'t',sourceId:'s',name:'Clip',color:'#fff',gain:1,effects:[],startTime:0,sourceOffset:0,duration:1,fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'}]}]});
it('captures detached state, clears missing optional envelopes after JSON save and preserves geometry/names',()=>{
 const original=p(),saved=saveMixVersion(original,'A');const changed={...saved,tracks:saved.tracks.map(t=>({...t,name:'Renamed',volume:.4,automation:[{time:0,value:.5}],effects:[{type:'delay' as const,enabled:true,params:{time:.2,mix:.4}}],segments:t.segments.map(c=>({...c,color:'#00f',gain:.5}))}))};
 const reopened=JSON.parse(JSON.stringify(changed)),next=mixProject(reopened,reopened.mixVersions.A);expect(next.tracks[0].automation).toBeUndefined();expect(next.tracks[0].effects).toBeUndefined();expect(next.tracks[0].volume).toBe(1);expect(next.tracks[0].name).toBe('Renamed');expect(next.tracks[0].segments[0].color).toBe('#00f');expect(next.tracks[0].segments[0].startTime).toBe(0);expect(next.tracks[0].segments[0].gain).toBe(1);expect(saved.mixVersions!.A!.tracks[0].state.volume).toBe(1);expect(playbackGraphKey(saved)).toBe(playbackGraphKey(original));
});
it('rejects stale geometry, corrupted snapshots and locked changes atomically; no-op preserves redo',()=>{
 const original=p(),version=captureMix(original);expect(mixProject(original,version)).toBe(original);const moved={...original,tracks:original.tracks.map(t=>({...t,segments:t.segments.map(c=>({...c,startTime:1}))}))};expect(()=>mixProject(moved,version)).toThrow('mixReview.changed');const retimed={...original,tracks:original.tracks.map(t=>({...t,segments:t.segments.map(c=>({...c,retime:{rate:1,reverse:true,preservePitch:false,semitones:0,original:{offset:0,duration:1}}}))}))};expect(()=>mixProject(retimed,version)).toThrow('mixReview.changed');const locked={...original,tracks:original.tracks.map(t=>({...t,locked:true,volume:.4}))};expect(()=>mixProject(locked,version)).toThrow('mixReview.locked');expect(locked.tracks[0].volume).toBe(.4);
 const saved=saveMixVersion(original,'A');expect(saveMixVersion(saved,'A')).toBe(saved);expect(validMixVersions(saved)).toBe(true);saved.mixVersions!.A!.tracks[0].state.pan=2;expect(validMixVersions(saved)).toBe(false);
});
it('loudness matching attenuates to the quieter side and handles silence safely',()=>{
 const a={loudness:{integrated:-15}} as MixMeasurement,b={loudness:{integrated:-21}} as MixMeasurement,silent={loudness:{integrated:null}} as MixMeasurement;expect(comparisonGain(a,b,true)).toBeCloseTo(10**(-6/20));expect(comparisonGain(b,a,true)).toBe(1);expect(comparisonGain(a,b,false)).toBe(1);expect(comparisonGain(a,silent,true)).toBe(1);
});
