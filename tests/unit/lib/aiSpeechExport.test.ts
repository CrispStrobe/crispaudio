import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {downloadWavFile} from '../../../src/lib/wavExport';
import {shareFile} from '../../../src/lib/native';
import {audioReceipt,importedSpeechWavRegions,speechGeneration} from '../../../src/lib/aiSpeechProvenance';
import {encodeWavJS} from '../../../src/lib/wavRuntime';
import {invoke} from '@tauri-apps/api/core';
import {save} from '@tauri-apps/plugin-dialog';
import {writeFile} from '@tauri-apps/plugin-fs';
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn()}));
vi.mock('@tauri-apps/plugin-dialog',()=>({save:vi.fn()}));
vi.mock('@tauri-apps/plugin-fs',()=>({writeFile:vi.fn()}));
const receipt=audioReceipt([{...speechGeneration('/private/name/model.gguf'),start:0,end:.01}])!;
beforeEach(()=>{vi.resetAllMocks();Object.assign(window,{__TAURI_INTERNALS__:{}});});
afterEach(()=>{Reflect.deleteProperty(window,'__TAURI_INTERNALS__');vi.restoreAllMocks();});

it('desktop WAV download embeds an unsigned declaration that survives ordinary import',async()=>{
 vi.mocked(save).mockResolvedValue('/chosen.wav');
 const pcm=new Float32Array([.1,.2,.3]),input=encodeWavJS(pcm,16000,24);
 await expect(downloadWavFile(input,'mix.wav',receipt)).resolves.toBe(true);
 const [path,bytes]=vi.mocked(writeFile).mock.calls[0];
 expect(path).toBe('/chosen.wav');expect(writeFile).toHaveBeenCalledOnce();
 expect(importedSpeechWavRegions(bytes as Uint8Array)).toEqual(receipt.regions.map(r=>({...r,basis:'imported-unsigned-declaration'})));
});
it('compressed desktop download writes a private-data-free companion receipt',async()=>{
 vi.mocked(save).mockResolvedValue('/chosen.flac');
 await downloadWavFile(new Blob([new Uint8Array([1,2,3])]),'mix.flac',receipt);
 const calls=vi.mocked(writeFile).mock.calls;
 expect(calls[0][0]).toBe('/chosen.flac');expect(calls[1][0]).toBe('/chosen.flac.provenance.json');
 expect(calls[1][2]).toEqual({createNew:true});
 expect(JSON.parse(new TextDecoder().decode(calls[1][1] as Uint8Array))).toEqual(receipt);
 expect(new TextDecoder().decode(calls[1][1] as Uint8Array)).not.toContain('/private/');
});
it('shares compressed audio and its receipt together through the native iOS bridge',async()=>{
 vi.spyOn(navigator,'userAgent','get').mockReturnValue('iPhone');
 vi.mocked(invoke).mockImplementation(async(command,args,options)=>{
  if(command==='stage_share_file')return `/stage/${(options as {headers:Record<string,string>}).headers['x-file-name']}`;
  if(command==='plugin:crispaudio-native|shareFile')return {completed:true};
  throw new Error(`Unexpected ${command}: ${String(args)}`);
 });
 await expect(downloadWavFile(new Blob([new Uint8Array([1])]),'voice.aac',receipt)).resolves.toBe(true);
 expect(invoke).toHaveBeenLastCalledWith('plugin:crispaudio-native|shareFile',{path:'/stage/voice.aac',relatedPaths:['/stage/voice.aac.provenance.json']});
 expect(writeFile).not.toHaveBeenCalled();
});
it('keeps the original one-file share contract for unmarked files',async()=>{
 vi.mocked(invoke).mockResolvedValueOnce('/stage/plain.wav').mockResolvedValueOnce({completed:true});
 await expect(shareFile(new Blob([new Uint8Array([1])]),'plain.wav')).resolves.toBe(true);
 expect(invoke).toHaveBeenLastCalledWith('plugin:crispaudio-native|shareFile',{path:'/stage/plain.wav'});
});
