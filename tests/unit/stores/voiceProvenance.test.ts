import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useVoiceStore} from '../../../src/stores/voiceStore';
import {useUIStore} from '../../../src/stores/uiStore';
import {useProjectStore} from '../../../src/stores/projectStore';
import {projectAudioReceipt,scaledSpeechRegions,speechGeneration} from '../../../src/lib/aiSpeechProvenance';
import {recallFixture,RecallBuffer} from '../../fixtures/sourcePluginRecall';
const g=speechGeneration('sidon-v0.1-q8_0.gguf',new Date('2026-11-26'));
beforeEach(()=>{vi.stubGlobal('AudioBuffer',RecallBuffer);useVoiceStore.setState({sourceBuffer:null,processedBuffer:null,sourceAiSpeech:[],processedAiSpeech:[]});});
afterEach(()=>vi.unstubAllGlobals());
function loadMarkedClip(){
 const f=recallFixture(48000,1);f.clip.sourceEdit=undefined;f.state.project.tracks[0].segments=[f.clip];
 f.source.aiSpeech=[{...g,start:.025,end:.05}];useProjectStore.setState(f.state);return f;
}
it('crops known ancestry into Voice effects and scales it with the processed duration',()=>{
 const f=loadMarkedClip();useUIStore.getState().openVoiceEffects('clip');
 const input=useVoiceStore.getState();expect(input.sourceBuffer!.duration).toBe(.05);
 expect(input.sourceAiSpeech).toEqual([{...g,start:0,end:.025}]);
 const output=f.make(4800),marks=scaledSpeechRegions(input.sourceAiSpeech,input.sourceBuffer!.duration,output.duration);
 input.setProcessedBuffer(output,marks);
 const processed=useVoiceStore.getState();expect(processed.processedAiSpeech).toEqual([{...g,start:0,end:.05}]);
 useProjectStore.getState().replaceSegmentSource('clip',{...f.source,id:'voice-output',buffer:output,duration:output.duration,aiSpeech:processed.processedAiSpeech});
 expect(projectAudioReceipt(useProjectStore.getState().project,useProjectStore.getState().sources)!.regions).toEqual([{...g,start:2,end:2.05}]);
});
it('new microphone or unmarked input clears both source and processed ancestry',()=>{
 const f=loadMarkedClip(),voice=useVoiceStore.getState();voice.setSourceBuffer(f.source.buffer,f.source.aiSpeech);
 voice.setProcessedBuffer(f.source.buffer,f.source.aiSpeech);
 const oldMarks=useVoiceStore.getState().sourceAiSpeech;
 voice.setSourceBuffer(f.source.buffer); // Even reusing a buffer is a new input identity.
 const next=useVoiceStore.getState();expect(next.sourceAiSpeech).toEqual([]);expect(next.sourceAiSpeech).not.toBe(oldMarks);
 expect(next.processedBuffer).toBeNull();expect(next.processedAiSpeech).toEqual([]);
});
it('a silent Voice replacement cannot resurrect obsolete retained retime attribution',()=>{
 const f=loadMarkedClip();f.source.aiSpeech=undefined;
 f.original.aiSpeech=[{...g,start:0,end:.2}];f.clip.retime={rate:2,reverse:false,semitones:0,preservePitch:true,renderDuration:.1,original:{sourceId:f.original.id,offset:0,duration:.2}};
 useProjectStore.setState(f.state);useUIStore.getState().openVoiceEffects('clip');
 expect(useVoiceStore.getState().sourceAiSpeech).not.toHaveLength(0);
 const silent=f.make(2400);useVoiceStore.getState().setProcessedBuffer(silent,[]);
 useProjectStore.getState().replaceSegmentSource('clip',{...f.source,id:'silent',buffer:silent,duration:silent.duration,aiSpeech:undefined});
 const p=useProjectStore.getState();expect(p.project.tracks[0].segments[0].retime).toBeUndefined();
 expect(p.project.tracks[0].segments[0].sourceEdit).toBeUndefined();expect(projectAudioReceipt(p.project,p.sources)).toBeUndefined();
});
it('ordinary deterministic effects add no generation events and imported declarations stay unsigned',()=>{
 const f=loadMarkedClip(),voice=useVoiceStore.getState();voice.setSourceBuffer(f.source.buffer);voice.setProcessedBuffer(f.source.buffer);
 expect(useVoiceStore.getState().processedAiSpeech).toEqual([]);
 voice.setSourceBuffer(f.source.buffer,[{...g,basis:'imported-unsigned-declaration',start:0,end:.05}]);
 const current=useVoiceStore.getState();voice.setProcessedBuffer(f.source.buffer,scaledSpeechRegions(current.sourceAiSpeech,.1,.1));
 expect(useVoiceStore.getState().processedAiSpeech[0].basis).toBe('imported-unsigned-declaration');
});
