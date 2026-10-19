import {nativeSourceOwner} from '../../../src/audio/engine/NativeSourceOwner';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {NativeSourceAudition,nativeSourcePlan} from '../../../src/audio/engine/NativeSourceAudition';
import type {NativeEffect,TimelineProject} from '../../../src/types/audio';
import type {NativePlaybackStatus} from '../../../src/audio/plugins/NativeTimelinePlayback';
const {create}=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('../../../src/audio/plugins/NativeTimelineSnapshot',()=>({NativeTimelineSnapshot:{create}}));
class BufferFixture {
 readonly data:Float32Array[];
 constructor(readonly options:AudioBufferOptions){this.data=Array.from({length:options.numberOfChannels??1},()=>new Float32Array(options.length));}
 get length(){return this.options.length;} get duration(){return this.length/this.sampleRate;} get sampleRate(){return this.options.sampleRate;} get numberOfChannels(){return this.data.length;}
 copyToChannel(values:Float32Array,ch:number){this.data[ch].set(values);} getChannelData(ch:number){return this.data[ch];}
}
const effect=():NativeEffect=>({instanceId:'effect',pluginId:'vst3:fixture',name:'Fixture',format:'VST3',enabled:true,bypass:false,parameters:{'100':.2},state:'saved-state'});
const input=()=>({channels:[new Float32Array(4800).fill(.2),new Float32Array(4800).fill(-.1)],sampleRate:48000,effect:effect()});
function session(){
 let status:NativePlaybackStatus={phase:'playing',frame:1024,clockTimeMs:0,renderedFrames:4096,callbacks:4,fault:0,peaks:[.2,.1],appliedRevision:0};
 const playback={status:vi.fn(async()=>status),update:vi.fn<(_:TimelineProject)=>Promise<number>>().mockResolvedValue(1)},snapshot={startPlayback:vi.fn(async()=>playback),close:vi.fn(async()=>{})};
 return {playback,snapshot,phase:(phase:NativePlaybackStatus['phase'])=>{status={...status,phase};}};
}
const owners:NativeSourceAudition[]=[];
function owner(){const events={change:vi.fn(),ended:vi.fn(),fault:vi.fn()},audio=new NativeSourceAudition(events);owners.push(audio);return {audio,events};}
beforeEach(()=>{create.mockReset();vi.stubGlobal('AudioBuffer',BufferFixture);});
afterEach(async()=>{await Promise.all(owners.splice(0).map(audio=>audio.stop()));vi.unstubAllGlobals();});
it('copies only supplied source-window PCM and an isolated effect, with no arrangement processing',()=>{
 const original=input(),plan=nativeSourcePlan(original,-6),source=[...plan.sources.values()][0];
 original.channels[0][0]=9;original.effect.parameters['100']=1;original.effect.state='changed';
 expect(source.buffer.getChannelData(0)[0]).toBeCloseTo(.2);expect(source.buffer.getChannelData(1)[0]).toBeCloseTo(-.1);
 expect(plan.project).toMatchObject({sampleRate:48000,duration:.1,masterVolume:10**(-6/20),masterEffects:[],outputLimiter:{enabled:false},nativeEffects:[{state:'saved-state',parameters:{'100':.2}}],tracks:[{volume:1,pan:0,segments:[{sourceOffset:0,duration:.1,gain:1,effects:[]}]}]});
 expect(source.filePath).toBeUndefined();expect(plan.estimatedBytes).toBe((4800+2)*2*4*5);
});
it.each([8000,44100,48000,96000,192000])('retains the source rate at %s and leaves resampling to the bounded snapshot uploader',rate=>{
 const f=input();f.sampleRate=rate;f.channels=[new Float32Array(rate)];const p=nativeSourcePlan(f);expect([...p.sources.values()][0].buffer.sampleRate).toBe(rate);expect(p.project.duration).toBe(1);expect([...p.sources.values()][0].buffer.numberOfChannels).toBe(2);
});
it('rejects unsupported PCM, rate, range, effect and monitor values before native ownership',()=>{
 const f=input();for(const channels of [[],[new Float32Array(1)], [...f.channels,f.channels[0]], [f.channels[0],new Float32Array(4801)], [new Float32Array(4800).fill(NaN)]])expect(()=>nativeSourcePlan({...f,channels})).toThrow();
 for(const sampleRate of [0,7999,192001,NaN,Infinity])expect(()=>nativeSourcePlan({...f,sampleRate})).toThrow();
 for(const level of [-61,.1,NaN,Infinity])expect(()=>nativeSourcePlan(f,level)).toThrow(/monitor/);
 for(const fx of [{...effect(),enabled:false},{...effect(),parameters:{bad:NaN}},{...effect(),parameterAutomation:{}},{...effect(),format:'AU' as const}])expect(()=>nativeSourcePlan({...f,effect:fx})).toThrow(/effect/);
 expect(create).not.toHaveBeenCalled();
});
it('admits the exact minimum clock window and rejects duration/memory extremes before buffer allocation',()=>{
 const f=input();expect(nativeSourcePlan({...f,channels:[new Float32Array(2048)]}).project.duration).toBe(2048/48000);
 const spy=vi.fn();vi.stubGlobal('AudioBuffer',spy);
 expect(()=>nativeSourcePlan({...f,channels:[new Float32Array(48000*121)]})).toThrow(/120 seconds/);
 expect(()=>nativeSourcePlan({...f,sampleRate:192000,channels:[new Float32Array(13500000)]})).toThrow(/memory/);expect(spy).not.toHaveBeenCalled();
});
it('keeps parameter, bypass and monitor edits on one native session and the native source clock',async()=>{
 const f=session();create.mockResolvedValue(f.snapshot);const {audio}=owner();await audio.play(input(),{loop:true,muted:true,levelDb:-3});
 expect(f.snapshot.startPlayback).toHaveBeenCalledWith({startFrame:0,endFrame:4800,cycle:true,loopStartFrame:0,muted:true});
 await audio.update({parameters:{'100':.7},bypass:true,levelDb:-12});
 expect(create).toHaveBeenCalledTimes(1);expect(f.playback.update).toHaveBeenLastCalledWith(expect.objectContaining({masterVolume:10**(-12/20),nativeEffects:[expect.objectContaining({state:'saved-state',parameters:{'100':.7},bypass:true})]}));
 expect(audio.position()).toBe(1024/48000);await audio.stop();await audio.stop();expect(f.snapshot.close).toHaveBeenCalledTimes(1);expect(audio.active).toBe(false);
});
it('cancels a pending upload, joins its close and never starts late audio',async()=>{
 const f=session();let release!:(value:typeof f.snapshot)=>void;create.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const {audio}=owner(),signal=new AbortController(),opening=audio.play(input(),{signal:signal.signal}),failure=expect(opening).rejects.toMatchObject({name:'AbortError'});
 await vi.waitFor(()=>expect(create).toHaveBeenCalledOnce());signal.abort();let closed=false;const stop=audio.stop().then(()=>{closed=true;});await Promise.resolve();expect(closed).toBe(false);
 release(f.snapshot);await failure;await stop;expect(f.snapshot.startPlayback).not.toHaveBeenCalled();expect(f.snapshot.close).toHaveBeenCalledOnce();
});
it('passes source/project validity through every upload boundary and rejects stale start',async()=>{
 const f=session();let current=true;create.mockImplementation(async(_p,_s,options)=>{expect(options.isCurrent()).toBe(true);current=false;expect(options.isCurrent()).toBe(false);return f.snapshot;});
 const {audio}=owner();await expect(audio.play(input(),{isCurrent:()=>current})).rejects.toMatchObject({name:'AbortError'});expect(f.snapshot.startPlayback).not.toHaveBeenCalled();expect(f.snapshot.close).toHaveBeenCalledOnce();
});
it('publishes edits made during preparation after the same session becomes ready',async()=>{
 const f=session();let release!:(value:typeof f.snapshot)=>void;create.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const {audio}=owner(),opening=audio.play(input());
 await vi.waitFor(()=>expect(create).toHaveBeenCalledOnce());await audio.update({parameters:{'100':.9},bypass:true,levelDb:-9});release(f.snapshot);await opening;
 expect(f.playback.update).toHaveBeenLastCalledWith(expect.objectContaining({masterVolume:10**(-9/20),nativeEffects:[expect.objectContaining({parameters:{'100':.9},bypass:true})]}));expect(create).toHaveBeenCalledOnce();
});
it('stops on output changes, releases listeners, and waits before reserving a replacement',async()=>{
 const a=session(),b=session();create.mockResolvedValueOnce(a.snapshot).mockResolvedValueOnce(b.snapshot);const {audio}=owner();await audio.play(input());window.dispatchEvent(new Event('crispaudio-output-changed'));await audio.stop();expect(a.snapshot.close).toHaveBeenCalledOnce();await audio.play(input());expect(audio.active).toBe(true);expect(b.snapshot.startPlayback).toHaveBeenCalledOnce();window.dispatchEvent(new Event('crispaudio-output-changed'));await audio.stop();expect(b.snapshot.close).toHaveBeenCalledOnce();
});
it('ends once, closes the output lease, and reports status faults without leaking playback',async()=>{
 const a=session(),b=session();create.mockResolvedValueOnce(a.snapshot).mockResolvedValueOnce(b.snapshot);const {audio,events}=owner();await audio.play(input());a.phase('ended');await audio.poll();await audio.poll();expect(events.ended).toHaveBeenCalledOnce();expect(a.snapshot.close).toHaveBeenCalledOnce();
 await audio.play(input());b.playback.status.mockRejectedValueOnce(new Error('clock lost'));await audio.poll();expect(events.fault).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({message:'clock lost'}));expect(audio.active).toBe(false);expect(b.snapshot.close).toHaveBeenCalledOnce();
});
it('rejects stale updates and validity changes, preserving a newer session on late failure',async()=>{
 const a=session(),b=session();create.mockResolvedValueOnce(a.snapshot).mockResolvedValueOnce(b.snapshot);const {audio}=owner();await audio.play(input());let fail!:(error:Error)=>void;a.playback.update.mockImplementationOnce(()=>new Promise((_,reject)=>{fail=reject;}));
 const update=audio.update({parameters:{'100':.3},bypass:false,levelDb:0}),failure=expect(update).rejects.toMatchObject({name:'AbortError'});const next=audio.play(input());fail(new Error('old update'));await failure;await next;expect(audio.active).toBe(true);expect(b.snapshot.close).not.toHaveBeenCalled();
});
it('stops an invalidated owner on polling and rejects invalid controls without native mutation',async()=>{
 const a=session();create.mockResolvedValue(a.snapshot);const {audio,events}=owner();let current=true;await audio.play(input(),{isCurrent:()=>current});current=false;await audio.poll();expect(audio.active).toBe(false);expect(events.fault).toHaveBeenCalledOnce();
 current=true;await audio.play(input());const count=a.playback.update.mock.calls.length;await expect(audio.update({parameters:{'100':NaN},bypass:false,levelDb:0})).rejects.toThrow();expect(a.playback.update).toHaveBeenCalledTimes(count);expect(audio.active).toBe(false);
});

it('duplicates mono into stereo before the timeline panner to preserve source audition unity',()=>{const channel=new Float32Array(4800).fill(.5),plan=nativeSourcePlan({...input(),channels:[channel]}),source=[...plan.sources.values()][0];expect(source.channels).toBe(2);expect(source.buffer.getChannelData(0)).toEqual(channel);expect(source.buffer.getChannelData(1)).toEqual(channel);expect(source.buffer.getChannelData(0)).not.toBe(source.buffer.getChannelData(1));expect(plan.estimatedBytes).toBe((4800+2)*2*4*5);});

it('rejects cross-rate native audition before allocation/upload while keeping offline plans rate-generic',async()=>{
 const {audio}=owner(),f=input();f.sampleRate=44100;const allocation=vi.fn();vi.stubGlobal('AudioBuffer',allocation);
 await expect(audio.play(f)).rejects.toThrow('requires 48 kHz');expect(allocation).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();expect(audio.active).toBe(false);
});

it('joins a source output before another source instance can upload or start',async()=>{
 const a=session(),b=session();let release!:()=>void;
 a.snapshot.close.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
 create.mockResolvedValueOnce(a.snapshot).mockResolvedValueOnce(b.snapshot);
 const first=owner().audio,second=owner().audio;await first.play(input());
 const opening=second.play(input());await vi.waitFor(()=>expect(a.snapshot.close).toHaveBeenCalledOnce());
 expect(first.active).toBe(false);expect(create).toHaveBeenCalledOnce();release();await opening;
 expect(create).toHaveBeenCalledTimes(2);expect(second.active).toBe(true);
});
it('revokes an uploading source and exposes its late cleanup to other consumers',async()=>{
 const f=session();let release!:(value:typeof f.snapshot)=>void;
 create.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 const audio=owner().audio,opening=audio.play(input()),failure=expect(opening).rejects.toMatchObject({name:'AbortError'});
 await vi.waitFor(()=>expect(create).toHaveBeenCalledOnce());
 let joined=false;const stopped=nativeSourceOwner.stop().then(()=>{joined=true;});await Promise.resolve();expect(joined).toBe(false);
 release(f.snapshot);await failure;await stopped;expect(f.snapshot.startPlayback).not.toHaveBeenCalled();expect(f.snapshot.close).toHaveBeenCalledOnce();
});
it('waits for prior output cleanup even when a replacement rate is rejected',async()=>{
 const f=session();let release!:()=>void;f.snapshot.close.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
 create.mockResolvedValue(f.snapshot);const audio=owner().audio;await audio.play(input());
 let rejected=false;const failure=audio.play({...input(),sampleRate:44100}).catch(error=>{rejected=true;expect(error.message).toContain('requires 48 kHz');});
 await vi.waitFor(()=>expect(f.snapshot.close).toHaveBeenCalledOnce());expect(rejected).toBe(false);release();await failure;expect(rejected).toBe(true);
});

it('adds monitor-only sample-peak protection on request while leaving render plans and original PCM unchanged',async()=>{
 const source=input(),plain=nativeSourcePlan(source),protectedPlan=nativeSourcePlan(source,-12,true);
 expect(plain.project.outputLimiter).toEqual({enabled:false});expect(protectedPlan.project.outputLimiter).toEqual({enabled:true,ceiling:-1,release:.1});expect(protectedPlan.project.masterVolume).toBeCloseTo(10**(-12/20));
 const f=session();create.mockResolvedValue(f.snapshot);const {audio}=owner();await audio.play(source,{protectOutput:true,levelDb:-12,muted:true});expect(create.mock.calls[0][0].outputLimiter).toEqual({enabled:true,ceiling:-1,release:.1});expect(source.channels[0][0]).toBeCloseTo(.2);expect(source.effect.parameters).toEqual({'100':.2});
});

it.each([false,true])('auditions whole mono with cycle=%s without changing source or saved effect state',async loop=>{
 const channel=new Float32Array(4800).fill(.25),original=channel.slice(),fx=effect(),f=session();create.mockResolvedValue(f.snapshot);
 const {audio}=owner();await audio.play({channels:[channel],sampleRate:48000,effect:fx},{loop,levelDb:-12,protectOutput:true,muted:true});
 const [project,sources]=create.mock.calls[0],source=[...sources.values()][0];
 expect(project.nativeEffects[0].state).toBe('saved-state');expect(source.buffer.numberOfChannels).toBe(2);
 expect(source.buffer.getChannelData(0)).toEqual(original);expect(source.buffer.getChannelData(1)).toEqual(original);
 expect(f.snapshot.startPlayback).toHaveBeenCalledWith({startFrame:0,endFrame:4800,cycle:loop,loopStartFrame:0,muted:true});
 await audio.update({parameters:{'100':.8},bypass:true,levelDb:0});await audio.stop();
 expect(channel).toEqual(original);expect(fx).toEqual(effect());expect(create).toHaveBeenCalledOnce();expect(f.snapshot.close).toHaveBeenCalledOnce();
});

it.each([false,true])('plays a selected interval with clip history, a relative cursor and cycle=%s',async loop=>{
 const f=session(),data=input(),range={start:1200,end:4000};
 f.playback.status.mockResolvedValue({phase:'playing',frame:2400,clockTimeMs:0,renderedFrames:4096,callbacks:4,fault:0,peaks:[.2,.1],appliedRevision:0});
 create.mockResolvedValue(f.snapshot);const {audio}=owner();await audio.play({...data,range},{loop,muted:true});
 const [project,sources]=create.mock.calls[0],source=[...sources.values()][0];
 expect(project.duration).toBe(.1);expect(project.tracks[0].segments[0].sourceOffset).toBe(0);
 expect(source.buffer.length).toBe(4800);expect(source.buffer.getChannelData(0)).toEqual(data.channels[0]);
 expect(f.snapshot.startPlayback).toHaveBeenCalledWith({startFrame:1200,endFrame:4000,cycle:loop,loopStartFrame:1200,muted:true});
 expect(audio.position()).toBeCloseTo(1200/48000);await audio.stop();expect(audio.position()).toBe(0);
 expect(data.channels[0]).toEqual(new Float32Array(4800).fill(.2));
});
it.each([{start:-1,end:4000},{start:1.5,end:4000},{start:1200,end:NaN},{start:1200,end:5000},{start:1200,end:1200},{start:1200,end:3247}])('refuses invalid or short selection %j before allocating or uploading',async range=>{
 const allocation=vi.fn();vi.stubGlobal('AudioBuffer',allocation);const audio=owner().audio;
 await expect(audio.play({...input(),range})).rejects.toThrow();expect(allocation).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();
});
it('admits the minimum selected window while reserving the full clip history memory',()=>{
 const full=nativeSourcePlan(input()),selected=nativeSourcePlan({...input(),range:{start:1200,end:3248}});
 expect(selected.estimatedBytes).toBe(full.estimatedBytes);expect(selected.start).toBe(1200/48000);expect(selected.end).toBe(3248/48000);expect(selected.project.duration).toBe(.1);
});
