import {expect,it,vi} from 'vitest';
import {appendSourceEdit,validSourceEditJournal,validProjectSourceJournals,validateSourceJournalAudio} from '../../../src/lib/sourceEditJournal';
import {serializeProject,deserializeProject,validateFrozenProjectAudio,projectSourceIds} from '../../../src/lib/projectFile';
import {sourcePluginRecallPlan} from '../../../src/lib/sourcePluginRecall';
import {recallFixture} from '../../fixtures/sourcePluginRecall';
import type {SourceEdit,SourceEditOperation} from '../../../src/types/audio';
const operation:SourceEditOperation={type:'invert',channel:-1,ranges:[{start:400,end:3000}],targetDb:-1};
function fixture(rate=48000,channels=2){
 const f=recallFixture(rate,channels);delete f.clip.sourceEdit;f.clip.sourceId=f.original.id;f.clip.sourceOffset=1200/rate;f.clip.duration=4800/rate;
 const edit=appendSourceEdit(f.clip,f.original,f.state.sources,operation,4800);f.clip.sourceEdit=edit;f.clip.sourceId=f.source.id;f.clip.sourceOffset=0;
 f.state.project.tracks[0].segments=[f.clip];return {...f,edit};
}
it.each([[44100,1],[48000,2],[96000,2]])('records complete decoded %i Hz/%i-channel windows without inferring legacy provenance',(rate,channels)=>{
 const f=fixture(rate,channels);expect(f.edit.journal).toEqual({version:1,sampleRate:rate,channels});expect(f.edit.operations[0].window).toEqual({start:1200,frames:4800});expect(f.edit.offset).toBe(1200/rate);expect(validSourceEditJournal(f.edit)).toBe(true);expect(()=>validateSourceJournalAudio(f.state.project,f.state.sources)).not.toThrow();expect(operation.window).toBeUndefined();
});
it('preserves earlier full windows across subsequent trimming and captures the next crop on the root sample clock',()=>{
 const f=fixture();f.clip.sourceOffset=1200/48000;f.clip.duration=2400/48000;
 const next=appendSourceEdit(f.clip,f.source,f.state.sources,{...operation,type:'normalize',channel:1,ranges:[{start:0,end:2400}]},2400);
 expect(next.operations.map(o=>o.window)).toEqual([{start:1200,frames:4800},{start:2400,frames:2400}]);expect(next.offset).toBe(2400/48000);expect(next.operations[0].ranges).toEqual([{start:400,end:3000}]);expect(next.sourceId).toBe('original');expect(f.edit.operations).toHaveLength(1);expect(validSourceEditJournal(next)).toBe(true);
});
it('anchors fractional trim positions to the samples actually copied, avoiding cumulative floating-point origin changes',()=>{
 const f=fixture(44100);f.clip.sourceOffset=1.4/44100;f.clip.duration=2000/44100;const next=appendSourceEdit(f.clip,f.source,f.state.sources,{...operation,ranges:[{start:0,end:2000}]},2000);expect(next.operations[1].window!.start).toBe(1201);expect(next.offset).toBe(1201/44100);
});
it('copies caller-owned ranges/recipes and never modifies retained source PCM',()=>{
 const f=fixture(),before=new Float32Array(f.original.buffer.getChannelData(0)),op={...operation,ranges:[{start:0,end:2400}],plugin:{id:'vst3:test',name:'Test',parameters:{gain:.5},state:'base',latency:0}};f.clip.sourceOffset=1200/48000;
 const next=appendSourceEdit(f.clip,f.source,f.state.sources,op,2400);op.ranges[0].end=1;op.plugin.parameters.gain=1;expect(next.operations[1].ranges[0].end).toBe(2400);expect(next.operations[1].plugin!.parameters.gain).toBe(.5);expect(f.original.buffer.getChannelData(0)).toEqual(before);
});
it('keeps legacy mixed and single histories unverified even when all ranges happen to fit',()=>{
 for(const mixed of [false,true]){const f=recallFixture();if(mixed)f.clip.sourceEdit!.operations.push({...operation,ranges:[{start:0,end:100}]});const old=structuredClone(f.clip.sourceEdit),next=appendSourceEdit(f.clip,f.source,f.state.sources,{...operation,ranges:[{start:0,end:2400}]},2400);expect(next.journal).toBeUndefined();expect(next.operations.at(-1)!.window).toBeUndefined();expect(next.operations.slice(0,-1)).toEqual(old!.operations);expect(next.offset).toBe(old!.offset+f.clip.sourceOffset);}
});
it('drops completeness when the bounded journal truncates instead of falsely replaying the last 64 operations from dry PCM',()=>{
 const f=fixture();f.edit.operations=Array.from({length:64},()=>structuredClone(f.edit.operations[0]));const next=appendSourceEdit(f.clip,f.source,f.state.sources,operation,4800);expect(next.operations).toHaveLength(64);expect(next.journal).toBeUndefined();expect(next.operations.at(-1)!.window).toBeUndefined();
});
it.each(['version','rate','channels','empty','missingWindow','fractional','overflow','range','channel','expandedWindow','offset','retimed'])('refuses malformed complete %s histories',kind=>{
 const f=fixture(),edit=structuredClone(f.edit);
 if(kind==='version')edit.journal!.version=2 as 1;if(kind==='rate')edit.journal!.sampleRate=NaN;if(kind==='channels')edit.journal!.channels=0;if(kind==='empty')edit.operations=[];if(kind==='missingWindow')delete edit.operations[0].window;if(kind==='fractional')edit.operations[0].window!.start=.1;if(kind==='overflow')edit.operations[0].window!.start=Number.MAX_SAFE_INTEGER;if(kind==='range')edit.operations[0].ranges[0].end=4801;if(kind==='channel')edit.operations[0].channel=2;if(kind==='expandedWindow')edit.operations.push({...structuredClone(edit.operations[0]),window:{start:0,frames:6000}});if(kind==='offset')edit.offset+=1/48000;if(kind==='retimed')edit.retime={} as NonNullable<SourceEdit['retime']>;
 expect(validSourceEditJournal(edit)).toBe(false);f.clip.sourceEdit=edit;expect(()=>serializeProject(f.state.project,f.state.sources)).toThrow('Invalid source edit journal');
});
it.each(['missingOriginal','missingDerived','rootBounds','frames','sourceRate','bufferRate','channels'])('checks %s against decoded source buffers before saving/recovery',kind=>{
 const f=fixture();if(kind==='missingOriginal')f.state.sources.delete('original');if(kind==='missingDerived')f.state.sources.delete('edited');if(kind==='rootBounds'){f.edit.operations[0].window!.start=8000;f.edit.offset=8000/48000;}if(kind==='frames')f.source.buffer=f.make(4799);if(kind==='sourceRate')f.source.sampleRate=44100;if(kind==='bufferRate')Object.assign(f.original.buffer,{sampleRate:44100});if(kind==='channels')f.original.channels=1;
 expect(()=>validateFrozenProjectAudio(f.state.project,f.state.sources)).toThrow('Invalid source edit journal audio');expect(()=>serializeProject(f.state.project,f.state.sources)).toThrow('Invalid source edit journal audio');
});
it('checks comp bases and retained frozen originals as well as visible clips',()=>{
 const f=fixture();const invalid={...f.clip,sourceEdit:{...f.edit,journal:{...f.edit.journal!,version:2 as 1}}};f.state.project.tracks[0].compBaseSegments=[invalid];expect(validProjectSourceJournals(f.state.project)).toBe(false);delete f.state.project.tracks[0].compBaseSegments;Object.assign(f.state.project.tracks[0],{freeze:{original:{segments:[invalid]}}});expect(validProjectSourceJournals(f.state.project)).toBe(false);
});
it('preserves provenance through reversible retiming and gates new destructive edits after that timing',()=>{
 const f=fixture(),retimed={...f.source,id:'retimed',buffer:f.make(9600),duration:9600/48000};f.state.sources.set(retimed.id,retimed);f.clip.sourceId=retimed.id;f.clip.retime={rate:.5,reverse:false,preservePitch:false,semitones:0,original:{sourceId:f.source.id,offset:0,duration:4800/48000}};
 expect(()=>validateSourceJournalAudio(f.state.project,f.state.sources)).not.toThrow();const next=appendSourceEdit(f.clip,retimed,f.state.sources,operation,4800);expect(next.journal).toBeUndefined();expect(next.retime).toBe(f.clip.retime);expect(f.edit.journal).toBeDefined();
});
it('does not allocate source windows for an invalid current crop or invalid prior metadata',()=>{
 const f=fixture();f.clip.sourceOffset=-1;expect(()=>appendSourceEdit(f.clip,f.source,f.state.sources,operation,2400)).toThrow('sourceEditor.changed');f.clip.sourceOffset=1;expect(()=>appendSourceEdit(f.clip,f.source,f.state.sources,operation,2400)).toThrow('sourceEditor.changed');f.clip.sourceOffset=0;delete f.edit.operations[0].window;expect(()=>appendSourceEdit(f.clip,f.source,f.state.sources,operation,2400)).toThrow('Invalid source edit journal');
});
it('rejects malformed metadata before decoding audio on reopen',async()=>{
 const f=fixture(),json=JSON.parse(serializeProject(f.state.project,f.state.sources));delete json.project.tracks[0].segments[0].sourceEdit.operations[0].window;const decode=vi.fn();await expect(deserializeProject(JSON.stringify(json),{sampleRate:48000,decodeAudioData:decode} as unknown as BaseAudioContext)).rejects.toThrow('Invalid source edit journal');expect(decode).not.toHaveBeenCalled();
});
it('round-trips the window journal and retained originals in a portable project',async()=>{
 const f=fixture(),decode=vi.fn(async(bytes:ArrayBuffer)=>{const view=new DataView(bytes),channels=view.getUint16(22,true),rate=view.getUint32(24,true),frames=view.getUint32(44,true);return {length:frames,sampleRate:rate,numberOfChannels:channels,duration:frames/rate,getChannelData:()=>new Float32Array(frames)} as AudioBuffer;}),json=serializeProject(f.state.project,f.state.sources),loaded=await deserializeProject(json,{sampleRate:48000,decodeAudioData:decode} as unknown as BaseAudioContext);
 expect(loaded.project.tracks[0].segments[0].sourceEdit).toEqual(f.edit);expect(projectSourceIds(loaded.project)).toEqual(new Set(['edited','original']));expect(()=>validateSourceJournalAudio(loaded.project,loaded.sources)).not.toThrow();
});
it('keeps saved single-plugin recall compatible but refuses inconsistent advertised window provenance',()=>{
 const f=fixture();f.edit.operations[0]={...f.edit.operations[0],type:'plugin',plugin:recallFixture().clip.sourceEdit!.operations[0].plugin};expect(sourcePluginRecallPlan(f.state,'clip').frames).toBe(4800);f.edit.operations[0].window!.frames=4799;expect(()=>sourcePluginRecallPlan(f.state,'clip')).toThrow('sourceRecall.format');
});
it('rejects decoded PCM that contradicts otherwise valid saved windows',async()=>{
 const f=fixture(),json=serializeProject(f.state.project,f.state.sources),decode=vi.fn(async(bytes:ArrayBuffer)=>{const view=new DataView(bytes),frames=view.getUint32(44,true);return f.make(frames===4800?4799:frames);});await expect(deserializeProject(json,{sampleRate:48000,decodeAudioData:decode} as unknown as BaseAudioContext)).rejects.toThrow('Invalid source edit journal audio');expect(decode).toHaveBeenCalledTimes(2);
});
it('refuses an invalid journal before recovery can touch its database or encode sources',async()=>{
 const f=fixture();delete f.edit.operations[0].window;const {cacheRecovery}=await import('../../../src/lib/recovery');await expect(cacheRecovery(f.state.project,f.state.sources)).rejects.toThrow('Invalid source edit journal');
});
it('leaves unrelated missing-group diagnostics to the existing project validators',()=>{
 const project={tracks:[{}, {segments:[],freeze:{}}, {compBaseSegments:[]}]} as never;expect(validProjectSourceJournals(project)).toBe(true);
});
