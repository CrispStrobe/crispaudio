import {beforeEach,it,expect} from 'vitest';
import {useProjectStore} from '../../../src/stores/projectStore';
import {hasNativeEffects,projectNativeRacks,applyNativeRackSnapshots,replaceNativeEffects,validNativeEffects} from '../../../src/lib/nativeEffects';
import {serializeProject,deserializeProject,linkedRenderDocument} from '../../../src/lib/projectFile';
import {captureMix,mixProject} from '../../../src/lib/mixVersions';
import type {NativeEffect,TimelineProject} from '../../../src/types/audio';
const effect=(instanceId='insert'):NativeEffect=>({instanceId,pluginId:'au:test',name:'Test plug-in',format:'AU',enabled:true,bypass:false,parameters:{'0':440},state:'program'});
const project=():TimelineProject=>({...useProjectStore.getInitialState().project,tracks:[{id:'t',name:'Track',muted:false,solo:false,pan:0,volume:1,segments:[{id:'c',trackId:'t',sourceId:'s',startTime:0,duration:1,sourceOffset:0,gain:1,fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear',effects:[],color:'',name:''}]}]});
beforeEach(()=>{useProjectStore.setState({...useProjectStore.getInitialState(),project:project()});useProjectStore.temporal.getState().clear();});
it('serializes native state as version 4 and roundtrips clip, track, master and disabled inserts',async()=>{
 let p=project();for(const scope of ['master','track:t','clip:c'])p=replaceNativeEffects(p,scope,[effect(scope),{...effect(`${scope}-off`),enabled:false}]);
 const json=serializeProject(p,new Map());expect(JSON.parse(json).version).toBe(4);const opened=await deserializeProject(json,{} as AudioContext);expect(opened.project).toEqual(p);expect(projectNativeRacks(opened.project,44100).get('clip:c')![0]).toMatchObject({instanceId:'clip:c',sampleRate:44100,state:'program',channels:2});
 expect(linkedRenderDocument(p,new Map())).toBeNull();expect(JSON.parse(serializeProject(project(),new Map())).version).toBe(3);
 await expect(deserializeProject(JSON.stringify({...JSON.parse(json),version:3}),{} as AudioContext)).rejects.toThrow(/version 4/);
});
it('rejects malformed native records and duplicate identities before publishing an edit or file',()=>{
 expect(validNativeEffects([effect()])).toBe(true);expect(validNativeEffects([effect(),effect()])).toBe(false);
 for(const malformed of [{...effect(),parameters:{'0':NaN}},{...effect(),state:'x'.repeat(1048577)},{...effect(),enabled:'yes'},{...effect(),parameters:Array(3)}])expect(validNativeEffects([malformed])).toBe(false);
 const p=project();expect(()=>replaceNativeEffects(p,'track:t',[{...effect(),parameters:{'0':Infinity}}])).toThrow(/Invalid/);expect(()=>serializeProject({...p,nativeEffects:[{...effect(),state:null as unknown as string}]},new Map())).toThrow(/Invalid/);
});
it('captures only matching active instances and preserves disabled state without mutating the input',()=>{
 const p=replaceNativeEffects(project(),'track:t',[{...effect('off'),enabled:false},effect('a'),effect('b')]),racks=projectNativeRacks(p),saved=new Map([...racks].map(([scope,entries])=>[scope,entries.map(entry=>({...entry,state:`captured-${entry.instanceId}`,parameters:{'0':880},bypass:true}))]));
 const restored=applyNativeRackSnapshots(p,saved);expect(restored.tracks[0].nativeEffects?.map(entry=>entry.state)).toEqual(['program','captured-a','captured-b']);expect(p.tracks[0].nativeEffects![1].state).toBe('program');expect(restored.tracks[0].nativeEffects![1].bypass).toBe(true);
 const swapped=replaceNativeEffects(p,'track:t',[p.tracks[0].nativeEffects![0],p.tracks[0].nativeEffects![2],p.tracks[0].nativeEffects![1]]);expect(()=>applyNativeRackSnapshots(swapped,saved)).toThrow(/changed/);
});
it('mix versions retain native order, programs and controls independently',()=>{
 const p=replaceNativeEffects(project(),'master',[effect('master')]),version=captureMix(p),changed=replaceNativeEffects(p,'master',[{...effect('master'),parameters:{'0':880},state:'new'}]);const restored=mixProject(changed,version);expect(restored.nativeEffects).toEqual(p.nativeEffects);expect(restored.nativeEffects).not.toBe(p.nativeEffects);
 const disabled={...p,nativeEffects:undefined,mixVersions:{A:version}};expect(JSON.parse(serializeProject(disabled,new Map())).version).toBe(4);
});
it('native rack edits participate in undo and respect track locks',()=>{
 const store=useProjectStore.getState();store.setNativeEffects('clip:c',[effect()]);expect(hasNativeEffects(useProjectStore.getState().project)).toBe(true);useProjectStore.temporal.getState().undo();expect(hasNativeEffects(useProjectStore.getState().project)).toBe(false);useProjectStore.temporal.getState().redo();expect(hasNativeEffects(useProjectStore.getState().project)).toBe(true);
 useProjectStore.setState({project:{...project(),tracks:project().tracks.map(track=>({...track,locked:true}))}});const before=useProjectStore.getState().project;expect(()=>useProjectStore.getState().setNativeEffects('clip:c',[effect()])).toThrow(/locked/);expect(useProjectStore.getState().project).toBe(before);
});
it('retains disabled inserts on linked export and marks dormant comp inserts as version 4',()=>{
 let p=replaceNativeEffects({...project(),sampleRate:48000},'master',[{...effect(),enabled:false}]);p={...p,tracks:[]};expect(hasNativeEffects(p)).toBe(false);expect(linkedRenderDocument(p,new Map())?.version).toBe(4);
 const base=project(),dormant={...base,tracks:base.tracks.map(track=>({...track,compBaseSegments:[{...track.segments[0],nativeEffects:[effect()]}]}))};expect(JSON.parse(serializeProject(dormant,new Map())).version).toBe(4);
});
