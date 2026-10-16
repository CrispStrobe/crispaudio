import {describe,it,expect} from 'vitest';
import {capturedTakes} from '../../../src/lib/capturedTakes';
import {recordingLeadIn} from '../../../src/lib/recordingLeadIn';
import {DEFAULT_MUSIC} from '../../../src/lib/musicalTime';
import {defaultRecordingInput} from '../../../src/lib/recordingGroup';
import {useProjectStore} from '../../../src/stores/projectStore';
const project=()=>({...useProjectStore.getInitialState().project,music:{...DEFAULT_MUSIC}});
describe('recording preparation clocks',()=>{
 it('preserves old silent seconds and defaults to immediate capture',()=>{expect(recordingLeadIn(project(),[defaultRecordingInput],5)).toMatchObject({playbackStart:5,recordStart:5,countSeconds:0,preRollSeconds:0,delay:0});expect(recordingLeadIn(project(),[{...defaultRecordingInput,countIn:3}],5).delay).toBe(3);});
 it('uses tempo/meter for bars and clamps pre-roll at project zero',()=>{const p=project();p.music={...DEFAULT_MUSIC,tempo:90,numerator:6,denominator:8};expect(recordingLeadIn(p,[{...defaultRecordingInput,countInBars:2,preRollBars:1}],5)).toMatchObject({playbackStart:3,recordStart:5,countSeconds:4,preRollSeconds:2});expect(recordingLeadIn(p,[{...defaultRecordingInput,preRollBars:4}],1).playbackStart).toBe(0);});
 it('uses maxima across armed inputs on a shared clock',()=>{const lead=recordingLeadIn(project(),[{...defaultRecordingInput,countInBars:2,preRollBars:1},{...defaultRecordingInput,countIn:3,countInBars:1,preRollBars:2}],8);expect(lead).toMatchObject({countSeconds:4,preRollSeconds:4,delay:3,playbackStart:4,recordStart:8});});
 it('preserves earlier punch playback and adds one intro before loop takes',()=>{const input={...defaultRecordingInput,preRollBars:1};expect(recordingLeadIn(project(),[input],0,{start:5,end:7})).toMatchObject({playbackStart:0,recordStart:5});expect(recordingLeadIn(project(),[input],9,{start:5,end:7},true)).toMatchObject({playbackStart:3,recordStart:5});});
 it('preserves latency placement without pre-roll and uses source handles when pre-roll is selected',()=>{
  for(const preRollBars of [0,1]){
   const plan=recordingLeadIn(project(),[{...defaultRecordingInput,countInBars:1,preRollBars,latencyMs:10}],2);
   const take=capturedTakes({firstFrame:0,frames:192000,sampleRate:48000,passes:[{frame:0,timeline:plan.playbackStart}],recordStart:plan.takeStart,sourceId:'s',name:'Take',latencyMs:10,notes:[],droppedFrames:0})[0];
   expect(take.startTime).toBeCloseTo(preRollBars?2:1.99);expect(take.sourceOffset).toBeCloseTo(preRollBars?2.01:0);
  }
 });
 it('rejects malformed or excessive selected lead-in before opening input',()=>{for(const bars of [-1,1.5,5,NaN])expect(()=>recordingLeadIn(project(),[{...defaultRecordingInput,countInBars:bars}],0)).toThrow('leadInBudget');const p=project();p.music={...DEFAULT_MUSIC,tempo:20,numerator:32,denominator:1};expect(()=>recordingLeadIn(p,[{...defaultRecordingInput,countInBars:1}],0)).toThrow('leadInBudget');});
});
