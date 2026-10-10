import {useContext,useEffect,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {TimelineEngineContext} from './timelineEngineContext';
/** Poll DSP telemetry without rerendering the project or scheduling audio. */
export function GainReduction({scope,index}:{scope:string;index?:number}) {
  const {t}=useTranslation(),engine=useContext(TimelineEngineContext),value=useRef<HTMLOutputElement>(null),bar=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let frame=0;
    const tick=()=>{const reduction=engine?.current?.getReduction(scope,index)??0;
      if(value.current)value.current.textContent=`−${reduction.toFixed(1)} dB`;
      if(bar.current)bar.current.style.width=`${Math.min(100,reduction/24*100)}%`;
      frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[engine,scope,index]);
  return <div className="text-xs min-w-0" data-gain-reduction title={t('dynamics.reductionHelp')}>
    <div className="flex justify-between gap-2"><span>GR</span><output ref={value} aria-label={t('dynamics.reduction')}>−0.0 dB</output></div>
    <div className="h-1 bg-gray-800 rounded overflow-hidden mt-1"><div ref={bar} className="h-full bg-amber-400"/></div>
  </div>;
}
