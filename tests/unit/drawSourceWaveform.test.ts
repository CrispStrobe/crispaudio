import {afterEach,expect,it,vi} from 'vitest';
import {drawSourceWaveform} from '../../src/lib/drawSourceWaveform';
afterEach(()=>vi.restoreAllMocks());
function fixture(){
 const context=()=>({fillRect:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),stroke:vi.fn(),arc:vi.fn(),fill:vi.fn(),drawImage:vi.fn(),fillStyle:'',strokeStyle:''}),canvas=document.createElement('canvas'),visible=context(),backing=context();canvas.width=100;canvas.height=80;
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(function(this:HTMLCanvasElement){return (this===canvas?visible:backing) as unknown as CanvasRenderingContext2D;});return {canvas,visible,backing};
}
it('publishes one complete offscreen frame and preserves channel geometry and selection',async()=>{
 const h=fixture();await drawSourceWaveform(h.canvas,[Float32Array.from([0,.5,-.5,0])],{start:0,end:4},[{start:1,end:3}],true,new AbortController().signal);expect(h.visible.drawImage).toHaveBeenCalledExactlyOnceWith(expect.any(HTMLCanvasElement),0,0);expect(h.visible.fillRect).not.toHaveBeenCalled();expect(h.backing.fillRect).toHaveBeenCalledWith(25,0,50,80);expect(h.backing.lineTo).toHaveBeenCalledWith(25,22);expect(h.backing.strokeStyle).toBe('#fbbf24');
});
it('discards superseded drawing during a yielded frame without painting the visible canvas',async()=>{
 const h=fixture(),controller=new AbortController();let clock=0;vi.spyOn(performance,'now').mockImplementation(()=>clock+=10);const painting=drawSourceWaveform(h.canvas,[new Float32Array(1000)],{start:0,end:1000},[],false,controller.signal);controller.abort();await expect(painting).rejects.toMatchObject({name:'AbortError'});expect(h.visible.drawImage).not.toHaveBeenCalled();
});
