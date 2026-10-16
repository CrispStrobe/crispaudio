import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {open,save} from '../../../src/lib/nativeDialog';
import {saveProjectFile} from '../../../src/lib/projectIO';
const picker=vi.hoisted(()=>vi.fn());
const savePicker=vi.hoisted(()=>vi.fn());
const invoke=vi.hoisted(()=>vi.fn());
const write=vi.hoisted(()=>vi.fn());
const read=vi.hoisted(()=>vi.fn());
vi.mock('@tauri-apps/plugin-dialog',()=>({open:picker,save:savePicker}));
vi.mock('@tauri-apps/api/core',()=>({invoke}));
vi.mock('@tauri-apps/plugin-fs',()=>({readTextFile:vi.fn(),writeTextFile:write,readFile:read}));
beforeEach(()=>{Object.assign(window,{__TAURI_INTERNALS__:{}});vi.spyOn(navigator,'userAgent','get').mockReturnValue('Macintosh');Object.defineProperty(navigator,'maxTouchPoints',{value:0,configurable:true});invoke.mockReset();picker.mockReset();write.mockReset();read.mockReset();savePicker.mockReset();});
afterEach(()=>{delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;vi.restoreAllMocks();});
it('awaits durable read-only file access before returning a multi-selection',async()=>{
 picker.mockResolvedValue(['/media/a.wav','/media/b.mp4']);let release!:(v:unknown)=>void;invoke.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const done=vi.fn();const result=open({multiple:true}).then(done);
 await vi.waitFor(()=>expect(invoke).toHaveBeenCalledWith('remember_resources',{paths:['/media/a.wav','/media/b.mp4'],writable:false}));expect(done).not.toHaveBeenCalled();release(undefined);await result;expect(done).toHaveBeenCalledWith(['/media/a.wav','/media/b.mp4']);
});
it('keeps destination-folder write access and does not invent access on cancellation',async()=>{
 picker.mockResolvedValue('/delivery');await open({directory:true});expect(invoke).toHaveBeenCalledWith('remember_resources',{paths:['/delivery'],writable:true});invoke.mockClear();picker.mockResolvedValue(null);expect(await open()).toBeNull();expect(invoke).not.toHaveBeenCalled();
});
it('propagates grant failures instead of returning an unusable selected path',async()=>{
 picker.mockResolvedValue('/media/a.wav');invoke.mockRejectedValue(new Error('Bookmark unavailable'));await expect(open()).rejects.toThrow('Bookmark unavailable');
});
it('leaves iPad document-picker handling to the existing mobile integration',async()=>{
 vi.spyOn(navigator,'userAgent','get').mockReturnValue('Macintosh');Object.defineProperty(navigator,'maxTouchPoints',{value:5,configurable:true});picker.mockResolvedValue('/mobile/a.wav');expect(await open()).toBe('/mobile/a.wav');expect(invoke).not.toHaveBeenCalled();
});
it('records a saved project only after its file exists',async()=>{
 savePicker.mockResolvedValue('/work/project.json');write.mockResolvedValue(undefined);invoke.mockResolvedValue(undefined);
 await expect(saveProjectFile('{}','project')).resolves.toBe(true);
 expect(write.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0]);expect(invoke).toHaveBeenCalledWith('remember_resources',{paths:['/work/project.json'],writable:true});expect(save).toBe(savePicker);
});
it('cancels a derived-media save without writing when the project-folder picker is cancelled',async()=>{
 savePicker.mockResolvedValue('/work/project.json');invoke.mockResolvedValue(false);picker.mockResolvedValue(null);
 const json=JSON.stringify({sources:[{path:'/Users/test/Library/Caches/com.crispstrobe.crispaudio/audio.wav'}]});
 await expect(saveProjectFile(json,'project')).resolves.toBe(false);expect(write).not.toHaveBeenCalled();expect(picker).toHaveBeenCalledWith(expect.objectContaining({directory:true,defaultPath:'/work'}));
});
it('uses a previously selected native export folder without another picker',async()=>{
 const {saveNative}=await import('../../../src/lib/nativeDialog');savePicker.mockResolvedValue('/delivery/mix.flac');invoke.mockResolvedValue(true);
 expect(await saveNative({defaultPath:'mix.flac'})).toBe('/delivery/mix.flac');expect(picker).not.toHaveBeenCalled();expect(invoke).toHaveBeenCalledWith('resource_folder_writable',{path:'/delivery'});
});
it('cancels native export before rendering when output-folder access is cancelled',async()=>{
 const {saveNative}=await import('../../../src/lib/nativeDialog');savePicker.mockResolvedValue('/delivery/mix.flac');invoke.mockImplementation((command)=>Promise.resolve(command==='native_export_requires_folder'));picker.mockResolvedValue(null);
 expect(await saveNative()).toBeNull();expect(picker).toHaveBeenCalledWith(expect.objectContaining({directory:true,defaultPath:'/delivery'}));
});
it('rejects an unrelated output folder before a native export begins',async()=>{
 const {saveNative}=await import('../../../src/lib/nativeDialog');savePicker.mockResolvedValue('/delivery/mix.flac');invoke.mockImplementation((command)=>Promise.resolve(command==='native_export_requires_folder'));picker.mockResolvedValue('/unrelated');
 await expect(saveNative()).rejects.toThrow();expect(invoke).toHaveBeenCalledWith('remember_resources',{paths:['/unrelated'],writable:true});
});

it('uses only the Save dialog when private export staging is on the destination volume',async()=>{
 const {saveNative}=await import('../../../src/lib/nativeDialog');savePicker.mockResolvedValue('/work/mix.m4a');invoke.mockResolvedValue(false);
 expect(await saveNative()).toBe('/work/mix.m4a');expect(picker).not.toHaveBeenCalled();expect(invoke).toHaveBeenCalledExactlyOnceWith('native_export_requires_folder',{path:'/work/mix.m4a'});
});
it('does not check staging or request folders after cancelling Save',async()=>{
 const {saveNative}=await import('../../../src/lib/nativeDialog');savePicker.mockResolvedValue(null);
 expect(await saveNative()).toBeNull();expect(invoke).not.toHaveBeenCalled();expect(picker).not.toHaveBeenCalled();
});
it('keeps iPad native Save independent of Mac staging',async()=>{
 const {saveNative}=await import('../../../src/lib/nativeDialog');Object.defineProperty(navigator,'maxTouchPoints',{value:5,configurable:true});savePicker.mockResolvedValue('/mobile/mix.wav');
 expect(await saveNative()).toBe('/mobile/mix.wav');expect(invoke).not.toHaveBeenCalled();expect(picker).not.toHaveBeenCalled();
});
it('propagates staging-check failure before starting an export',async()=>{
 const {saveNative}=await import('../../../src/lib/nativeDialog');savePicker.mockResolvedValue('/work/mix.wav');invoke.mockRejectedValue(new Error('Staging unavailable'));
 await expect(saveNative()).rejects.toThrow('Staging unavailable');expect(picker).not.toHaveBeenCalled();
});

it('restores bookmarked media locations before linked project audio is read',async()=>{
 const {deserializeProject}=await import('../../../src/lib/projectFile');
 const saved={format:'crispaudio-project',version:3,sources:[{id:'s',name:'take',path:'/old.wav',sampleRate:48000,channels:1}],project:{id:'p',name:'project',sampleRate:48000,duration:1,tracks:[],masterEffects:[]}};
 invoke.mockResolvedValue({'/old.wav':'/new.wav'});read.mockResolvedValue(new Uint8Array([0,1]));
 const buffer={getChannelData:()=>new Float32Array([0,0]),duration:1,sampleRate:48000,numberOfChannels:1};const decode=vi.fn().mockResolvedValue(buffer);
 const result=await deserializeProject(JSON.stringify(saved),{sampleRate:48000,decodeAudioData:decode} as unknown as BaseAudioContext);
 expect(invoke).toHaveBeenCalledWith('relocate_resource_paths',{paths:['/old.wav']});expect(read).toHaveBeenCalledExactlyOnceWith('/new.wav');expect(result.sources.get('s')?.filePath).toBe('/new.wav');
});
it('keeps browser and iPad recovery independent of Mac bookmark restoration',async()=>{
 const {restoreProjectResources}=await import('../../../src/lib/resourceAccess');
 Object.defineProperty(navigator,'maxTouchPoints',{value:5,configurable:true});expect(await restoreProjectResources('original')).toBe('original');
 delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;expect(await restoreProjectResources('original')).toBe('original');expect(invoke).not.toHaveBeenCalled();
});
it('does not decode linked audio after a bookmark restoration failure',async()=>{
 const {deserializeProject}=await import('../../../src/lib/projectFile');invoke.mockRejectedValue(new Error('File access unavailable'));const decode=vi.fn();
 await expect(deserializeProject(JSON.stringify({sources:[{path:'/old.wav'}]}),{decodeAudioData:decode} as unknown as BaseAudioContext)).rejects.toThrow('File access unavailable');expect(read).not.toHaveBeenCalled();expect(decode).not.toHaveBeenCalled();
});

it('does not send embedded audio or display text through bookmark IPC',async()=>{
 const {restoreProjectResources}=await import('../../../src/lib/resourceAccess');const json=JSON.stringify({sources:[{path:'/old.wav',wav:'embedded PCM'}],project:{video:{path:'/old.wav'},name:'/old.wav'}});invoke.mockResolvedValue({'/old.wav':'/new.wav'});
 const restored=JSON.parse(await restoreProjectResources(json));expect(invoke).toHaveBeenCalledExactlyOnceWith('relocate_resource_paths',{paths:['/old.wav']});expect(restored.sources[0]).toEqual({path:'/new.wav',wav:'embedded PCM'});expect(restored.project.name).toBe('/old.wav');expect(restored.project.video.path).toBe('/new.wav');
});
it('leaves portable audio and unresolved documents unchanged without extra IPC',async()=>{
 const {restoreProjectResources}=await import('../../../src/lib/resourceAccess');const portable=JSON.stringify({sources:[{wav:'embedded PCM'}]});expect(await restoreProjectResources(portable)).toBe(portable);expect(invoke).not.toHaveBeenCalled();
 invoke.mockResolvedValue({});const linked=JSON.stringify({sources:[{path:'/offline.wav'}]});expect(await restoreProjectResources(linked)).toBe(linked);
});
it('batches large projects without sending audio payloads',async()=>{
 const {restoreProjectResources}=await import('../../../src/lib/resourceAccess');const sources=Array.from({length:4097},(_,i)=>({path:`/old-${i}`,wav:'PCM'}));invoke.mockResolvedValue({'/old-4096':'/last'});
 const restored=JSON.parse(await restoreProjectResources(JSON.stringify({sources})));
 expect(invoke).toHaveBeenCalledTimes(2);expect(invoke.mock.calls[0][1].paths).toHaveLength(4096);expect(invoke.mock.calls[1]).toEqual(['relocate_resource_paths',{paths:['/old-4096']}]);expect(restored.sources[4096].path).toBe('/last');
});
