import {expect,it} from 'vitest';
import {serializeProject,deserializeProject,validateFrozenProjectAudio} from '../../src/lib/projectFile';
import {useProjectStore} from '../../src/stores/projectStore';
import type {TimelineProject} from '../../src/types/audio';
const base=useProjectStore.getInitialState().project;
function invalidProject(){return {...base,tracks:[{segments:[{sourceEdit:{sourceId:'original',offset:0,operations:[{type:'chain',chain:{version:2,stages:[]}}]}}]}]} as unknown as TimelineProject;}
it('rejects unsupported recipes before saving or publishing a recovery snapshot',()=>{expect(()=>serializeProject(invalidProject(),new Map())).toThrow('Invalid source effect chain');expect(()=>validateFrozenProjectAudio(invalidProject(),new Map())).toThrow('Invalid source effect chain');});
it('rejects unsupported recipes before decoding project audio on load',async()=>{const decoder={decodeAudioData:()=>{throw new Error('Must not decode');}} as unknown as BaseAudioContext;await expect(deserializeProject(JSON.stringify({format:'crispaudio-project',version:3,project:invalidProject(),sources:[]}),decoder)).rejects.toThrow('Invalid source effect chain');});
