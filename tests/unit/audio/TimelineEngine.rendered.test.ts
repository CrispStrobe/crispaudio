import {it,expect,vi} from 'vitest';
import {TimelineEngine} from '../../../src/audio/engine/TimelineEngine';
import {useProjectStore} from '../../../src/stores/projectStore';
function fixture(){
 const nodes:{kind:string;connect:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>;gain:{value:number;setTargetAtTime:ReturnType<typeof vi.fn>};start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>;onended?:()=>void}[]=[];
 const make=(kind:string)=>{const node={kind,connect:vi.fn(),disconnect:vi.fn(),gain:{value:1,setTargetAtTime:vi.fn()},start:vi.fn(),stop:vi.fn()};nodes.push(node);return node;};
 const ctx={currentTime:10,sampleRate:48000,createGain:()=>make('gain'),createBufferSource:()=>make('source'),createChannelSplitter:()=>make('split'),createAnalyser:()=>make('meter')},monitor=make('monitor'),engine=new TimelineEngine(ctx as unknown as AudioContext,monitor as unknown as GainNode);
 return {ctx,monitor,engine,nodes,buffer:{numberOfChannels:2,sampleRate:48000,duration:20,length:960000} as AudioBuffer};
}
it('plays the baked mix through the selected monitor path without applying the master twice',()=>{
 const {ctx,monitor,engine,nodes,buffer}=fixture();engine.playRenderedPreview(buffer,3,8);
 const source=nodes.find(node=>node.kind==='source')!,gain=nodes.find(node=>node.kind==='gain')!;
 expect(engine.monitorPlaybackClock()).toEqual({anchor:engine.playbackAnchor(),end:8,loop:undefined});const when=engine.playbackAnchor()!.frame/48000;expect(source.start).toHaveBeenCalledWith(when,3,5);expect(gain.connect).toHaveBeenCalledWith(monitor);expect(gain.gain.value).toBe(1);expect(engine.getMeter('master')).toHaveLength(2);expect(engine.getMeter('track')).toBeUndefined();
 engine.updateMix({...useProjectStore.getInitialState().project,masterVolume:.01});expect(gain.gain.setTargetAtTime).not.toHaveBeenCalled();
 ctx.currentTime=when+2;expect(engine.automationClock()?.time).toBe(5);engine.stop();expect(source.stop).toHaveBeenCalledOnce();expect(monitor.disconnect).not.toHaveBeenCalled();expect(engine.playbackAnchor()).toBeUndefined();expect(engine.monitorPlaybackClock()).toBeUndefined();
});
it('uses source-level looping and reports the wrapped audio clock after missed UI frames',()=>{
 const {ctx,engine,nodes,buffer}=fixture();engine.playRenderedPreview(buffer,4,7,3);const source=nodes.find(node=>node.kind==='source')!;
 expect(source).toMatchObject({loop:true,loopStart:3,loopEnd:7});expect(engine.monitorPlaybackClock()).toEqual({anchor:engine.playbackAnchor(),end:7,loop:{start:3,end:7}});const when=engine.playbackAnchor()!.frame/48000;expect(source.start).toHaveBeenCalledWith(when,4);
 ctx.currentTime=when+11.5;expect(engine.automationClock()?.time).toBe(3.5);expect(source.start).toHaveBeenCalledOnce();engine.stop();
});
it('plays a pre-roll intro once before hardware looping at the requested frame',()=>{
 const {ctx,engine,nodes,buffer}=fixture();engine.playRenderedPreview(buffer,0,7,3,0,12);const source=nodes.find(n=>n.kind==='source')!;
 expect(source.start).toHaveBeenCalledWith(12,0);expect(engine.playbackAnchor()).toEqual({frame:576000,timeline:0});
 ctx.currentTime=18;expect(engine.automationClock()?.time).toBe(6);ctx.currentTime=20;expect(engine.automationClock()?.time).toBe(4);engine.stop();
});
it('rejects a missed scheduled start instead of claiming an earlier recording clock',()=>{
 const {engine,buffer}=fixture();expect(()=>engine.playRenderedPreview(buffer,0,7,undefined,0,9)).toThrow('startMissed');
});
