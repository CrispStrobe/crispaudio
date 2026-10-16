import {beforeEach,describe,expect,it,vi} from 'vitest';
import {captureTrackTemplate,trackFromTemplate,validTrackTemplate,insertTrackTemplate,builtInTrackTemplates} from '../../src/lib/trackTemplates';
import {useTrackTemplateStore,readTrackTemplates} from '../../src/stores/trackTemplateStore';
import {useProjectStore} from '../../src/stores/projectStore';
import type {TimelineTrack} from '../../src/types/audio';
const source=():TimelineTrack=>({id:'source',name:'Voice',volume:.8,pan:-.2,muted:true,solo:true,recordArmed:true,locked:true,output:'bus',sends:[{id:'send',target:'bus',gain:1,preFader:false}],segments:[],automation:[{time:1,value:.5}],takes:[],waveformMode:'level',effects:[{instanceId:'fx',type:'highpass',enabled:true,params:{freq:80,q:.7},automation:{freq:[{time:0,value:.5}]}}],nativeEffects:[{instanceId:'native',pluginId:'au:fixture',name:'Fixture',format:'AU',enabled:true,bypass:false,parameters:{'1':.5},state:'saved',parameterAutomation:{'1':{min:0,max:1,points:[{time:0,value:.5}]}}}],recordingInput:{deviceId:'private-microphone',channel:'right',monitor:true,countIn:2,countInBars:1,preRollBars:2,latencyMs:15}});
beforeEach(()=>{localStorage.clear();useTrackTemplateStore.setState({templates:[]});useProjectStore.getState().loadProjectState({...useProjectStore.getInitialState().project,tracks:[source()]},new Map());useProjectStore.temporal.getState().clear();});
describe('reusable track templates',()=>{
 it('copies only reusable settings, resets hardware/safety state, and allocates independent processors',()=>{
 const original=source(),template=captureTrackTemplate(original,' Voice setup '),a=trackFromTemplate(template),b=trackFromTemplate(template);
 expect(template.name).toBe('Voice setup');expect(a).toMatchObject({name:'Voice setup',volume:.8,pan:-.2,muted:false,solo:false,recordArmed:false,segments:[],recordingInput:{deviceId:'',monitor:false,channel:'right',latencyMs:15,countInBars:1,preRollBars:2}});
 for(const field of ['takes','automation','panAutomation','locked','output','sends','compRegions'])expect(a).not.toHaveProperty(field);
 expect(a.effects![0]).not.toHaveProperty('automation');expect(a.nativeEffects![0]).not.toHaveProperty('parameterAutomation');expect(a.nativeEffects![0].state).toBe('saved');
 expect(new Set([a.id,b.id,a.effects![0].instanceId,b.effects![0].instanceId,a.nativeEffects![0].instanceId,b.nativeEffects![0].instanceId]).size).toBe(6);
 a.effects![0].params.freq=500;expect(template.settings.effects![0].params.freq).toBe(80);expect(original.effects![0].params.freq).toBe(80);
 });
 it('inserts one selected empty track in one undo step, with redo',()=>{const before=useProjectStore.getState().project,id=insertTrackTemplate(captureTrackTemplate(source(),'Voice'));expect(useProjectStore.getState().project.tracks).toHaveLength(2);expect(useProjectStore.getState().selection?.trackIds).toEqual([id]);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);useProjectStore.temporal.getState().undo();expect(useProjectStore.getState().project).toEqual(before);useProjectStore.temporal.getState().redo();expect(useProjectStore.getState().project.tracks[1].id).toBe(id);});
 it('persists a separate library and reloads validated settings',()=>{const template=captureTrackTemplate(source(),'Voice');useTrackTemplateStore.getState().save(template);expect(readTrackTemplates()).toEqual(JSON.parse(JSON.stringify([template])));useTrackTemplateStore.getState().remove(template.id);expect(readTrackTemplates()).toEqual([]);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);});
 it('fails atomically on quota errors',()=>{const template=captureTrackTemplate(source(),'Voice'),spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});try{expect(()=>useTrackTemplateStore.getState().save(template)).toThrow('templates.storage');expect(useTrackTemplateStore.getState().templates).toEqual([]);}finally{spy.mockRestore();}});
 it('rejects malformed data, identity-bearing fields, automation and invalid input timing',()=>{
 const good=captureTrackTemplate(source(),'Voice');expect(validTrackTemplate(good)).toBe(true);
 for(const patch of [{volume:NaN},{pan:2},{effects:{}},{effects:[{type:'unknown',enabled:true,params:{}}]},{effects:[{type:'delay',enabled:true,params:{mix:.5},automation:{}}]},{nativeEffects:{}},{recordingInput:{...good.settings.recordingInput,monitor:true}},{recordingInput:{...good.settings.recordingInput,countInBars:5}},{recordingInput:{...good.settings.recordingInput,deviceId:'other'}},{segments:[]},{output:'bus'}])expect(validTrackTemplate({...good,settings:{...good.settings,...patch}})).toBe(false);
 expect(validTrackTemplate({...good,name:' '.repeat(5)})).toBe(false);expect(validTrackTemplate(null)).toBe(false);
 localStorage.setItem('crispaudio-track-templates','[{"id":"bad"}]');expect(readTrackTemplates()).toEqual([]);
 });
 it('ships valid neutral mono/stereo and gentle speech low-cut starting points',()=>{expect(builtInTrackTemplates.every(validTrackTemplate)).toBe(true);expect(trackFromTemplate(builtInTrackTemplates[2]).recordingInput?.channel).toBe('stereo');});
});

it('retains cue tone/level choices while disabling monitoring on new tracks',()=>{
 const track={id:'cue',name:'Cue',volume:1,pan:0,muted:false,solo:false,segments:[],recordingInput:{deviceId:'external',channel:'mono' as const,monitor:true,countIn:0,latencyMs:0,monitorLevelDb:-22,monitorPan:.3,monitorMono:true,monitorFx:true}};
 const saved=captureTrackTemplate(track,'Cue'),next=trackFromTemplate(saved);expect(next.recordingInput).toMatchObject({deviceId:'',monitor:false,monitorLevelDb:-22,monitorPan:.3,monitorMono:true,monitorFx:true});
});
