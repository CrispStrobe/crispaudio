import {invoke} from '@tauri-apps/api/core';
import {writeFile,remove} from '@tauri-apps/plugin-fs';
import {projectAudioReceipt,receiptText} from './aiSpeechProvenance';
import {saveNative as save} from './nativeDialog';
import { mediaJob } from './mediaJob';
import type { linkedRenderDocument } from './projectFile';
import type { AudioExportStage } from '../hooks/useAudioExport';

/** The native save dialog precedes rendering; no Blob or audio cache is created. */
export async function exportLinkedAudio(document: NonNullable<ReturnType<typeof linkedRenderDocument>>,
  filename: string, format: 'wav' | 'flac' | 'aac', bitDepth: number, signal: AbortSignal,
  setStage: (stage: AudioExportStage | null) => void, bitrateKbps = 192, range?:{start:number;end:number}, dither = false): Promise<boolean> {
  signal.throwIfAborted();
  const output = await save({ defaultPath: filename, filters: format === 'aac'
    ? [{ name: 'AAC Audio', extensions: ['aac'] }, { name: 'M4A Audio', extensions: ['m4a'] }]
    : [{ name: `${format.toUpperCase()} Audio`, extensions: [format] }] });
  signal.throwIfAborted();
  if (!output) return false;
  const receipt=projectAudioReceipt(document.project,new Map(document.sources.map(s=>[s.id,s])),range);
  const staged=receipt&&format==='wav'?`${output}.${crypto.randomUUID()}.partial.wav`:output;
  setStage('rendering');
  try {
    await mediaJob(`export_linked_project_${format}`,
      { document: range?{...document,renderRange:range}:document, output:staged, ...(format === 'wav' ? { bitDepth, dither } : format === 'aac' ? { bitrateKbps } : {}) }, signal);
    signal.throwIfAborted();
    if(receipt){
      if(format==='wav') {
        await invoke('annotate_delivery_wav',{staged,metadata:{aiProvenance:receipt}});
        signal.throwIfAborted();
        await invoke('publish_delivery_stage',{staged,output});
      } else await writeFile(`${output}.provenance.json`,new TextEncoder().encode(receiptText(receipt)),{createNew:true});
    }
  } finally { if(staged!==output) await remove(staged).catch(()=>{}); }
  return true;
}
