import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {open,save} from '../../../src/lib/nativeDialog';
import {saveProjectFile} from '../../../src/lib/projectIO';
const picker=vi.hoisted(()=>vi.fn());
const savePicker=vi.hoisted(()=>vi.fn());
const invoke=vi.hoisted(()=>vi.fn());
const write=vi.hoisted(()=>vi.fn());
vi.mock('@tauri-apps/plugin-dialog',()=>({open:picker,save:savePicker}));
vi.mock('@tauri-apps/api/core',()=>({invoke}));
vi.mock('@tauri-apps/plugin-fs',()=>({readTextFile:vi.fn(),writeTextFile:write}));
beforeEach(()=>{Object.assign(window,{__TAURI_INTERNALS__:{}});vi.spyOn(navigator,'userAgent','get').mockReturnValue('Macintosh');Object.defineProperty(navigator,'maxTouchPoints',{value:0,configurable:true});invoke.mockReset();picker.mockReset();write.mockReset();savePicker.mockReset();});
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
