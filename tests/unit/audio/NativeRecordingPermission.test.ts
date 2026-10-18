import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {authorizeNativeRecording} from '../../../src/audio/plugins/NativeRecordingPermission';
import type {NativeInputInventory} from '../../../src/audio/plugins/NativeTimelineRecording';
const mocks=vi.hoisted(()=>({inputs:vi.fn(),get:vi.fn()}));
vi.mock('../../../src/audio/plugins/NativeTimelineRecording',()=>({NativeTimelineRecording:{inputs:mocks.inputs}}));
const inventory=(permission:NativeInputInventory['permission']):NativeInputInventory=>({permission,devices:[]});
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:mocks.get}});});
afterEach(()=>vi.unstubAllGlobals());
it('does not open a browser stream or prompt after native authorization or denial',async()=>{
 const allowed=inventory('Authorized');expect(await authorizeNativeRecording(allowed,()=>true)).toBe(allowed);
 for(const state of ['Denied','Restricted']as const)await expect(authorizeNativeRecording(inventory(state),()=>true)).rejects.toThrow('nativePermission');
 expect(mocks.get).not.toHaveBeenCalled();expect(mocks.inputs).not.toHaveBeenCalled();
});
it('releases every permission stream track before requerying native inventory',async()=>{
 const stops=[vi.fn(),vi.fn()];mocks.get.mockResolvedValue({getTracks:()=>stops.map(stop=>({stop}))});
 const allowed=inventory('Authorized');mocks.inputs.mockImplementation(async()=>{expect(stops.every(stop=>stop.mock.calls.length===1)).toBe(true);return allowed;});
 expect(await authorizeNativeRecording(inventory('Undetermined'),()=>true)).toBe(allowed);expect(mocks.get).toHaveBeenCalledWith({audio:true,video:false});
});
it('stops a late permission stream after Stop/project change without opening native input',async()=>{
 let current=true,release!:(v:unknown)=>void;const stop=vi.fn();mocks.get.mockReturnValue(new Promise(resolve=>{release=resolve;}));
 const pending=authorizeNativeRecording(inventory('Undetermined'),()=>current);current=false;release({getTracks:()=>[{stop}]});await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(stop).toHaveBeenCalledTimes(1);expect(mocks.inputs).not.toHaveBeenCalled();
});
it('rejects stale work before prompting and rechecks after native permission acknowledgement',async()=>{
 await expect(authorizeNativeRecording(inventory('Undetermined'),()=>false)).rejects.toMatchObject({name:'AbortError'});expect(mocks.get).not.toHaveBeenCalled();
 const stop=vi.fn();let current=true;mocks.get.mockResolvedValue({getTracks:()=>[{stop}]});mocks.inputs.mockImplementation(async()=>{current=false;return inventory('Authorized');});
 await expect(authorizeNativeRecording(inventory('Undetermined'),()=>current)).rejects.toMatchObject({name:'AbortError'});expect(stop).toHaveBeenCalledTimes(1);
});
it('handles permission refusal or a missing OS grant without retaining a stream',async()=>{
 mocks.get.mockRejectedValueOnce(new DOMException('Denied','NotAllowedError'));await expect(authorizeNativeRecording(inventory('Undetermined'),()=>true)).rejects.toThrow('nativePermission');expect(mocks.inputs).not.toHaveBeenCalled();
 const stop=vi.fn();mocks.get.mockResolvedValue({getTracks:()=>[{stop}]});mocks.inputs.mockResolvedValue(inventory('Undetermined'));await expect(authorizeNativeRecording(inventory('Undetermined'),()=>true)).rejects.toThrow('nativePermission');expect(stop).toHaveBeenCalledTimes(1);
});
