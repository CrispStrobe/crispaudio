import {expect,it} from 'vitest';
import {previewOwner,previewMatches} from '../../../src/lib/recordingPreview';
import {useProjectStore} from '../../../src/stores/projectStore';
import {defaultRecordingInput} from '../../../src/lib/recordingGroup';
it('ties warm inputs to project, selected track, device and channel, including undo changes',()=>{
 const input={...defaultRecordingInput,deviceId:'microphone',channel:'right' as const},project={...useProjectStore.getInitialState().project,tracks:[{id:'t',name:'Input',volume:1,pan:0,muted:false,solo:false,segments:[],recordingInput:input}]},owner=previewOwner(project,'t',input);
 expect(previewMatches(owner,project,'t')).toBe(true);expect(previewMatches(owner,{...project,id:'replacement'},'t')).toBe(false);expect(previewMatches(owner,{...project,tracks:[]},'t')).toBe(false);
 for(const patch of [{locked:true},{recordingInput:{...input,deviceId:'other'}},{recordingInput:{...input,channel:'mono' as const}}])expect(previewMatches(owner,{...project,tracks:[{...project.tracks[0],...patch}]},'t')).toBe(false);
 expect(previewMatches(owner,{...project,tracks:[{...project.tracks[0],recordingInput:{...input,latencyMs:50,countIn:5}}]},'t')).toBe(true);
});
