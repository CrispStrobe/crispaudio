import {beforeEach,expect,it,vi} from 'vitest';
import {replayFixture} from '../../fixtures/sourcePluginReplay';
import {sourcePluginRecallPlan,sourcePluginRecallCommit} from '../../../src/lib/sourcePluginRecall';
import {renderSourcePluginRecall} from '../../../src/audio/plugins/SourcePluginRecallRender';
import {validateSourceJournalAudio} from '../../../src/lib/sourceEditJournal';
import type {NativeSourceInput} from '../../../src/audio/engine/NativeSourceAudition';
const pass=vi.hoisted(()=>vi.fn());
vi.mock('../../../src/audio/engine/SourcePluginWaveform',async original=>({...await original<object>(),renderSourcePluginPass:pass}));
const effect=(input:NativeSourceInput)=>({pcm:input.channels.map(c=>Float32Array.from(c,(v,i)=>v*input.effect.parameters.gain+(i?c[i-1]*.1:0))),latency:.002});
beforeEach(()=>{pass.mockReset();pass.mockImplementation(async input=>effect(input));});
function expected(f:ReturnType<typeof replayFixture>,gainA:number,gainB:number){
 const upstream=(ch:number,i:number)=>{const pos=2400+i,raw=f.original.buffer.getChannelData(ch),a=i+600;let value=-raw[pos];if(ch===0&&(a<2000||a>=3000))value=Math.fround(value*gainA-raw[pos-1]*.1);if(ch===1&&i>=100&&i<200)value=0;return value;};
 return Array.from({length:2},(_,ch)=>Float32Array.from({length:4800},(_,i)=>upstream(ch,i)*gainB+(i?upstream(ch,i-1)*.1:0)));
}
it.each([44100,48000])('replays all saved windows in order at %i Hz, cropping only after upstream history',async rate=>{
 const f=replayFixture(rate),before=f.original.buffer.getChannelData(0).slice(),plan=sourcePluginRecallPlan(f.state,'clip',1),recipe={...plan.recipe,parameters:{gain:.75},state:'normalized-a'},prepared=await renderSourcePluginRecall(plan,recipe,plan.operation,new AbortController().signal);
 expect(plan.frames).toBe(5400);expect(plan.outputFrames).toBe(4800);expect(plan.selectionVisible).toEqual({start:1800,end:4200});expect(prepared.pcm).toEqual(expected(f,.75,.25));expect(pass).toHaveBeenCalledTimes(2);
 expect(pass.mock.calls.map(([input])=>({frames:input.channels[0].length,id:input.effect.pluginId,state:input.effect.state,gain:input.effect.parameters.gain}))).toEqual([{frames:5400,id:'vst3:test',state:'normalized-a',gain:.75},{frames:4800,id:'vst3:second',state:'base-b',gain:.25}]);
 expect(pass.mock.calls[0][0].channels[0][0]).toBe(-f.original.buffer.getChannelData(0)[1800]);expect(pass.mock.calls[0][0].channels[0][599]).toBe(-f.original.buffer.getChannelData(0)[2399]);expect(prepared.recipe.latency).toBe(.002);expect(f.original.buffer.getChannelData(0)).toEqual(before);expect(f.operations[1].plugin!.parameters.gain).toBe(.5);
});
it('selects either external effect explicitly and restores other saved settings unchanged',async()=>{
 const f=replayFixture(),plan=sourcePluginRecallPlan(f.state,'clip',3),prepared=await renderSourcePluginRecall(plan,{...plan.recipe,parameters:{gain:.75}},plan.operation,new AbortController().signal);expect(prepared.pcm).toEqual(expected(f,.5,.75));expect(pass.mock.calls.map(([input])=>input.effect.state)).toEqual(['base-a','base-b']);expect(plan.choices).toEqual([{index:1,name:'Fixture'},{index:3,name:'Second'}]);expect(sourcePluginRecallPlan(f.state,'clip').operationIndex).toBe(3);
});
it('replaces only the chosen recipe/mask, preserves earlier windows, siblings and repeatability',async()=>{
 const f=replayFixture(),plan=sourcePluginRecallPlan(f.state,'clip',1),recipe={...plan.recipe,parameters:{gain:.75}},prepared=await renderSourcePluginRecall(plan,recipe,plan.operation,new AbortController().signal),buffer=f.make(4800);prepared.pcm.forEach((c,ch)=>buffer.copyToChannel(c,ch));const next=sourcePluginRecallCommit(plan,prepared,{...f.source,id:'new',buffer},f.state),edit=next.project.tracks[0].segments[0].sourceEdit!;
 expect(edit.operations).toHaveLength(4);for(const index of [0,2,3])expect(edit.operations[index]).toEqual(f.operations[index]);expect(edit.operations[1]).toMatchObject({window:{start:1800,frames:5400},plugin:{parameters:{gain:.75}}});expect(edit.offset).toBe(f.clip.sourceEdit!.offset);expect(next.project.tracks[0].segments[0].sourceOffset).toBe(f.clip.sourceOffset);expect(next.project.tracks[0].segments[1]).toBe(f.state.project.tracks[0].segments[1]);expect(()=>validateSourceJournalAudio(next.project,next.sources)).not.toThrow();
 const again=sourcePluginRecallPlan(next,'clip',1),repeated=await renderSourcePluginRecall(again,recipe,again.operation,new AbortController().signal);expect(repeated.pcm).toEqual(prepared.pcm);
});
it('uses an edited target mask before downstream operations, retaining upstream processing outside the mask',async()=>{
 const f=replayFixture(),plan=sourcePluginRecallPlan(f.state,'clip',1),prepared=await renderSourcePluginRecall(plan,plan.recipe,{channel:1,ranges:[{start:600,end:800}]},new AbortController().signal);expect(prepared.selection).toEqual({channel:1,ranges:[{start:600,end:800}]});
 // Channel zero has only the preceding polarity inversion and the later gain/history effect.
 const raw=f.original.buffer.getChannelData(0);expect(prepared.pcm[0][0]).toBe(Math.fround(-raw[2400]*.25));expect(prepared.pcm[0][1]).toBe(Math.fround(-raw[2401]*.25-raw[2400]*.1));expect(prepared.pcm[1][110]).toBe(0);
});
it.each(['unknown','chain','repair','badParameters','stereoChannel','missingJournal','missingWindow','tooMany','tooLong'])('refuses %s histories before any helper renders',kind=>{
 const f=replayFixture();if(kind==='unknown')f.operations[0].type='future';if(kind==='chain')f.operations[0].type='chain';if(kind==='repair')f.operations[0].type='repair';if(kind==='badParameters')f.operations[0].targetDb=NaN;if(kind==='stereoChannel'){f.operations[0].type='swap';f.operations[0].channel=0;}if(kind==='missingJournal')delete f.clip.sourceEdit!.journal;if(kind==='missingWindow')delete f.operations[0].window;if(kind==='tooMany')f.operations.unshift(...Array.from({length:5},()=>structuredClone(f.operations[0])));if(kind==='tooLong'){Object.assign(f.original.buffer,{length:48000*40});f.operations[0].window!.frames=48000*31;}
 expect(()=>sourcePluginRecallPlan(f.state,'clip')).toThrow('sourceRecall.');expect(pass).not.toHaveBeenCalled();
});
it.each(['shape','nan','latency'])('discards invalid %s helper output without preparing partial history',async kind=>{
 const f=replayFixture(),plan=sourcePluginRecallPlan(f.state,'clip',1);pass.mockImplementationOnce(async input=>{const result=effect(input);if(kind==='shape')result.pcm[0]=new Float32Array(1);if(kind==='nan')result.pcm[0][0]=NaN;if(kind==='latency')result.latency=NaN;return result;});await expect(renderSourcePluginRecall(plan,plan.recipe,plan.operation,new AbortController().signal)).rejects.toThrow('sourceRecall.format');expect(pass).toHaveBeenCalledTimes(1);expect(f.source.buffer.getChannelData(0)[0]).toBe(3);
});
it('does not start later processors after cancellation or after a helper failure',async()=>{
 const f=replayFixture(),plan=sourcePluginRecallPlan(f.state,'clip',1),controller=new AbortController();pass.mockImplementationOnce(async input=>{controller.abort();return effect(input);});await expect(renderSourcePluginRecall(plan,plan.recipe,plan.operation,controller.signal)).rejects.toThrow();expect(pass).toHaveBeenCalledTimes(1);pass.mockReset().mockRejectedValue(new Error('Missing plugin'));await expect(renderSourcePluginRecall(plan,plan.recipe,plan.operation,new AbortController().signal)).rejects.toThrow('Missing plugin');expect(pass).toHaveBeenCalledTimes(1);
});
it('replays mono DC removal after a source-rate effect without changing channel count',async()=>{
 const {recallFixture}=await import('../../fixtures/sourcePluginRecall');const f=recallFixture(44100,1),plugin=f.clip.sourceEdit!.operations[0].plugin!;f.clip.sourceEdit={sourceId:'original',offset:1200/44100,journal:{version:1,sampleRate:44100,channels:1},operations:[{type:'plugin',channel:0,ranges:[{start:0,end:4800}],targetDb:-1,plugin,window:{start:1200,frames:4800}},{type:'dc',channel:0,ranges:[{start:0,end:4800}],targetDb:-1,window:{start:1200,frames:4800}}]};const plan=sourcePluginRecallPlan(f.state,'clip'),prepared=await renderSourcePluginRecall(plan,plan.recipe,plan.operation,new AbortController().signal);expect(prepared.pcm).toHaveLength(1);expect(prepared.pcm[0]).toHaveLength(4800);expect(prepared.pcm[0].reduce((n,v)=>n+v,0)/4800).toBeCloseTo(0,7);expect(pass.mock.calls[0][0].sampleRate).toBe(44100);expect(pass.mock.calls[0][0].channels).toHaveLength(1);
});
it('preserves downstream channel swapping even when only one earlier effect channel is selected',async()=>{
 const f=replayFixture(),a={...f.operations[1],window:{start:1200,frames:6000},ranges:[{start:0,end:6000}]};f.clip.sourceEdit!.operations=[a,{type:'swap',channel:-1,ranges:[{start:0,end:4800}],targetDb:-1,window:{start:2400,frames:4800}}];const plan=sourcePluginRecallPlan(f.state,'clip'),prepared=await renderSourcePluginRecall(plan,{...plan.recipe,parameters:{gain:.75}},plan.operation,new AbortController().signal),raw=f.original.buffer.getChannelData(0);expect(prepared.pcm[0]).toEqual(f.original.buffer.getChannelData(1).subarray(2400,7200));for(let i=0;i<4800;i++)expect(prepared.pcm[1][i]).toBe(Math.fround(raw[2400+i]*.75+raw[2399+i]*.1));
});
it('normalizes the cropped combined signal after the edited effect',async()=>{
 const f=replayFixture(),a={...f.operations[1],window:{start:1200,frames:6000},ranges:[{start:0,end:6000}]};f.clip.sourceEdit!.operations=[a,{type:'normalize',channel:-1,ranges:[{start:0,end:4800}],targetDb:-3,window:{start:2400,frames:4800}}];const plan=sourcePluginRecallPlan(f.state,'clip'),prepared=await renderSourcePluginRecall(plan,plan.recipe,plan.operation,new AbortController().signal);let peak=0;for(const c of prepared.pcm)for(const v of c)peak=Math.max(peak,Math.abs(v));expect(peak).toBeCloseTo(10**(-3/20),7);expect(f.source.buffer.getChannelData(0)[0]).toBe(3);
});
it('checks cancellation between an initial synchronous utility and the first helper allocation',async()=>{
 const f=replayFixture(),plan=sourcePluginRecallPlan(f.state,'clip'),controller=new AbortController(),pending=renderSourcePluginRecall(plan,plan.recipe,plan.operation,controller.signal);controller.abort();await expect(pending).rejects.toThrow();expect(pass).not.toHaveBeenCalled();
});
