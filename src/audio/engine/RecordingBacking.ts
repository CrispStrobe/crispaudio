import type {AudioSource,TimelineProject} from '../../types/audio';
import type {CapturePass} from '../../lib/capturedTakes';
import {hasNativeEffects} from '../../lib/nativeEffects';
import type {TimelineEngine} from './TimelineEngine';
/** Freeze the wet accompaniment before opening input. Playback and capture then
 * share the same Web Audio clock; native helpers never run on input deadlines. */
export async function prepareRecordingBacking(engine:TimelineEngine,ctx:AudioContext,project:TimelineProject,sources:Map<string,AudioSource>,signal:AbortSignal){
 if(!hasNativeEffects(project))return;
 signal.throwIfAborted();const frozen=structuredClone(project),registry=new Map([...sources].map(([id,source])=>[id,{...source}]));
 // Bound the rendered stereo buffer plus render/crop intermediates.
 if(!Number.isFinite(frozen.duration)||frozen.duration<0||Math.ceil(frozen.duration*frozen.sampleRate)*8>128*1024*1024)throw new Error('recording.backingBudget');
 await engine.closeNativeOwned();signal.throwIfAborted();
 const buffer=frozen.duration>0?await engine.renderMixRange(frozen,0,frozen.duration,signal,registry):ctx.createBuffer(2,128,ctx.sampleRate);
 signal.throwIfAborted();return buffer;
}
export function playRecordingBacking(engine:TimelineEngine,ctx:AudioContext,buffer:AudioBuffer,start:number,loop?:{start:number;end:number}){
 if(!Number.isFinite(start)||start<0)throw new Error('recording.rangeRequired');
 if(loop)engine.playRenderedPreview(buffer,start,loop.end,loop.start);
 else if(start<buffer.duration)engine.playRenderedPreview(buffer,start);
 else {const silence=ctx.createBuffer(2,128,ctx.sampleRate);engine.playRenderedPreview(silence,0,silence.duration,undefined,start);}
 const anchor=engine.playbackAnchor();if(!anchor)throw new Error('recording.notReady');return anchor;
}
/** Generate loop anchors from the hardware-buffer loop, including UI stalls.
 * Stop at the existing 500-pass budget instead of accumulating unbounded takes. */
export function extendRecordingPasses(passes:CapturePass[],frame:number,rate:number,range:{start:number;end:number}){
 const first=passes[0],duration=range.end-range.start;if(!first||!Number.isFinite(frame)||!Number.isFinite(rate)||rate<=0||!Number.isFinite(duration)||duration<=0)throw new Error('recording.rangeRequired');
 const completed=Math.max(0,Math.floor((frame-first.frame)/(duration*rate))),count=Math.min(499,completed);
 for(let index=passes.length;index<=count;index++)passes.push({frame:first.frame+Math.round(index*duration*rate),timeline:range.start});
 return completed>=500;
}
