import {it,expect,vi} from 'vitest';
import {TimelineMetronome} from '../../../src/audio/engine/TimelineMetronome';
import {DEFAULT_MUSIC} from '../../../src/lib/musicalTime';
function fixture(){
 let now=.34999;
 const gains:{disconnect:ReturnType<typeof vi.fn>}[]=[];
 const nodes:{start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>;onended:unknown}[]=[];
 const ctx={sampleRate:48000,get currentTime(){return now;},createOscillator(){const node={frequency:{value:0},start:vi.fn(),stop:vi.fn(),disconnect:vi.fn(),onended:null,connect:(gain:unknown)=>gain};nodes.push(node);return node;},createGain(){const gain={gain:{setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},disconnect:vi.fn(),connect:vi.fn()};gains.push(gain);return gain;}};
 const met=new TimelineMetronome(ctx as unknown as AudioContext,{} as AudioNode,DEFAULT_MUSIC,{frame:0,timeline:0},2);
 return {met,nodes,gains,time:(value:number)=>{now=value;}};
}
it('a beat just after one lookahead window is neither skipped nor scheduled twice',()=>{
 const {met,nodes,time}=fixture();met.pump();expect(nodes).toHaveLength(0);
 time(.35);met.pump();expect(nodes).toHaveLength(1);expect(nodes[0].start).toHaveBeenCalledWith(.5);
 time(.36);met.pump();expect(nodes).toHaveLength(1);met.stop();
});
it('stop disconnects both click nodes even when a suspended context cannot deliver ended',()=>{
 const {met,nodes,gains,time}=fixture();time(.35);met.pump();met.stop();
 expect(nodes[0].stop).toHaveBeenLastCalledWith();expect(nodes[0].disconnect).toHaveBeenCalledOnce();expect(gains[0].disconnect).toHaveBeenCalledOnce();expect(nodes[0].onended).toBeNull();
});
