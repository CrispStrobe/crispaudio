import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: vi.fn(), remove: vi.fn(async()=>{}) }));
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { exportLinkedAudio } from '../../../src/lib/linkedAudioExport';
import { linkedRenderDocument } from '../../../src/lib/projectFile';
import type { TimelineProject } from '../../../src/types/audio';
import {writeFile,remove} from '@tauri-apps/plugin-fs';
import {speechGeneration} from '../../../src/lib/aiSpeechProvenance';
const document = linkedRenderDocument({ id: 'p', name: 'empty', sampleRate: 48000,
  duration: 1, tracks: [], masterEffects: [] } as TimelineProject, new Map())!;
beforeEach(() => { vi.resetAllMocks(); vi.mocked(remove).mockResolvedValue(undefined); });
function markedDocument(){
 const g=speechGeneration('/private/model.gguf',new Date('2026-11-26'));
 return {...document,project:{...document.project,tracks:[{id:'t',name:'Voice',volume:1,pan:0,muted:false,solo:false,segments:[{id:'clip',trackId:'t',sourceId:'s',startTime:0,sourceOffset:0,duration:1,gain:1,effects:[]}]}] as TimelineProject['tracks']},sources:[{id:'s',name:'Source',path:'/private/voice.wav',sampleRate:48000,channels:1,duration:1,aiSpeech:[{...g,start:.25,end:.75}]}]};
}
it('annotates a fresh native WAV stage before publication and keeps private source paths out of its receipt',async()=>{
 vi.mocked(save).mockResolvedValue('/marked.wav');
 await exportLinkedAudio(markedDocument(),'marked.wav','wav',24,new AbortController().signal,vi.fn());
 const calls=vi.mocked(invoke).mock.calls,stage=(calls[0][1] as {output:string}).output;
 expect(stage).toMatch(/^\/marked.wav\..*\.partial.wav$/);
 expect(calls.map(c=>c[0])).toEqual(['export_linked_project_wav','annotate_delivery_wav','publish_delivery_stage']);
 expect(calls[1][1]).toMatchObject({staged:stage,metadata:{aiProvenance:{signature:'unsigned',regions:[{start:.25,end:.75,model:'configured-local-speech-model'}]}}});
 expect(JSON.stringify(calls[1][1])).not.toContain('/private/');
 expect(calls[2][1]).toEqual({staged:stage,output:'/marked.wav'});
 expect(remove).toHaveBeenCalledWith(stage);
});
it('does not publish an unmarked WAV when provenance annotation fails',async()=>{
 vi.mocked(save).mockResolvedValue('/marked.wav');
 vi.mocked(invoke).mockImplementation(async command=>{if(command==='annotate_delivery_wav')throw new Error('Metadata failed');});
 await expect(exportLinkedAudio(markedDocument(),'marked.wav','wav',24,new AbortController().signal,vi.fn())).rejects.toThrow('Metadata failed');
 expect(vi.mocked(invoke).mock.calls.map(c=>c[0])).not.toContain('publish_delivery_stage');
 expect(remove).toHaveBeenCalledOnce();
});
it('saves a separate receipt for compressed audio without overwriting another receipt',async()=>{
 vi.mocked(save).mockResolvedValue('/marked.flac');
 await exportLinkedAudio(markedDocument(),'marked.flac','flac',24,new AbortController().signal,vi.fn(),192,{start:.5,end:1});
 const [path,bytes,options]=vi.mocked(writeFile).mock.calls[0];
 expect(path).toBe('/marked.flac.provenance.json');expect(options).toEqual({createNew:true});
 expect(JSON.parse(new TextDecoder().decode(bytes as Uint8Array)).regions).toMatchObject([{start:0,end:.25}]);
});
it('passes explicit transient bounds without changing the saved project',async()=>{
 vi.mocked(save).mockResolvedValue('/range.wav');
 await exportLinkedAudio(document,'range.wav','wav',24,new AbortController().signal,vi.fn(),192,{start:.2,end:.6});
 expect(invoke).toHaveBeenCalledWith('export_linked_project_wav',{document:{...document,renderRange:{start:.2,end:.6}},output:'/range.wav',bitDepth:24,dither:false,jobId:expect.any(String)});
 expect(document).not.toHaveProperty('renderRange');
});
it('saves directly with the chosen bit depth after selecting the destination', async () => {
  vi.mocked(save).mockResolvedValue('/mix.wav'); const stage = vi.fn();
  await expect(exportLinkedAudio(document, 'mix.wav', 'wav', 24, new AbortController().signal, stage)).resolves.toBe(true);
  expect(stage).toHaveBeenCalledExactlyOnceWith('rendering');
  expect(invoke).toHaveBeenCalledExactlyOnceWith('export_linked_project_wav',
    { document, output: '/mix.wav', bitDepth: 24, dither: false, jobId: expect.any(String) });
});
it('forwards the dither choice to the native PCM renderer', async () => {
  vi.mocked(save).mockResolvedValue('/mix16.wav');
  await exportLinkedAudio(document, 'mix16.wav', 'wav', 16, new AbortController().signal, vi.fn(), 192, undefined, true);
  expect(invoke).toHaveBeenCalledExactlyOnceWith('export_linked_project_wav',
    { document, output: '/mix16.wav', bitDepth: 16, dither: true, jobId: expect.any(String) });
});
it('cancelling the save dialog starts no rendering or media job', async () => {
  vi.mocked(save).mockResolvedValue(null); const stage = vi.fn();
  await expect(exportLinkedAudio(document, 'mix.wav', 'wav', 16, new AbortController().signal, stage)).resolves.toBe(false);
  expect(stage).not.toHaveBeenCalled(); expect(invoke).not.toHaveBeenCalled();
});
it('an abort while the save dialog is open prevents a late destination from rendering', async () => {
  const controller = new AbortController();
  vi.mocked(save).mockImplementation(async () => { controller.abort(); return '/mix.wav'; });
  await expect(exportLinkedAudio(document, 'mix.wav', 'wav', 16, controller.signal, vi.fn())).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
});
it('native failure is surfaced without reading back bytes or choosing another mixer', async () => {
  vi.mocked(save).mockResolvedValue('/mix.wav'); vi.mocked(invoke).mockRejectedValueOnce(new Error('Output already exists'));
  await expect(exportLinkedAudio(document, 'mix.wav', 'wav', 32, new AbortController().signal, vi.fn())).rejects.toThrow('already exists');
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('FLAC chooses the native codec with its fixed 24-bit depth rather than the WAV setting', async () => {
  vi.mocked(save).mockResolvedValue('/mix.flac');
  await exportLinkedAudio(document, 'mix.flac', 'flac', 8, new AbortController().signal, vi.fn());
  expect(invoke).toHaveBeenCalledExactlyOnceWith('export_linked_project_flac',
    { document, output: '/mix.flac', jobId: expect.any(String) });
});

it('AAC preserves its ADTS extension and forwards the selected bitrate', async () => {
  vi.mocked(save).mockResolvedValue('/mix.aac');
  await exportLinkedAudio(document, 'mix.aac', 'aac', 24, new AbortController().signal, vi.fn(), 256);
  expect(invoke).toHaveBeenCalledExactlyOnceWith('export_linked_project_aac',
    { document, output: '/mix.aac', bitrateKbps: 256, jobId: expect.any(String) });
  expect(save).toHaveBeenCalledWith({ defaultPath: 'mix.aac', filters: [{ name: 'AAC Audio', extensions: ['aac'] }, { name: 'M4A Audio', extensions: ['m4a'] }] });
});

it('M4A selection retains the native AAC job and selected bitrate', async () => {
  vi.mocked(save).mockResolvedValue('/mix.m4a');
  await exportLinkedAudio(document, 'mix.aac', 'aac', 24, new AbortController().signal, vi.fn(), 128);
  expect(invoke).toHaveBeenCalledExactlyOnceWith('export_linked_project_aac',
    { document, output: '/mix.m4a', bitrateKbps: 128, jobId: expect.any(String) });
});
