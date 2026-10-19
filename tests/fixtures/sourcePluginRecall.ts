import type {AudioSource,AudioSegment} from '../../src/types/audio';
import {useProjectStore} from '../../src/stores/projectStore';
/** Minimal real planar storage for hardware-free source/publication tests. */
export class RecallBuffer {
 readonly length:number;readonly sampleRate:number;readonly numberOfChannels:number;readonly duration:number;private pcm:Float32Array[];
 constructor(options:{length:number;sampleRate:number;numberOfChannels:number}){Object.assign(this,options);this.length=options.length;this.sampleRate=options.sampleRate;this.numberOfChannels=options.numberOfChannels;this.duration=this.length/this.sampleRate;this.pcm=Array.from({length:this.numberOfChannels},()=>new Float32Array(this.length));}
 getChannelData(ch:number){return this.pcm[ch];}
 copyToChannel(pcm:Float32Array,ch:number){this.pcm[ch].set(pcm);}
}
export function recallFixture(rate=48000,channels=2,trimmed=true){
 const make=(length:number)=>new RecallBuffer({length,sampleRate:rate,numberOfChannels:channels}) as unknown as AudioBuffer;
 const originalBuffer=make(9600),editedBuffer=make(4800);
 for(let ch=0;ch<channels;ch++){originalBuffer.getChannelData(ch).set(Float32Array.from({length:9600},(_,i)=>(i%127)/127*(ch?-.4:.4)));editedBuffer.getChannelData(ch).fill(ch?-3:3);}
 const original:AudioSource={id:'original',name:'Original',buffer:originalBuffer,sampleRate:rate,channels,duration:9600/rate,filePath:'/fixture/original.wav',peaks:new Float32Array(2)},source:AudioSource={...original,id:'edited',name:'Edited',buffer:editedBuffer,duration:4800/rate,filePath:'/fixture/edited.wav'};
 const clip:AudioSegment={id:'clip',trackId:'track',sourceId:source.id,startTime:2,sourceOffset:trimmed?1200/rate:0,duration:(trimmed?2400:4800)/rate,gain:.7,effects:[],fadeInDuration:.01,fadeOutDuration:.01,fadeInCurve:'linear',fadeOutCurve:'linear',name:'Clip',color:'#123456',sourceEdit:{sourceId:original.id,offset:1200/rate,operations:[{type:'plugin',channel:-1,ranges:[{start:400,end:3000}],targetDb:-1,plugin:{id:'vst3:test',name:'Fixture',parameters:{gain:.5},state:'saved-base',latency:.001}}]}};
 const initial=useProjectStore.getInitialState(),state={...initial,project:{...initial.project,id:'recall-fixture',sampleRate:rate,duration:3,tracks:[{id:'track',name:'Track',volume:1,pan:0,muted:false,solo:false,effects:[],segments:[clip,{...clip,id:'sibling',sourceEdit:structuredClone(clip.sourceEdit)}]}]},sources:new Map([[original.id,original],[source.id,source]]),isPlaying:false};
 return {state,clip,source,original,make};
}
