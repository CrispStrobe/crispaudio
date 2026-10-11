import {AutomationRecorder} from './AutomationRecorder';
import {normalizeMixPoints,mixAt} from '../../lib/effectAutomation';
import {GainEnvelopePaste} from './GainEnvelopePaste';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Activity,CircleHelp,ClipboardPaste,Copy,Lock,Plus,Trash2,X} from 'lucide-react';
import {useProjectStore} from '../../stores/projectStore';
import {gainAt,normalizeGainPoints,panAt,normalizePanPoints} from '../../lib/mixAutomation';
import {snapClipStart} from '../../lib/timelineSnap';
import {timelineDuration} from '../../lib/timelineView';
import type {GainPoint,TimelineTrack} from '../../types/audio';
import {TRACK_HEADER_WIDTH} from '../../hooks/useTimeline';
import {NumberField} from './NumberField';
import {ToolButton} from '../common/ToolButton';

const H=112,TOP=10,BOTTOM=102;
const db=(value:number)=>value===0?-60:Math.max(-60,20*Math.log10(value));
const gainY=(value:number)=>TOP+(12-db(value))/72*(BOTTOM-TOP);
const gainValueAtY=(py:number)=>py>=BOTTOM?0:10**(Math.max(-60,Math.min(12,12-(py-TOP)/(BOTTOM-TOP)*72))/20);

/** A focused track lane on the shared timeline clock. Drag previews stay local,
 * so Escape/cancel/unmount never alter project history or discard redo. */
export function GainAutomationLane(props:{width:number;onClose:()=>void}) {
  const [parameter,setParameter]=useState<string>('gain'),[trackId,setTrackId]=useState('');
  return <AutomationLane key={parameter} {...props} parameter={parameter} onParameter={setParameter} trackId={trackId} onTrack={setTrackId}/>;
}
function AutomationLane({width,onClose,parameter,onParameter,trackId,onTrack}:{width:number;onClose:()=>void;parameter:string;onParameter:(p:string)=>void;trackId:string;onTrack:(id:string)=>void}) {
  const {t}=useTranslation();
  const isFx=parameter.startsWith('fx:'),effectIndex=Number(parameter.split(':')[1]),fxParameter=parameter.endsWith(':feedback')?'feedback':'mix',fxMax=fxParameter==='feedback'?.95:1;
  const fxGraph=fxParameter==='feedback'?'automation.feedbackGraph':'automation.mixGraph',fxHelp=fxParameter==='feedback'?'automation.feedbackHelp':'automation.mixHelp';
  const getPoints=(track:TimelineTrack|undefined)=>isFx?track?.effects?.[effectIndex]?.automation?.[fxParameter]:track?.[field];
  const patch=(points:GainPoint[],track:TimelineTrack)=>isFx?{effects:track.effects?.map((e,i)=>i===effectIndex?{...e,automation:{...e.automation,[fxParameter]:points}}:e)}:{[field]:points};
  const isPan=parameter==='pan',field=isPan?'panAutomation':'automation';
  const normalize=isFx?(points:GainPoint[]|undefined)=>normalizeMixPoints(points).filter(p=>p.value<=fxMax):isPan?normalizePanPoints:normalizeGainPoints,edit=(points:GainPoint[]|undefined,original:number|null,point:GainPoint)=>normalize([...(points??[]).filter(p=>p.time!==original&&p.time!==point.time),point]);
  const y=isFx?(value:number)=>TOP+(1-value/fxMax)*(BOTTOM-TOP):isPan?(value:number)=>TOP+(1-value)/2*(BOTTOM-TOP):gainY;
  const valueAtY=isFx?(py:number)=>Math.max(0,Math.min(fxMax,(1-(py-TOP)/(BOTTOM-TOP))*fxMax)):isPan?(py:number)=>Math.max(-1,Math.min(1,1-(py-TOP)/(BOTTOM-TOP)*2)):gainValueAtY;
  const at=(points:GainPoint[]|undefined,time:number)=>isFx?mixAt(points,time,Math.min(fxMax,track?.effects?.[effectIndex]?.params[fxParameter]??(fxParameter==='feedback'?.4:.3))):isPan?panAt(points,time,track?.pan??0):gainAt(points,time);
  const project=useProjectStore(s=>s.project),zoom=useProjectStore(s=>s.zoomLevel),scroll=useProjectStore(s=>s.scrollOffset);
  const [selected,setSelected]=useState<number|null>(null),[recording,setRecording]=useState(false);
  const [draft,setDraft]=useState<{project:typeof project;trackId:string;points:GainPoint[];time:number;originalTime:number|null}|null>(null);
  const track=project.tracks.find(track=>track.id===trackId)??project.tracks[0];
  const clipboard=useProjectStore(s=>isFx?s.effectClipboards[fxParameter]:isPan?s.panClipboard:s.gainClipboard);
  const [paste,setPaste]=useState<{project:typeof project;trackId:string;envelope:NonNullable<typeof clipboard>;effectIndex?:number}|null>(null);
  const svg=useRef<SVGSVGElement>(null);
  const gesture=useRef<{project:typeof project;trackId:string;time:number;originalTime:number|null;points:GainPoint[];pointer?:number}|null>(null);
  const onRecorderBusy=useCallback((busy:boolean)=>{if(busy){if(gesture.current)setSelected(gesture.current.originalTime);gesture.current=null;setDraft(null);}setRecording(busy);},[]);
  const displayed=draft?.project===project&&draft.trackId===track?.id?draft.points:normalize(getPoints(track));
  const duration=timelineDuration(project);
  const x=(time:number)=>(time-scroll)*zoom;
  const cancel=()=>{if(gesture.current)setSelected(gesture.current.originalTime);gesture.current=null;setDraft(null);};
  const finish=()=>{
    const current=gesture.current,focused=document.activeElement;
    gesture.current=null;setDraft(null);
    if(current&&current.pointer===undefined&&focused?.hasAttribute('data-gain-point'))requestAnimationFrame(()=>{
      if(!focused.isConnected&&document.activeElement===document.body){
        const point=[...(svg.current?.querySelectorAll<SVGGElement>('[data-gain-point]')??[])].find(p=>Number(p.dataset.time)===current.time);
        point?.focus();
      }
    });
    if(current&&useProjectStore.getState().project===current.project&&JSON.stringify(current.points)!==JSON.stringify(normalize(getPoints(current.project.tracks.find(t=>t.id===current.trackId))))){
      useProjectStore.getState().updateTrack(current.trackId,patch(current.points,current.project.tracks.find(t=>t.id===current.trackId)!));setSelected(current.time);
    }
  };
  useEffect(()=>{
    const cancel=()=>{if(gesture.current)setSelected(gesture.current.originalTime);gesture.current=null;setDraft(null);};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&gesture.current){event.preventDefault();event.stopPropagation();cancel();}};
    window.addEventListener('keydown',key,true);window.addEventListener('blur',cancel);
    return()=>{gesture.current=null;window.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);};
  },[]);
  if(!track)return null;
  if(isFx&&track.effects?.[effectIndex]?.type!=='delay')return <section data-gain-automation className="shrink-0 border-t border-gray-700 bg-gray-950 flex gap-1 p-1"><select aria-label={t('automation.parameter')} className="min-h-11 bg-gray-800" value="" onChange={e=>onParameter(e.target.value)}><option value="">{t('automation.missingEffect')}</option><option value="gain">{t('automation.gainLane')}</option><option value="pan">{t('automation.panLane')}</option>{(track.effects??[]).map((effect,index)=>effect.type==='delay'?['mix','feedback'].map(key=><option key={`${index}:${key}`} value={key==='mix'?`fx:${index}`:`fx:${index}:feedback`}>{index+1} · {t(key==='mix'?'automation.delayMix':'automation.delayFeedback')}</option>):null)}</select><ToolButton icon={X} label={t('common.close')} className="ml-auto" onClick={onClose}/></section>;
  const point=displayed.find(p=>p.time===selected);
  const write=(original:number|null,next:GainPoint)=>{
    if(recording||track.locked||!Number.isFinite(next.time)||next.time<0||next.time>duration||!Number.isFinite(next.value)||(isFx?(next.value<0||next.value>fxMax):isPan?(next.value< -1||next.value>1):next.value<0))return false;
    const points=edit(getPoints(track),original,next);
    if(JSON.stringify(points)!==JSON.stringify(normalize(getPoints(track))))useProjectStore.getState().updateTrack(track.id,patch(points,track));
    setSelected(next.time);return true;
  };
  const snap=(time:number,bypass=false)=>{
    const state=useProjectStore.getState(),grid=project.snapGrid??.1;
    if(state.snapEnabled&&!bypass){
      const targets=[0,duration,state.playheadPosition,...(project.markers??[]).map(m=>m.time),...track.segments.flatMap(c=>[c.startTime,c.startTime+c.duration])];
      const magnetic=snapClipStart(time,0,targets,zoom,true);
      time=targets.includes(magnetic)?magnetic:(grid?Math.round(time/grid)*grid:time);
    }
    return Math.max(0,Math.min(duration,time));
  };
  const updatePreview=(next:GainPoint)=>{
    const current=gesture.current;if(!current)return;
    current.points=edit(getPoints(current.project.tracks.find(t=>t.id===current.trackId)),current.originalTime,next);current.time=next.time;setDraft({...current});setSelected(next.time);
  };
  const times=[scroll,...displayed.filter(p=>p.time>scroll&&x(p.time)<width).map(p=>p.time),...Array.from({length:Math.ceil(width/4)},(_,i)=>scroll+i*4/zoom),scroll+width/zoom].sort((a,b)=>a-b);
  const path=times.map((time,i)=>`${i?'L':'M'}${x(time)},${y(at(displayed,time))}`).join(' ');
  return <><section data-gain-automation data-parameter={parameter} className="shrink-0 border-t border-gray-700 bg-gray-950 select-none" aria-label={t(isFx?fxGraph:isPan?'automation.panGraph':'automation.title')}>
    <div className="flex flex-wrap gap-1 items-center p-1 text-xs" onKeyDown={e=>e.stopPropagation()}>
      {track.locked&&<Lock size={16} className="text-amber-300" aria-label={t('ranges.lockedNotice',{name:track.name})}/>}
      <Activity size={16} className="text-amber-300"/>
      <select aria-label={t('automation.track')} className="min-h-11 bg-gray-800 rounded min-w-0 max-w-40" value={track.id} onChange={e=>{cancel();onTrack(e.target.value);setSelected(null);}}>{project.tracks.map(track=><option key={track.id} value={track.id}>{track.name}</option>)}</select>
      <select aria-label={t('automation.parameter')} className="min-h-11 bg-gray-800 rounded min-w-0 max-w-48" value={parameter} onChange={e=>onParameter(e.target.value)}><option value="gain">{t('automation.gainLane')}</option><option value="pan">{t('automation.panLane')}</option>{(track.effects??[]).map((effect,index)=>effect.type==='delay'?['mix','feedback'].map(key=><option key={`${index}:${key}`} value={key==='mix'?`fx:${index}`:`fx:${index}:feedback`}>{index+1} · {t(key==='mix'?'automation.delayMix':'automation.delayFeedback')}</option>):null)}</select>
      <ToolButton icon={Plus} label={t('automation.add')} disabled={recording||!!track.locked} onClick={()=>{const time=Math.min(duration,useProjectStore.getState().playheadPosition);write(null,{time,value:at(getPoints(track),time)});}}/>
      <ToolButton icon={Trash2} label={t('timeline.delete')} disabled={recording||!!track.locked||!point} onClick={()=>{useProjectStore.getState().updateTrack(track.id,patch(displayed.filter(p=>p.time!==selected),track));setSelected(null);}}/>
      {point&&<>
        <label className="flex items-center gap-1">s <NumberField key={`${track.id}:time:${selected}`} width="w-24" label={t('automation.time')} value={point.time} step={1/project.sampleRate} disabled={recording||!!track.locked} onCommit={time=>write(point.time,{...point,time})}/></label>
        {isFx?<label className="flex items-center gap-1">% <NumberField key={`${track.id}:mix:${selected}`} width="w-24" label={t(fxParameter==='feedback'?'automation.feedbackPoint':'automation.mixPoint')} value={point.value*100} min={0} step={1} disabled={recording||!!track.locked} onCommit={value=>write(point.time,{...point,value:value/100})}/></label>:isPan?<label className="flex items-center gap-1">L/R <NumberField key={`${track.id}:pan:${selected}`} width="w-24" label={t('automation.pan')} value={point.value} min={-1} step={.01} disabled={recording||!!track.locked} onCommit={value=>write(point.time,{...point,value})}/></label>:<label className="flex items-center gap-1">dB <NumberField key={`${track.id}:gain:${selected}`} width="w-24" label={t('automation.gain')} value={Number(db(point.value).toFixed(3))} min={-60} step={.1} disabled={recording||!!track.locked} onCommit={gain=>gain<=12&&write(point.time,{time:point.time,value:gain===-60?0:10**(gain/20)})}/></label>}
      </>}
      <ToolButton icon={Copy} label={t(isFx?(fxParameter==='feedback'?'automation.feedbackCopy':'automation.mixCopy'):isPan?'automation.panCopy':'automation.copy')} disabled={recording||duration<=0} onClick={()=>{cancel();if(isFx)useProjectStore.getState().copyEffectAutomation(track.id,effectIndex,fxParameter);else (isPan?useProjectStore.getState().copyPanAutomation:useProjectStore.getState().copyGainAutomation)(track.id);}}/>
      <ToolButton icon={ClipboardPaste} label={t(isFx?(fxParameter==='feedback'?'automation.feedbackPaste':'automation.mixPaste'):isPan?'automation.panPaste':'automation.paste')} disabled={recording||!!track.locked||!clipboard} onClick={()=>{cancel();if(clipboard)setPaste({project,trackId:track.id,envelope:clipboard,...(isFx?{effectIndex}:{})});}}/>
      <ToolButton icon={CircleHelp} label={t(isFx?fxHelp:isPan?'automation.panHelp':'automation.help')}/>
      <ToolButton icon={X} label={t('common.close')} className="ml-auto" onClick={onClose}/>
    </div>
    <div className="flex min-w-0">
      <div className="shrink-0 text-xs text-gray-400 relative" style={{width:TRACK_HEADER_WIDTH,height:H}} title={t(isFx?fxHelp:isPan?'automation.panHelp':'automation.help')}><span className="absolute left-2" style={{top:TOP-6}}>{isFx?`${fxMax*100}%`:isPan?'R +1':'+12 dB'}</span><span className="absolute left-2" style={{top:y(isFx ? fxMax/2 :isPan?0:1)-6}}>{isFx?`${fxMax*50}%`:isPan?'C 0':'0 dB'}</span><span className="absolute left-2 bottom-0">{isFx?'0%':isPan?'L −1':'−∞'}</span></div>
      <svg ref={svg} width={width} height={H} className="block min-w-0 flex-1 overflow-hidden" role="group" aria-label={t(isFx?fxGraph:isPan?'automation.panGraph':'automation.graph')} style={{touchAction:'none'}}
        onPointerDown={e=>{if(e.target!==e.currentTarget||recording||track.locked||e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
          const rect=e.currentTarget.getBoundingClientRect(),next={time:snap(scroll+(e.clientX-rect.left)/zoom,e.altKey),value:valueAtY(e.clientY-rect.top)};
          gesture.current={project,trackId:track.id,time:next.time,originalTime:null,points:displayed,pointer:e.pointerId};updatePreview(next);}}
        onPointerMove={e=>{const current=gesture.current;if(!current||current.pointer!==e.pointerId)return;const rect=e.currentTarget.getBoundingClientRect();updatePreview({time:snap(scroll+(e.clientX-rect.left)/zoom,e.altKey),value:valueAtY(e.clientY-rect.top)});}}
        onPointerUp={e=>{if(gesture.current?.pointer===e.pointerId)finish();}}
        onPointerCancel={cancel} onLostPointerCapture={()=>{if(gesture.current?.pointer!==undefined)cancel();}}
        onKeyDown={e=>e.stopPropagation()}>
        {(isFx?[0,.5,1]:isPan?[-1,0,1]:[0,1,10**(.6)]).map(value=><line key={value} x1={0} x2={width} y1={y(value)} y2={y(value)} stroke="#334155" pointerEvents="none"/>)}
        <path d={path} fill="none" stroke="#fbbf24" strokeWidth={2} pointerEvents="none"/>
        {displayed.filter(p=>x(p.time)>=0&&x(p.time)<=width).map(p=><g key={draft?.time===p.time?(draft.originalTime??'new'):p.time} data-gain-point data-time={p.time} tabIndex={0} role="button" aria-disabled={recording||!!track.locked} aria-label={`${t(isFx?(fxParameter==='feedback'?'automation.feedbackPoint':'automation.mixPoint'):isPan?'automation.panPoint':'automation.point')}: ${p.time.toFixed(3)} s, ${isFx?(p.value*100).toFixed(1)+'%':isPan?p.value.toFixed(3):(p.value===0?'−∞':db(p.value).toFixed(1)+' dB')}`}
          onFocus={()=>setSelected(p.time)}
          onPointerDown={e=>{if(recording||track.locked||e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.ownerSVGElement!.setPointerCapture(e.pointerId);gesture.current={project,trackId:track.id,time:p.time,originalTime:p.time,points:displayed,pointer:e.pointerId};setSelected(p.time);}}
          onKeyDown={e=>{
            e.stopPropagation();if(recording||track.locked)return;
            if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();useProjectStore.getState().updateTrack(track.id,patch(displayed.filter(q=>q.time!==p.time),track));setSelected(null);return;}
            if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
            if(!gesture.current)gesture.current={project,trackId:track.id,time:p.time,originalTime:p.time,points:displayed};
            const current=gesture.current.points.find(q=>q.time===gesture.current!.time)!;
            const step=(e.shiftKey?10:1)/project.sampleRate;
            updatePreview({time:Math.max(0,Math.min(duration,current.time+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0))),value:e.key==='ArrowUp'||e.key==='ArrowDown'?(isFx?Math.max(0,Math.min(fxMax,current.value+(e.key==='ArrowUp'?1:-1)*(e.shiftKey ? .1 : .01))):isPan?Math.max(-1,Math.min(1,current.value+(e.key==='ArrowUp'?1:-1)*(e.shiftKey ? .1 : .01))):valueAtY(y(current.value)+(e.key==='ArrowUp'?-1:1)*(e.shiftKey?1:.1)/72*(BOTTOM-TOP))):current.value});
          }} onKeyUp={e=>{if(e.key.startsWith('Arrow'))finish();}} onBlur={()=>{if(gesture.current?.pointer===undefined)cancel();}}>
          <circle cx={x(p.time)} cy={y(p.value)} r={22} fill="transparent"/>
          <circle cx={x(p.time)} cy={y(p.value)} r={8} stroke={p.time===selected?'white':'#fbbf24'} strokeWidth={2} fill="#92400e" pointerEvents="none"/>
        </g>) }
      </svg>
    </div>
  <AutomationRecorder key={track.id} target={{trackId:track.id,parameter:isFx?fxParameter:isPan?'pan':'gain',...(isFx?{effectIndex}:{})}} onBusy={onRecorderBusy}/>
  </section>{paste&&<GainEnvelopePaste {...paste} onClose={()=>setPaste(null)}/>}</>;
}
