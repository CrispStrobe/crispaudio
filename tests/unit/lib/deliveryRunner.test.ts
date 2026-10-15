import {it,expect,vi,beforeEach} from 'vitest';
import {runDelivery} from '../../../src/lib/deliveryRunner';
import {planDelivery,DELIVERY_DEFAULTS,type DeliveryJob} from '../../../src/lib/delivery';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {TimelineEngine} from '../../../src/audio/engine/TimelineEngine';
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
 if(format==='wav')expect(wav).toHaveBeenCalledWith(wet,24,signal);else expect(encode).toHaveBeenCalledWith(wet,format,192,signal);
 expect(invoke).toHaveBeenCalledWith('publish_delivery_stage',expect.objectContaining({output:job.output}));expect(invoke).toHaveBeenCalledWith('publish_delivery_stage',expect.objectContaining({output:`${job.output}.delivery.json`}));
});
it('does not publish media or a manifest when codec completion races cancellation',async()=>{
 const controller=new AbortController(),project={...useProjectStore.getInitialState().project,duration:2},[plan]=planDelivery(project,new Map(),{...DELIVERY_DEFAULTS,format:'aac'}),job:DeliveryJob={id:'job',output:'/cancel.aac',plan,status:'running',phase:'rendering'};
 encode.mockImplementation(async()=>{controller.abort();return {arrayBuffer:async()=>new Uint8Array([9]).buffer};});
 await expect(runDelivery(job,{renderMixRange:async()=>({})}as unknown as TimelineEngine,controller.signal,()=>{})).rejects.toMatchObject({name:'AbortError'});expect(write).not.toHaveBeenCalled();expect(invoke).not.toHaveBeenCalled();
});
