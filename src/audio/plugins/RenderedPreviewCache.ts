import type {AudioSource,TimelineProject} from '../../types/audio';
/** Every rendered audio decision participates; view, picture and recording setup do not. */
export function renderedPreviewKey(project:TimelineProject):string{
 return JSON.stringify({id:project.id,sampleRate:project.sampleRate,duration:project.duration,masterVolume:project.masterVolume,masterEffects:project.masterEffects,nativeEffects:project.nativeEffects,outputLimiter:project.outputLimiter,
  music:project.music&&{tempo:project.music.tempo,numerator:project.music.numerator,denominator:project.music.denominator,origin:project.music.origin},
  tracks:project.tracks.map(track=>({...track,name:undefined,color:undefined,locked:undefined,waveformMode:undefined,recordArmed:undefined,recordingInput:undefined,takes:undefined,compRegions:undefined,compVersions:undefined,compBaseSegments:undefined,segments:track.segments.map(clip=>({...clip,name:undefined,color:undefined,locked:undefined}))}))});
}
const aborted=()=>new DOMException('Rendered preview cancelled','AbortError');
export function renderedSourcesMatch(a:Map<string,AudioSource>,b:Map<string,AudioSource>){return a.size===b.size&&[...a].every(([id,source])=>source.buffer===b.get(id)?.buffer);}
type Renderer=(project:TimelineProject,sources:Map<string,AudioSource>,signal:AbortSignal)=>Promise<AudioBuffer>;
/** One memory-only mix. Serial cancellation releases native helpers before another render starts. */
export class RenderedPreviewCache {
 private entry?:{key:string;sources:Map<string,AudioSource>;buffer:AudioBuffer};
 private controller?:AbortController;private generation=0;private tail:Promise<void>=Promise.resolve();
 private render?:Renderer;
 constructor(render?:Renderer){this.render=render;}
 get(project:TimelineProject,sources:Map<string,AudioSource>){const entry=this.entry;return entry&&entry.key===renderedPreviewKey(project)&&renderedSourcesMatch(entry.sources,sources)?entry.buffer:undefined;}
 invalidate(){this.generation++;this.controller?.abort(aborted());this.controller=undefined;this.entry=undefined;}
 async prepare(project:TimelineProject,sources:Map<string,AudioSource>,signal:AbortSignal,render=this.render){
  signal.throwIfAborted();const cached=this.get(project,sources);if(cached)return cached;
  if(!render)throw new Error('Rendered preview renderer unavailable');
  this.invalidate();const generation=this.generation,controller=new AbortController(),snapshot=structuredClone(project),registry=new Map([...sources].map(([id,source])=>[id,{...source}])),key=renderedPreviewKey(snapshot);
  this.controller=controller;const cancel=()=>controller.abort(signal.reason??aborted());signal.addEventListener('abort',cancel,{once:true});
  const previous=this.tail;
  const task=(async()=>{await previous.catch(()=>{});controller.signal.throwIfAborted();const buffer=await render(snapshot,registry,controller.signal);controller.signal.throwIfAborted();
   if(generation!==this.generation)throw aborted();
   if(buffer.numberOfChannels!==2||buffer.sampleRate!==snapshot.sampleRate||buffer.length!==Math.round(snapshot.duration*snapshot.sampleRate))throw new Error('Invalid rendered preview');
   this.entry={key,sources:registry,buffer};return buffer;
  })();this.tail=task.then(()=>{},()=>{});
  try{return await task;}finally{signal.removeEventListener('abort',cancel);if(this.controller===controller)this.controller=undefined;}
 }
}
