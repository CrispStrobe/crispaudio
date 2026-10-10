import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {EffectConfig} from '../../types/audio';
import {eqParameters,eqResponse,isEQ} from '../../lib/equalizer';
import {projectHistoryGesture,useProjectStore} from '../../stores/projectStore';

const W=480,H=220,LEFT=40,RIGHT=465,TOP=16,BOTTOM=190;
export function EqualizerGraph({effects,onChange}:{effects:EffectConfig[];onChange:(effects:EffectConfig[])=>void}) {
  const {t}=useTranslation(),sampleRate=useProjectStore(s=>s.project.sampleRate);
  const [selected,setSelected]=useState<number|null>(null);
  const gesture=useRef(false),drag=useRef<number|null>(null);
  const latest=useRef(effects);
  useEffect(()=>{latest.current=effects;},[effects]);
  const maxFreq=Math.min(20000,sampleRate/2*.999),ratio=maxFreq/20;
  const lowerFreq=(type:string)=>type==='highpass'?10:20;
  const upperFreq=(type:string)=>Math.min(type==='lowpass'?22050:type==='highpass'?20000:22000,sampleRate/2);
  const x=(freq:number)=>LEFT+Math.log(Math.max(20,Math.min(maxFreq,freq))/20)/Math.log(ratio)*(RIGHT-LEFT);
  const y=(gain:number)=>TOP+(24-Math.max(-24,Math.min(24,gain)))/48*(BOTTOM-TOP);
  const finish=()=>{drag.current=null;if(gesture.current){gesture.current=false;projectHistoryGesture.end();}};
  useEffect(()=>{
    const finish=()=>{drag.current=null;if(gesture.current){gesture.current=false;projectHistoryGesture.end();}};
    window.addEventListener('pointerup',finish);window.addEventListener('blur',finish);
    return ()=>{finish();window.removeEventListener('pointerup',finish);window.removeEventListener('blur',finish);};
  },[]);
  const update=(index:number,patch:Record<string,number>)=>{
    const next=latest.current.map((e,i)=>i===index?{...e,params:{...e.params,...patch}}:e);
    latest.current=next;onChange(next);
  };
  const bands=effects.map((effect,index)=>({effect,index})).filter(({effect})=>isEQ(effect.type));
  if(!bands.length)return null;
  const frequencies=Array.from({length:240},(_,i)=>20*ratio**(i/239));
  const response=eqResponse(effects,frequencies,sampleRate);
  const path=response.map((gain,i)=>`${i?'L':'M'}${x(frequencies[i]).toFixed(2)},${y(gain).toFixed(2)}`).join(' ');
  const selectedBand=bands.find(b=>b.index===selected)??bands[0];
  return <details open className="rounded border border-gray-700 bg-gray-950" data-equalizer>
    <summary className="min-h-11 p-2 text-sm cursor-pointer">{t('eq.title')}</summary>
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full block select-none" role="group" aria-label={t('eq.graph')}>
      {[24,12,0,-12,-24].map(gain=><g key={gain}><line x1={LEFT} x2={RIGHT} y1={y(gain)} y2={y(gain)} stroke={gain===0?'#64748b':'#1f2937'}/><text x={LEFT-5} y={y(gain)+4} textAnchor="end" fill="#94a3b8" fontSize={11}>{gain}</text></g>)}
      {[20,100,1000,10000].filter(f=>f<=maxFreq).map(freq=><g key={freq}><line x1={x(freq)} x2={x(freq)} y1={TOP} y2={BOTTOM} stroke="#1f2937"/><text x={x(freq)} y={BOTTOM+18} textAnchor="middle" fill="#94a3b8" fontSize={11}>{freq>=1000?`${freq/1000}k`:freq}</text></g>)}
      <path d={path} fill="none" stroke="#a78bfa" strokeWidth={2} aria-hidden="true"/>
      {[...bands].sort((a,b)=>Number(a.index===selectedBand.index)-Number(b.index===selectedBand.index)).map(({effect,index})=>{
        const number=bands.findIndex(b=>b.index===index);
        if(!isEQ(effect.type))return null;
        const p=eqParameters(effect.type,effect.params,sampleRate),vertical=effect.type!=='lowpass'&&effect.type!=='highpass';
        return <g key={index} role="button" tabIndex={0} aria-disabled={!effect.enabled} aria-label={`${t(`timeline.effectNames.${effect.type}`)} ${number+1}: ${Math.round(p.freq)} Hz${vertical?`, ${p.gain.toFixed(1)} dB`:''}`} style={{touchAction:'none',cursor:effect.enabled?'grab':'default'}}
          onFocus={()=>setSelected(index)} onPointerDown={e=>{if(!effect.enabled||e.currentTarget.closest('fieldset[disabled]'))return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);drag.current=index;gesture.current=true;projectHistoryGesture.begin();setSelected(index);}}
          onPointerMove={e=>{if(drag.current!==index)return;const rect=e.currentTarget.ownerSVGElement!.getBoundingClientRect();const px=(e.clientX-rect.left)/rect.width*W,py=(e.clientY-rect.top)/rect.height*H;
            const freq=20*ratio**(Math.max(0,Math.min(1,(px-LEFT)/(RIGHT-LEFT))));const gain=Math.max(-24,Math.min(24,24-(py-TOP)/(BOTTOM-TOP)*48));update(index,{freq:Math.round(freq),...(vertical?{gain:Math.round(gain*10)/10}:{})});}}
          onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
          onKeyDown={e=>{if(!effect.enabled||e.currentTarget.closest('fieldset[disabled]'))return;const amount=e.shiftKey?5:1;let patch:Record<string,number>|undefined;
            if(e.key==='ArrowLeft'||e.key==='ArrowRight')patch={freq:Math.max(lowerFreq(effect.type),Math.min(upperFreq(effect.type),p.freq*2**((e.key==='ArrowLeft'?-1:1)*amount/48)))};
            if(vertical&&(e.key==='ArrowUp'||e.key==='ArrowDown'))patch={gain:Math.max(-24,Math.min(24,p.gain+(e.key==='ArrowUp'?1:-1)*amount*.1))};
            if(patch){e.preventDefault();e.stopPropagation();if(!gesture.current){gesture.current=true;projectHistoryGesture.begin();}update(index,patch);}}} onKeyUp={finish} onBlur={finish}>
          <circle cx={x(p.freq)} cy={y(vertical?p.gain:0)} r={40} fill="transparent"/>
          <circle cx={x(p.freq)} cy={y(vertical?p.gain:0)} r={9} fill={effect.enabled?'#7c3aed':'#374151'} stroke={selectedBand.index===index?'#f8fafc':'#a78bfa'} strokeWidth={2}/>
          <text x={x(p.freq)} y={y(vertical?p.gain:0)+4} fill="white" fontSize={11} textAnchor="middle" pointerEvents="none">{number+1}</text>
        </g>;
      })}
    </svg>
    <p className="px-2 text-xs text-gray-400">{t('eq.help')}</p>
    <div className="flex flex-wrap gap-1 p-2">{bands.map(({effect,index},number)=><button type="button" key={index} className={`min-h-11 px-2 rounded text-xs ${selectedBand.index===index?'bg-indigo-600':'bg-gray-800'}`} aria-pressed={selectedBand.index===index} onClick={()=>setSelected(index)}>{number+1} · {t(`timeline.effectNames.${effect.type}`)}</button>)}</div>
    <div className="flex flex-wrap gap-2 p-2 text-xs">
      {(['freq',...(['peaking','lowshelf','highshelf'].includes(selectedBand.effect.type)?['gain']:[]),...(selectedBand.effect.type==='peaking'?['q']:[])]).map(key=>{
        const p=eqParameters(selectedBand.effect.type as import('../../lib/equalizer').EQType,selectedBand.effect.params,sampleRate),value=key==='freq'?p.freq:key==='gain'?p.gain:p.q;
        return <label key={key}>{t(`eq.${key}`)}<input aria-label={t(`eq.${key}`)} className="block w-24 min-h-11 bg-gray-800 rounded p-2" type="number" min={key==='freq'?lowerFreq(selectedBand.effect.type):key==='gain'?-24:.1} max={key==='freq'?upperFreq(selectedBand.effect.type):key==='gain'?24:20} step={key==='freq'?1:.1} value={Number(value.toFixed(2))} disabled={!selectedBand.effect.enabled} onFocus={()=>{if(!gesture.current){gesture.current=true;projectHistoryGesture.begin();}}} onBlur={finish} onChange={e=>{const value=Number(e.target.value);if(e.target.value&&Number.isFinite(value))update(selectedBand.index,{[key]:Math.max(key==='freq'?lowerFreq(selectedBand.effect.type):key==='gain'?-24:.1,Math.min(key==='freq'?upperFreq(selectedBand.effect.type):key==='gain'?24:20,value))});}}/></label>;
      })}
    </div>
  </details>;
}
