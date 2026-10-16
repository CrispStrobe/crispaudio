import {expect,it,vi} from 'vitest';
import {prepareRecordingBacking,playRecordingBacking,extendRecordingPasses} from '../../../src/audio/engine/RecordingBacking';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {TimelineEngine} from '../../../src/audio/engine/TimelineEngine';
import type {AudioSource} from '../../../src/types/audio';
const buffer={duration:2,numberOfChannels:2} as AudioBuffer;
const project=()=>({...useProjectStore.getInitialState().project,duration:2,nativeEffects:[{instanceId:'fx',pluginId:'vst3:test',format:'VST3' as const,name:'Test',enabled:true,bypass:false,parameters:{gain:.5},state:''}]});
it('freezes wet render inputs and closes live ownership before preparing input accompaniment',async()=>{
 const renderMixRange=vi.fn(async()=>buffer),closeNativeOwned=vi.fn(async()=>{}),engine={renderMixRange,closeNativeOwned} as unknown as TimelineEngine,p=project(),sources=new Map([['s',{id:'s',name:'Before'} as AudioSource]]);
 const prepared=prepareRecordingBacking(engine,{} as AudioContext,p,sources,new AbortController().signal);p.nativeEffects[0].parameters.gain=0;sources.get('s')!.name='After';await prepared;
 expect(closeNativeOwned).toHaveBeenCalledOnce();expect(renderMixRange.mock.calls[0][0].nativeEffects[0].parameters.gain).toBe(.5);expect(renderMixRange.mock.calls[0][4].get('s').name).toBe('Before');
});
it('cancels preparation before a late wet buffer can start playback',async()=>{const controller=new AbortController(),engine={closeNativeOwned:vi.fn(async()=>{controller.abort();}),renderMixRange:vi.fn()} as unknown as TimelineEngine;await expect(prepareRecordingBacking(engine,{} as AudioContext,project(),new Map(),controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(engine.renderMixRange).not.toHaveBeenCalled();});
it('uses the shared input clock and hardware source looping, never dry engine.play',()=>{const anchor={frame:1024,timeline:.25},engine={playRenderedPreview:vi.fn(),playbackAnchor:()=>anchor,play:vi.fn()} as unknown as TimelineEngine;expect(playRecordingBacking(engine,{} as AudioContext,buffer,.25,{start:.25,end:.5})).toBe(anchor);expect(engine.playRenderedPreview).toHaveBeenCalledWith(buffer,.25,.5,.25);expect(engine.play).not.toHaveBeenCalled();});
it('reconstructs every loop pass across a hidden or stalled UI and enforces the take budget',()=>{const passes=[{frame:1024,timeline:.25}];expect(extendRecordingPasses(passes,1024+48000,48000,{start:.25,end:.5})).toBe(false);expect(passes.map(p=>p.frame)).toEqual([1024,13024,25024,37024,49024]);expect(extendRecordingPasses(passes,1024+6000000,48000,{start:.25,end:.5})).toBe(true);expect(passes).toHaveLength(500);});
it('bounds preparation before allocating a long stereo backing buffer',async()=>{const engine={closeNativeOwned:vi.fn()} as unknown as TimelineEngine;await expect(prepareRecordingBacking(engine,{} as AudioContext,{...project(),duration:10000},new Map(),new AbortController().signal)).rejects.toThrow('recording.backingBudget');expect(engine.closeNativeOwned).not.toHaveBeenCalled();});
it('starts prepared backing before the loop and retains an exact scheduled anchor',()=>{
 const engine={playRenderedPreview:vi.fn(),playbackAnchor:()=>({frame:480000,timeline:0})} as unknown as TimelineEngine;
 expect(playRecordingBacking(engine,{} as AudioContext,buffer,0,{start:1,end:2},10)).toEqual({frame:480000,timeline:0});expect(engine.playRenderedPreview).toHaveBeenCalledWith(buffer,0,2,1,0,10);
});
it('reconstructs the first full pre-roll pass followed by shorter loop passes',()=>{
 const passes=[{frame:0,timeline:0}];expect(extendRecordingPasses(passes,48000*7.5,48000,{start:2,end:4})).toBe(false);
 expect(passes).toEqual([{frame:0,timeline:0},{frame:192000,timeline:2},{frame:288000,timeline:2}]);
});
