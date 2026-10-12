import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {VideoSource} from '../../types/audio';
import {previewUrl} from '../../lib/previewCache';
import {pictureTracks} from '../../lib/pictureComposition';
import {placePictureSource,type PicturePlacement} from '../../lib/sourcePlacement';
import {useProjectStore} from '../../stores/projectStore';
import {NumberField} from './NumberField';
export function SourcePicturePreview({source}:{source:VideoSource}){
  const {t}=useTranslation(),video=useProjectStore(s=>s.project.video),[open,setOpen]=useState(false),[url,setUrl]=useState(''),[error,setError]=useState(''),[input,setInput]=useState(0),[output,setOutput]=useState(source.duration),[lane,setLane]=useState('picture'),ref=useRef<HTMLVideoElement>(null);
  useEffect(()=>{let active=true;if(open)void previewUrl(source.path).then(url=>{if(active)setUrl(url);}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[open,source.path]);
  const place=(mode:PicturePlacement)=>{try{const state=useProjectStore.getState();const next=placePictureSource(state.project,source,input,output,state.playheadPosition,lane,mode);useProjectStore.setState({project:next,isPlaying:false});setError('');}catch(e){setError(String(e));}};
  return <div className="space-y-2"><button className="timeline-tool" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{t('picture.sourcePreview')}</button>{open&&<>
    {url&&<video ref={ref} src={url} controls muted playsInline preload="metadata" className="w-full max-h-48 bg-black" onTimeUpdate={()=>{if(ref.current&&!ref.current.paused&&ref.current.currentTime>=output)ref.current.pause();}}/>}
    <div className="grid grid-cols-2 gap-2">{(['in','out'] as const).map(key=><label key={key} className="text-xs">{t(`picture.source${key==='in'?'In':'Out'}`)}<NumberField width="w-full" label={t(`picture.source${key==='in'?'In':'Out'}`)} step={1/(useProjectStore.getState().project.frameRate??25)} value={key==='in'?input:output} onCommit={v=>{if(v>source.duration||(key==='in'?v>=output:v<=input))return false;if(key==='in')setInput(v);else setOutput(v);return true;}}/><button className="timeline-tool" onClick={()=>{const time=ref.current?.currentTime??0;if(key==='in'&&time<output)setInput(time);if(key==='out'&&time>input)setOutput(time);}}>{t('picture.markSource')}</button></label>)}</div>
    <select className="bg-gray-800 min-h-11 w-full" aria-label={t('picture.track')} value={lane} onChange={e=>setLane(e.target.value)}>{pictureTracks(video).map(track=><option key={track.id} value={track.id} disabled={track.locked}>{track.name||t('video.track')}</option>)}</select>
    <div className="flex gap-2 flex-wrap">{(['insert','overwrite','append'] as const).map(mode=><button className="timeline-tool" key={mode} onClick={()=>place(mode)}>{t(`picture.${mode}`)}</button>)}</div>
    <p className="text-xs text-gray-400">{t('picture.silentPlacement')}</p>
  </>}{error&&<p role="alert" className="text-xs text-amber-300">{error}</p>}</div>;
}
