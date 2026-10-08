import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useUIStore} from '../../../src/stores/uiStore';
import {useProjectStore} from '../../../src/stores/projectStore';
import {useVoiceStore} from '../../../src/stores/voiceStore';
import type {AudioSource,AudioSegment} from '../../../src/types/audio';
class BufferStub {
  numberOfChannels:number;sampleRate:number;length:number;data:Float32Array[];
  constructor(options:{numberOfChannels:number;sampleRate:number;length:number}){this.numberOfChannels=options.numberOfChannels;this.sampleRate=options.sampleRate;this.length=options.length;this.data=Array.from({length:options.numberOfChannels},()=>new Float32Array(options.length));}
  copyToChannel(data:Float32Array,channel:number){this.data[channel].set(data);}
  getChannelData(channel:number){return this.data[channel];}
}
beforeEach(()=>{vi.stubGlobal('AudioBuffer',BufferStub);useProjectStore.setState(useProjectStore.getInitialState());useVoiceStore.setState(useVoiceStore.getInitialState());useUIStore.setState(useUIStore.getInitialState());});
afterEach(()=>vi.unstubAllGlobals());
it('opens Voice with only the trimmed stereo clip and retains a return target across Settings',()=>{
  const buffer=new BufferStub({numberOfChannels:2,sampleRate:10,length:50});buffer.data[0].set(Array.from({length:50},(_,i)=>i));buffer.data[1].set(Array.from({length:50},(_,i)=>-i));
  const source={id:'s',buffer,sampleRate:10,channels:2} as unknown as AudioSource;
  const clip={id:'c',sourceId:'s',sourceOffset:2,duration:1,startTime:7} as AudioSegment;
  const state=useProjectStore.getState();state.addTrack('Track');
  useProjectStore.setState({sources:new Map([['s',source]]),isPlaying:true,project:{...useProjectStore.getState().project,tracks:useProjectStore.getState().project.tracks.map(track=>({...track,segments:[clip]}))}});
  useUIStore.getState().openVoiceEffects('c');
  expect(useUIStore.getState().activePanel).toBe('voice');expect(useUIStore.getState().activeModal).toBeNull();expect(useProjectStore.getState().isPlaying).toBe(false);
  const extracted=useVoiceStore.getState().sourceBuffer!;
  expect(extracted.length).toBe(10);expect([...extracted.getChannelData(0)]).toEqual([20,21,22,23,24,25,26,27,28,29]);expect(extracted.getChannelData(1)[0]).toBe(-20);
  expect(useVoiceStore.getState().processedBuffer).toBeNull();expect(useUIStore.getState().voiceEffectsTargetSegmentId).toBe('c');
  useUIStore.getState().openModal('settings');useUIStore.getState().closeModal();expect(useUIStore.getState().voiceEffectsTargetSegmentId).toBe('c');
});
