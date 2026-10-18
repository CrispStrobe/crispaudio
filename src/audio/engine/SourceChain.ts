import {validSourceChain,sourceChainTopology,type SourceChainRecipe,type SourceChainStage} from '../../lib/sourceChainRecipe';

export function sourceChainAtRate(recipe:SourceChainRecipe,rate:number):SourceChainRecipe {
 if(!validSourceChain(recipe)||!Number.isFinite(rate)||rate<8000||rate>192000)throw new Error('sourceChain.invalid');
 return {version:1,stages:recipe.stages.map(s=>({...s,value:s.kind==='highpass'||s.kind==='lowpass'?Math.min(s.value,rate*.49):s.value}))};
}
/** Static topology, smoothed live values/bypass, no lookahead or oversampling. Host stops before topology edits. */
export function createSourceChain(ctx:BaseAudioContext,output:AudioNode,recipe:SourceChainRecipe,bypass=false){
 const initial=sourceChainAtRate(recipe,ctx.sampleRate),nodes:AudioNode[]=[],own=<T extends AudioNode>(node:T)=>{nodes.push(node);return node;},input=own(ctx.createGain()),dry=own(ctx.createGain()),wet=own(ctx.createGain());
 try {
 input.connect(dry);dry.connect(output);wet.connect(output);dry.gain.value=bypass?1:0;wet.gain.value=bypass?0:1;
 let previous:AudioNode=input,closed=false;
 const stages=initial.stages.map(stage=>{
  const inlet=own(ctx.createGain()),outlet=own(ctx.createGain()),direct=own(ctx.createGain()),processed=own(ctx.createGain());
  previous.connect(inlet);inlet.connect(direct);direct.connect(outlet);processed.connect(outlet);direct.gain.value=stage.enabled?0:1;processed.gain.value=stage.enabled?1:0;
  let value:(s:SourceChainStage,smooth:boolean)=>void;
  const param=(p:AudioParam,v:number,smooth:boolean)=>{if(smooth)p.setTargetAtTime(v,ctx.currentTime,.01);else p.value=v;};
  if(stage.kind==='highpass'||stage.kind==='lowpass'){
   const filter=own(ctx.createBiquadFilter());filter.type=stage.kind;filter.Q.value=20*Math.log10(Math.SQRT1_2);inlet.connect(filter);filter.connect(processed);value=(s,smooth)=>param(filter.frequency,s.value,smooth);
  }else if(stage.kind==='gain'){
   const gain=own(ctx.createGain());inlet.connect(gain);gain.connect(processed);value=(s,smooth)=>param(gain.gain,10**(s.value/20),smooth);
  }else{
   const pre=own(ctx.createGain()),clip=own(ctx.createWaveShaper()),post=own(ctx.createGain());clip.curve=Float32Array.from([-1,1]);clip.oversample='none';inlet.connect(pre);pre.connect(clip);clip.connect(post);post.connect(processed);
   let envelope={at:ctx.currentTime,end:ctx.currentTime,from:1,to:1};
   value=(s,smooth)=>{
    const ceiling=10**(s.value/20),at=ctx.currentTime;
    if(!smooth){pre.gain.value=1/ceiling;post.gain.value=ceiling;envelope={at,end:at,from:ceiling,to:ceiling};return;}
    const fraction=envelope.end>envelope.at?Math.min(1,Math.max(0,(at-envelope.at)/(envelope.end-envelope.at))):1,held=envelope.from*(envelope.to/envelope.from)**fraction;
    // Reciprocal exponential ramps preserve unity below the ceiling, including rapid adjustments.
    for(const [p,from,to] of [[pre.gain,1/held,1/ceiling],[post.gain,held,ceiling]] as const){p.cancelScheduledValues(at);p.setValueAtTime(from,at);p.exponentialRampToValueAtTime(to,at+.01);}
    envelope={at,end:at+.01,from:held,to:ceiling};
   };
  }
  value(stage,false);previous=outlet;
  return (s:SourceChainStage)=>{value(s,true);direct.gain.setTargetAtTime(s.enabled?0:1,ctx.currentTime,.01);processed.gain.setTargetAtTime(s.enabled?1:0,ctx.currentTime,.01);};
 });
 previous.connect(wet);
 return {input,update:(next:SourceChainRecipe,original=false)=>{if(closed)return;const validated=sourceChainAtRate(next,ctx.sampleRate);if(sourceChainTopology(validated)!==sourceChainTopology(initial))throw new Error('sourceChain.topology');validated.stages.forEach((s,i)=>stages[i](s));dry.gain.setTargetAtTime(original?1:0,ctx.currentTime,.005);wet.gain.setTargetAtTime(original?0:1,ctx.currentTime,.005);},close:()=>{if(closed)return;closed=true;for(const node of nodes)node.disconnect();}};
 }catch(error){for(const node of nodes)node.disconnect();throw error;}
}
