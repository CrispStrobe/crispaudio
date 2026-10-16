import {TimelineMetronome} from './TimelineMetronome';
import type {AudioSource,TimelineProject} from '../../types/audio';
import type {CapturePass} from '../../lib/capturedTakes';
import {hasNativeEffects} from '../../lib/nativeEffects';
import type {TimelineEngine} from './TimelineEngine';
/** Freeze the wet accompaniment before opening input. Playback and capture then
 * share the same Web Audio clock; accompaniment helpers finish before capture.
 * Optional buffered input cue inserts own separate sessions after preparation. */
export async function prepareRecordingBacking(engine:TimelineEngine,ctx:AudioContext,project:TimelineProject,sources:Map<string,AudioSource>,signal:AbortSignal){
 if(!hasNativeEffects(project))return;
 signal.throwIfAborted();const frozen=structuredClone(project),registry=new Map([...sources].map(([id,source])=>[id,{...source}]));
 // Bound the rendered stereo buffer plus render/crop intermediates.
 if(!Number.isFinite(frozen.duration)||frozen.duration<0||Math.ceil(frozen.duration*frozen.sampleRate)*8>128*1024*1024)throw new Error('recording.backingBudget');
 await engine.closeNativeOwned();signal.throwIfAborted();
 const buffer=frozen.duration>0?await engine.renderMixRange(frozen,0,frozen.duration,signal,registry):ctx.createBuffer(2,128,ctx.sampleRate);
 signal.throwIfAborted();return buffer;
}
export function playRecordingBacking(engine:TimelineEngine,ctx:AudioContext,buffer:AudioBuffer,start:number,loop?:{start:number;end:number},scheduledAt?:number){
 if(!Number.isFinite(start)||start<0)throw new Error('recording.rangeRequired');
 if(loop){if(scheduledAt===undefined)engine.playRenderedPreview(buffer,start,loop.end,loop.start);else engine.playRenderedPreview(buffer,start,loop.end,loop.start,0,scheduledAt);}
 else if(start<buffer.duration){if(scheduledAt===undefined)engine.playRenderedPreview(buffer,start);else engine.playRenderedPreview(buffer,start,buffer.duration,undefined,0,scheduledAt);}
 else {const silence=ctx.createBuffer(2,128,ctx.sampleRate);engine.playRenderedPreview(silence,0,silence.duration,undefined,start,scheduledAt);}
 const anchor=engine.playbackAnchor();if(!anchor)throw new Error('recording.notReady');return anchor;
}
/** Generate loop anchors from the hardware-buffer loop, including UI stalls.
 * Stop at the existing 500-pass budget instead of accumulating unbounded takes. */
export function extendRecordingPasses(passes:CapturePass[],frame:number,rate:number,range:{start:number;end:number}){
 const first=passes[0],duration=range.end-range.start;if(!first||!Number.isFinite(first.timeline)||first.timeline<0||first.timeline>=range.end||!Number.isFinite(frame)||!Number.isFinite(rate)||rate<=0||!Number.isFinite(duration)||duration<=0)throw new Error('recording.rangeRequired');
 const intro=range.end-first.timeline;
 const elapsed=(frame-first.frame)/rate;
 const completed=elapsed<intro?0:1+Math.max(0,Math.floor((elapsed-intro)/duration+1e-9)),count=Math.min(499,completed);
 for(let index=passes.length;index<=count;index++)passes.push({frame:first.frame+Math.round((intro+(index-1)*duration)*rate),timeline:range.start});
 return completed>=500;
}

/** A recording owns its click until capture stops, even after backing audio ends.
 * The monitor destination is separate from the microphone capture graph. */
export function startRecordingMetronome(ctx:AudioContext,destination:AudioNode,project:TimelineProject,anchor:CapturePass,range?:{start:number;end:number},loop=false){
 const music=project.music;if(!music?.metronome||music.clickLevel===0)return;
 const click=new TimelineMetronome(ctx,destination,music,anchor,range?.end??Infinity,loop?range:undefined);
 click.start();return click;
}
