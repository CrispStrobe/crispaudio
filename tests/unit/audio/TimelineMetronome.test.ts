import {it,expect,vi} from 'vitest';
import {TimelineMetronome} from '../../../src/audio/engine/TimelineMetronome';
import {startRecordingMetronome} from '../../../src/audio/engine/RecordingBacking';
import {useProjectStore} from '../../../src/stores/projectStore';
import {DEFAULT_MUSIC} from '../../../src/lib/musicalTime';
function fixture(options:{anchor?:{frame:number;timeline:number};end?:number;loop?:{start:number;end:number};music?:typeof DEFAULT_MUSIC}={}){
 let now=.34999;
 const gains:{disconnect:ReturnType<typeof vi.fn>}[]=[];
 const nodes:{start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>;onended:unknown;frequency:{value:number}}[]=[];
 const ctx={sampleRate:48000,get currentTime(){return now;},createOscillator(){const node={frequency:{value:0},start:vi.fn(),stop:vi.fn(),disconnect:vi.fn(),onended:null,connect:(gain:unknown)=>gain};nodes.push(node);return node;},createGain(){const gain={gain:{setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},disconnect:vi.fn(),connect:vi.fn()};gains.push(gain);return gain;}};
 const met=new TimelineMetronome(ctx as unknown as AudioContext,{} as AudioNode,options.music??DEFAULT_MUSIC,options.anchor??{frame:0,timeline:0},options.end??2,options.loop);
 return {met,nodes,gains,ctx:ctx as unknown as AudioContext,time:(value:number)=>{now=value;}};
}
it('a beat just after one lookahead window is neither skipped nor scheduled twice',()=>{
 const {met,nodes,time}=fixture();met.pump();expect(nodes).toHaveLength(0);
 time(.35);met.pump();expect(nodes).toHaveLength(0);
 time(.35001);met.pump();expect(nodes).toHaveLength(1);expect(nodes[0].start).toHaveBeenCalledWith(.5);
 time(.36);met.pump();expect(nodes).toHaveLength(1);met.stop();
});
it('stop disconnects both click nodes even when a suspended context cannot deliver ended',()=>{
 const {met,nodes,gains,time}=fixture();time(.35001);met.pump();met.stop();
 expect(nodes[0].stop).toHaveBeenLastCalledWith();expect(nodes[0].disconnect).toHaveBeenCalledOnce();expect(gains[0].disconnect).toHaveBeenCalledOnce();expect(nodes[0].onended).toBeNull();
});

it('loops on the source clock with bar accents, including after missed UI frames',()=>{
 const {met,nodes,time}=fixture({anchor:{frame:0,timeline:.5},end:1,loop:{start:0,end:1}});
 for(const now of [0,.4,.9,1.4]){time(now);met.pump();}
 expect(nodes.map(node=>node.start.mock.calls[0][0])).toEqual([0,.5,1,1.5]);
 expect(nodes.map(node=>node.frequency.value)).toEqual([800,1200,800,1200]);
 time(100.4);met.pump();expect(nodes).toHaveLength(5);
 expect(nodes[4].start.mock.calls[0][0]).toBeCloseTo(100.5);met.stop();
});
it('does not double a beat at the loop boundary or accumulate fractional-loop drift',()=>{
 const {met,nodes,time}=fixture({anchor:{frame:0,timeline:.3},end:.9,loop:{start:.3,end:.9},music:{...DEFAULT_MUSIC,tempo:100,origin:.3}});
 time(0);met.pump();
 for(let i=1;i<=40;i++){time(i*.6-.1);met.pump();}
 expect(nodes).toHaveLength(41);
 nodes.forEach((node,i)=>expect(node.start.mock.calls[0][0]).toBeCloseTo(i*.6,8));met.stop();
});
it('truncates a click tail at a finite range end and omits the beat at that end',()=>{
 const {met,nodes,time}=fixture({end:.51});time(.4);met.pump();
 expect(nodes).toHaveLength(1);expect(nodes[0].stop.mock.calls[0][0]).toBeCloseTo(.51);
 time(.5);met.pump();expect(nodes).toHaveLength(1);met.stop();
 const exact=fixture({end:.5});exact.time(.4);exact.met.pump();expect(exact.nodes).toHaveLength(0);exact.met.stop();
});
it('cuts loop tails at the source boundary and bounds pathological loop density',()=>{
 const f=fixture({end:.51,loop:{start:0,end:.51}});f.time(.4);f.met.pump();
 expect(f.nodes[0].stop.mock.calls[0][0]).toBeCloseTo(.51);f.met.stop();
 const tiny=fixture({end:1/48000,loop:{start:0,end:1/48000}});tiny.time(0);tiny.met.pump();
 expect(tiny.nodes.length).toBeGreaterThan(0);expect(tiny.nodes.length).toBeLessThanOrEqual(128);tiny.met.stop();
});
it('start is idempotent and stop clears scheduled nodes and its timer',()=>{
 vi.useFakeTimers();try{
 const {met,nodes,time}=fixture();time(0);met.start();met.start();expect(vi.getTimerCount()).toBe(1);
 met.stop();expect(vi.getTimerCount()).toBe(0);expect(nodes.every(node=>node.onended===null)).toBe(true);
 }finally{vi.useRealTimers();}
});
it('rejects malformed source loops before creating audio nodes',()=>{
 for(const loop of [{start:1,end:1},{start:0,end:NaN},{start:-1,end:1}])
 expect(()=>fixture({loop})).toThrow('Invalid metronome loop');
});
it('keeps recording clicks running beyond the project/backing end on the capture anchor',()=>{
 vi.useFakeTimers();try{
 const f=fixture(),project={...useProjectStore.getInitialState().project,duration:2,music:{...DEFAULT_MUSIC,metronome:true}};
 f.time(.36);const click=startRecordingMetronome(f.ctx,{} as AudioNode,project,{frame:0,timeline:4})!;
 f.time(3.36);vi.advanceTimersByTime(25);
 expect(f.nodes).toHaveLength(2);expect(f.nodes[1].start.mock.calls[0][0]).toBeCloseTo(3.5);
 click.stop();expect(vi.getTimerCount()).toBe(0);expect(f.nodes.every(node=>node.onended===null)).toBe(true);
 }finally{vi.useRealTimers();}
});
it('recording punch clicks end at the punch boundary and native backing loops repeat autonomously',()=>{
 vi.useFakeTimers();try{
 const project={...useProjectStore.getInitialState().project,music:{...DEFAULT_MUSIC,metronome:true}};
 const punch=fixture();punch.time(.4);const click=startRecordingMetronome(punch.ctx,{} as AudioNode,project,{frame:0,timeline:0},{start:.2,end:.51})!;
 expect(punch.nodes[0].stop.mock.calls[0][0]).toBeCloseTo(.51);click.stop();
 const loop=fixture();loop.time(0);const repeat=startRecordingMetronome(loop.ctx,{} as AudioNode,project,{frame:0,timeline:.5},{start:0,end:1},true)!;
 loop.time(12.4);vi.advanceTimersByTime(25);expect(loop.nodes.at(-1)!.start.mock.calls[0][0]).toBeCloseTo(12.5);repeat.stop();
 expect(vi.getTimerCount()).toBe(0);
 }finally{vi.useRealTimers();}
});
it.each([undefined,{...DEFAULT_MUSIC,metronome:false},{...DEFAULT_MUSIC,metronome:true,clickLevel:0}])('does not create recording clicks for disabled settings',music=>{
 const f=fixture();expect(startRecordingMetronome(f.ctx,{} as AudioNode,{...useProjectStore.getInitialState().project,music},{frame:0,timeline:0})).toBeUndefined();expect(f.nodes).toHaveLength(0);
});

it('schedules a bounded count-in entirely ahead on the audio clock',()=>{
 vi.useFakeTimers();try{
 const f=fixture({anchor:{frame:48000,timeline:-2},end:0});f.time(0);f.met.start(3);
 expect(f.nodes.map(n=>n.start.mock.calls[0][0])).toEqual([1,1.5,2,2.5]);
 expect(f.nodes.map(n=>n.frequency.value)).toEqual([1200,800,800,800]);
 f.met.stop();expect(vi.getTimerCount()).toBe(0);expect(f.nodes.every(n=>n.disconnect.mock.calls.length===1)).toBe(true);
 }finally{vi.useRealTimers();}
});
it('plays an intro once before metronome loop boundaries',()=>{
 const f=fixture({anchor:{frame:0,timeline:0},end:1,loop:{start:.5,end:1}});
 for(const now of [0,.4,.9,1.4]){f.time(now);f.met.pump();}
 expect(f.nodes.map(n=>n.start.mock.calls[0][0])).toEqual([0,.5,1,1.5]);
 expect(f.nodes.map(n=>n.frequency.value)).toEqual([1200,800,800,800]);f.met.stop();
});
