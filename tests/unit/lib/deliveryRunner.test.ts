import {it,expect,vi,beforeEach} from 'vitest';
import {runDelivery} from '../../../src/lib/deliveryRunner';
import {planDelivery,DELIVERY_DEFAULTS,type DeliveryJob} from '../../../src/lib/delivery';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {TimelineEngine} from '../../../src/audio/engine/TimelineEngine';
import {recallFixture} from '../../fixtures/sourcePluginRecall';
import {speechGeneration} from '../../../src/lib/aiSpeechProvenance';
const {invoke,write,encode,wav}=vi.hoisted(()=>({invoke:vi.fn(),write:vi.fn(),encode:vi.fn(),wav:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke}));vi.mock('@tauri-apps/plugin-fs',()=>({writeFile:write,remove:vi.fn(async()=>{})}));
vi.mock('../../../src/lib/native',()=>({isTauri:()=>true,isIOSApp:()=>false}));
vi.mock('../../../src/lib/projectFile',()=>({linkedRenderDocument:()=>null}));
vi.mock('../../../src/lib/codecs',()=>({encodeAudioBuffer:encode}));vi.mock('../../../src/lib/wavExport',()=>({encodeAudioBufferWav:wav}));
beforeEach(()=>{vi.clearAllMocks();const blob={arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};encode.mockResolvedValue(blob);wav.mockResolvedValue(blob);});
for(const format of ['wav','flac','aac']as const)it(`queues ${format} from the wet native mix and publishes after encoding`,async()=>{
 const project={...useProjectStore.getInitialState().project,duration:2,nativeEffects:[{instanceId:'fx',pluginId:'au:test',name:'Delay',format:'AU' as const,enabled:true,bypass:false,state:'saved',parameters:{'1':.2}}]},[plan]=planDelivery(project,new Map(),{...DELIVERY_DEFAULTS,format});
 const wet={sampleRate:48000},renderMixRange=vi.fn(async()=>wet),job:DeliveryJob={id:'job',output:`/mix.${format}`,plan,status:'running',phase:'rendering'},signal=new AbortController().signal;
 await runDelivery(job,{renderMixRange}as unknown as TimelineEngine,signal,()=>{});
 expect(renderMixRange).toHaveBeenCalledWith(plan.project,0,2,signal,plan.sources);
 if(format==='wav')expect(wav).toHaveBeenCalledWith(wet,24,signal,false);else expect(encode).toHaveBeenCalledWith(wet,format,192,signal);
 expect(invoke).toHaveBeenCalledWith('publish_delivery_stage',expect.objectContaining({output:job.output}));expect(invoke).toHaveBeenCalledWith('publish_delivery_stage',expect.objectContaining({output:`${job.output}.delivery.json`}));
});
it('does not publish media or a manifest when codec completion races cancellation',async()=>{
 const controller=new AbortController(),project={...useProjectStore.getInitialState().project,duration:2},[plan]=planDelivery(project,new Map(),{...DELIVERY_DEFAULTS,format:'aac'}),job:DeliveryJob={id:'job',output:'/cancel.aac',plan,status:'running',phase:'rendering'};
 encode.mockImplementation(async()=>{controller.abort();return {arrayBuffer:async()=>new Uint8Array([9]).buffer};});
 await expect(runDelivery(job,{renderMixRange:async()=>({})}as unknown as TimelineEngine,controller.signal,()=>{})).rejects.toMatchObject({name:'AbortError'});expect(write).not.toHaveBeenCalled();expect(invoke).not.toHaveBeenCalled();
});
it.each(['wav','flac'] as const)('delivery carries known speech lineage in %s and its manifest',async format=>{
 const f=recallFixture(48000,1);f.clip.sourceEdit=undefined;f.state.project.tracks[0].segments=[f.clip];f.source.aiSpeech=[{...speechGeneration('/private/voice/model.gguf'),start:.025,end:.05}];
 const [plan]=planDelivery(f.state.project,f.state.sources,{...DELIVERY_DEFAULTS,format});
 const job:DeliveryJob={id:'marked',output:`/marked.${format}`,plan,status:'running',phase:'rendering'};
 await runDelivery(job,{renderMixRange:async()=>({})} as unknown as TimelineEngine,new AbortController().signal,()=>{});
 const manifest=write.mock.calls.find(([path])=>String(path).includes('.delivery.json.'))!;
 const metadata=JSON.parse(new TextDecoder().decode(manifest[1]));expect(metadata.aiProvenance.regions).toMatchObject([{start:2,end:2.025,basis:'observed-operation'}]);
 expect(JSON.stringify(metadata.aiProvenance)).not.toContain('/private/');
 if(format==='wav'){
  const calls=invoke.mock.calls,annotate=calls.findIndex(([command])=>command==='annotate_delivery_wav'),published=calls.findIndex(([command,args])=>command==='publish_delivery_stage'&&args.output===job.output);
  expect(annotate).toBeGreaterThanOrEqual(0);expect(published).toBeGreaterThan(annotate);
 }else expect(write.mock.calls.some(([path])=>String(path).includes('.provenance.json.'))).toBe(true);
});
