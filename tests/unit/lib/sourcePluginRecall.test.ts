import {expect,it} from 'vitest';
import {sourcePluginRecallPlan,prepareSourcePluginRecall,sourcePluginRecallCommit,assertSourcePluginRecallCurrent} from '../../../src/lib/sourcePluginRecall';
import {recallFixture} from '../../fixtures/sourcePluginRecall';

it.each([[44100,1],[44100,2],[48000,2]])('recalls the complete %i Hz/%i-channel original window before a trimmed clip', (rate,channels)=>{
 const f=recallFixture(rate,channels),plan=sourcePluginRecallPlan(f.state,f.clip.id);expect(plan.frames).toBe(4800);expect(plan.visible).toEqual({start:1200,end:3600});expect(plan.input.sampleRate).toBe(rate);
 for(let ch=0;ch<channels;ch++)expect(plan.input.channels[ch]).toEqual(f.original.buffer.getChannelData(ch).subarray(1200,6000));
 expect(plan.input.channels[0]).not.toEqual(f.source.buffer.getChannelData(0));expect(plan.recipe.state).toBe('saved-base');expect(f.clip.sourceOffset).toBe(1200/rate);
});
it('replaces the recipe noncumulatively, preserves outside samples, timing, trimmed offsets and sibling sources',()=>{
 const f=recallFixture(),plan=sourcePluginRecallPlan(f.state,'clip'),processed=plan.input.channels.map(c=>Float32Array.from(c,v=>v*.25)),recipe={...plan.recipe,parameters:{gain:.25}},prepared=prepareSourcePluginRecall(plan,processed,recipe),buffer=f.make(4800);prepared.pcm.forEach((c,ch)=>buffer.copyToChannel(c,ch));
 const source={...f.source,id:'new',buffer},next=sourcePluginRecallCommit(plan,prepared,source,f.state),clip=next.project.tracks[0].segments[0];
 for(let ch=0;ch<2;ch++)for(let i=0;i<4800;i++)expect(buffer.getChannelData(ch)[i]).toBe(i>=400&&i<3000?processed[ch][i]:plan.input.channels[ch][i]);
 expect({...clip,sourceId:f.clip.sourceId,sourceEdit:f.clip.sourceEdit}).toEqual(f.clip);expect(clip.sourceEdit!.offset).toBe(f.clip.sourceEdit!.offset);expect(clip.sourceEdit!.operations).toHaveLength(1);expect(clip.sourceEdit!.operations[0].plugin!.parameters).toEqual({gain:.25});expect(next.project.tracks[0].segments[1].sourceId).toBe('edited');expect(next.sources.get('edited')).toBe(f.source);
 const again=sourcePluginRecallPlan(next,'clip');expect(again.input.channels).toEqual(plan.input.channels);expect(again.visible).toEqual(plan.visible);expect(prepareSourcePluginRecall(again,processed,recipe).pcm).toEqual(prepared.pcm);expect(f.clip.sourceEdit!.operations[0].plugin!.parameters).toEqual({gain:.5});
});
it('preserves saved individual-channel and disjoint sample ranges',()=>{
 const f=recallFixture();f.clip.sourceEdit!.operations[0].channel=1;f.clip.sourceEdit!.operations[0].ranges=[{start:0,end:3},{start:4790,end:4800}];const plan=sourcePluginRecallPlan(f.state,'clip'),processed=plan.input.channels.map(c=>Float32Array.from(c,()=>.75)),prepared=prepareSourcePluginRecall(plan,processed,plan.recipe);
 expect(prepared.pcm[0]).toEqual(plan.input.channels[0]);for(let i=0;i<4800;i++)expect(prepared.pcm[1][i]).toBe(i<3||i>=4790?.75:plan.input.channels[1][i]);
});
it('keeps split siblings independent and maps each visible window on the same processing history',()=>{
 const f=recallFixture();f.clip.sourceOffset=0;f.clip.duration=2400/48000;const right=f.state.project.tracks[0].segments[1];right.sourceOffset=2400/48000;right.duration=2400/48000;const leftPlan=sourcePluginRecallPlan(f.state,'clip'),rightPlan=sourcePluginRecallPlan(f.state,'sibling');expect(leftPlan.visible).toEqual({start:0,end:2400});expect(rightPlan.visible).toEqual({start:2400,end:4800});expect(rightPlan.input.channels).toEqual(leftPlan.input.channels);
});
it.each(['mixed','retime','missing','bounds','channel','rate','recipe','locked'])('refuses unsupported %s before preparing audio',kind=>{
 const f=recallFixture();if(kind==='mixed')f.clip.sourceEdit!.operations.push({...f.clip.sourceEdit!.operations[0],type:'invert',plugin:undefined});if(kind==='retime')f.clip.retime={} as NonNullable<typeof f.clip.retime>;if(kind==='missing')f.state.sources.delete('original');if(kind==='bounds')f.clip.sourceEdit!.offset=999;if(kind==='channel')f.clip.sourceEdit!.operations[0].channel=2;if(kind==='rate')f.original.sampleRate=96000;if(kind==='recipe')f.clip.sourceEdit!.operations[0].plugin!.parameters={gain:NaN};if(kind==='locked')Object.assign(f.state.project.tracks[0],{locked:true});expect(()=>sourcePluginRecallPlan(f.state,'clip')).toThrow('sourceRecall.');
});
it('rejects stale project/source/buffer identity and running arrangement',()=>{
 const f=recallFixture(),plan=sourcePluginRecallPlan(f.state,'clip');for(const changed of [{...f.state,project:{...f.state.project}},{...f.state,sources:new Map(f.state.sources)},{...f.state,isPlaying:true}])expect(()=>assertSourcePluginRecallCurrent(plan,changed)).toThrow('changed');
});
it('rejects a full processing window over the explicit PCM budget before rendering',()=>{
 const f=recallFixture(),pcm=[new Float32Array(4500000),new Float32Array(4500000)],buffer={length:4500000,sampleRate:48000,numberOfChannels:2,duration:4500000/48000,getChannelData:(ch:number)=>pcm[ch]} as AudioBuffer;
 f.original.buffer=buffer;f.source.buffer=buffer;f.clip.sourceEdit!.offset=0;expect(()=>sourcePluginRecallPlan(f.state,'clip')).toThrow('sourceRecall.limited');
});
it.each(['shape','nan','plugin','state'])('rejects invalid prepared %s without changing source or recipe',kind=>{
 const f=recallFixture(),plan=sourcePluginRecallPlan(f.state,'clip'),processed=plan.input.channels.map(c=>new Float32Array(c)),recipe={...plan.recipe};if(kind==='shape')processed.pop();if(kind==='nan')processed[0][0]=NaN;if(kind==='plugin')recipe.id='vst3:other';if(kind==='state')recipe.state=undefined as unknown as string;expect(()=>prepareSourcePluginRecall(plan,processed,recipe)).toThrow('format');expect(f.source.buffer.getChannelData(0)[0]).toBe(3);
});
it('edits channel/ranges from original PCM and persists the new mask for subsequent recall',()=>{
 const f=recallFixture(),plan=sourcePluginRecallPlan(f.state,'clip'),processed=plan.input.channels.map(c=>Float32Array.from(c,v=>v*.25));
 const prepared=prepareSourcePluginRecall(plan,processed,plan.recipe,{channel:1,ranges:[{start:3500,end:4600},{start:10,end:50},{start:40,end:60}]}),buffer=f.make(4800);prepared.pcm.forEach((c,ch)=>buffer.copyToChannel(c,ch));
 expect(prepared.selection).toEqual({channel:1,ranges:[{start:10,end:60},{start:3500,end:4600}]});expect(prepared.pcm[0]).toEqual(plan.input.channels[0]);
 for(let i=0;i<4800;i++)expect(prepared.pcm[1][i]).toBe((i>=10&&i<60)||(i>=3500&&i<4600)?processed[1][i]:plan.input.channels[1][i]);
 const next=sourcePluginRecallCommit(plan,prepared,{...f.source,id:'changed-mask',buffer},f.state),again=sourcePluginRecallPlan(next,'clip');expect(again.operation).toMatchObject(prepared.selection);expect(again.input.channels).toEqual(plan.input.channels);expect(again.visible).toEqual(plan.visible);expect(next.project.tracks[0].segments[1]).toBe(f.state.project.tracks[0].segments[1]);expect(plan.operation.channel).toBe(-1);expect(plan.operation.ranges).toEqual([{start:400,end:3000}]);
});
it.each([
 {channel:2,ranges:[{start:0,end:1}]},{channel:.5,ranges:[{start:0,end:1}]},{channel:-2,ranges:[{start:0,end:1}]},
 {channel:0,ranges:[]},{channel:0,ranges:[{start:-1,end:10}]},{channel:0,ranges:[{start:0,end:4801}]},
 {channel:0,ranges:[{start:10,end:10}]},{channel:0,ranges:[{start:1.5,end:10}]},{channel:0,ranges:[{start:0,end:NaN}]},
 {channel:0,ranges:Array.from({length:65},(_,i)=>({start:i*2,end:i*2+1}))},
])('rejects an invalid edited mask %j rather than clamping or processing other samples',selection=>{
 const f=recallFixture(),plan=sourcePluginRecallPlan(f.state,'clip');expect(()=>prepareSourcePluginRecall(plan,plan.input.channels,plan.recipe,selection)).toThrow('sourceRecall.bounds');expect(f.source.buffer.getChannelData(0)[0]).toBe(3);
});
