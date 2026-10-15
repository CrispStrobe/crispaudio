import {useUIStore} from '../../stores/uiStore';
import {hasNativeEffects} from '../../lib/nativeEffects';
import {Scan} from 'lucide-react';
import {ToolButton} from '../common/ToolButton';
import {InfoButton} from '../common/InfoButton';
import {convertFileSrc} from '@tauri-apps/api/core';
import {drawTitle,graphicAsVideo} from '../../lib/graphics';
import type {GraphicClip} from '../../types/audio';
import {PictureHandles} from './PictureHandles';
import {drawPictureTransition} from '../../lib/videoCanvasPreview';
import {useEffect,useRef,useState,useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {useProjectStore} from '../../stores/projectStore';
import {activeVideoClips,videoClips,clipSource} from '../../lib/videoEditing';
import {pictureAt,pictureTrackId,pictureTracks} from '../../lib/pictureComposition';
import {clipOpacity} from '../../lib/videoPreview';
import {videoColorFilter} from '../../lib/videoColor';
import {previewUrl} from '../../lib/previewCache';
import {syncVideoElement} from '../../lib/videoTransport';
import type {VideoClip} from '../../types/audio';

function PictureDecoder({clip,register,onError}:{clip:VideoClip;register:(id:string,node:HTMLVideoElement|null)=>void;onError:(message:string)=>void}){
  const {t}=useTranslation();
  const path=useProjectStore(s=>clipSource(s.project.video,clip)?.path);
  const active=useProjectStore(s=>activeVideoClips(s.project.video,s.playheadPosition).some(c=>c.id===clip.id));
  const [resolved,setResolved]=useState<{path:string;url:string}>();
  const ref=useCallback((node:HTMLVideoElement|null)=>register(clip.id,node),[clip.id,register]);
  useEffect(()=>{let current=true;if(path&&active)void previewUrl(path).then(url=>{if(current)setResolved({path,url});}).catch(e=>onError(String(e)));return()=>{current=false;};},[path,active,onError]);
  if(!active)return null;
  if(!resolved||resolved.path!==path)return <span data-preview-loading="true"/>;
  return <video ref={ref} src={resolved.url} muted playsInline preload="auto" crossOrigin="anonymous" data-timeline-preview data-picture-decoder={clip.id} className="absolute w-px h-px opacity-0 pointer-events-none" aria-hidden="true" onError={()=>onError(t('video.previewError'))}/>;
}

function GraphicImage({clip,register,onError}:{clip:GraphicClip;register:(id:string,node:HTMLImageElement|null)=>void;onError:(message:string)=>void}){
  const ref=useCallback((node:HTMLImageElement|null)=>register(clip.id,node),[clip.id,register]);
  return <img ref={ref} crossOrigin="anonymous" src={'__TAURI_INTERNALS__' in window?convertFileSrc(clip.path!):clip.path} alt="" aria-hidden="true" className="absolute w-px h-px opacity-0 pointer-events-none" onError={()=>onError('Graphic image failed to load')}/>;
}
/** Each lane composes independently; normalized geometry is shared with native export. */
export function PictureLayers(){
  const {t}=useTranslation(),video=useProjectStore(s=>s.project.video);
  const time=useProjectStore(s=>s.playheadPosition);
  const images=useRef(new Map<string,HTMLImageElement>());
  const registerImage=useCallback((id:string,node:HTMLImageElement|null)=>{if(node)images.current.set(id,node);else images.current.delete(id);},[]);
  const canvas=useRef<HTMLCanvasElement>(null),decoders=useRef(new Map<string,HTMLVideoElement>());
  const [error,setError]=useState(''),[safe,setSafe]=useState(false);
  const register=useCallback((id:string,node:HTMLVideoElement|null)=>{if(node)decoders.current.set(id,node);else{decoders.current.get(id)?.pause();decoders.current.delete(id);}},[]);
  useEffect(()=>{
    const decoderMap=decoders.current;
    const imageMap=images.current;
    let frame=0;
    const scratch=document.createElement('canvas'),layer=document.createElement('canvas'),blend=document.createElement('canvas');
    const draw=()=>{
      frame=requestAnimationFrame(draw);
      const state=useProjectStore.getState(),video=state.project.video,target=canvas.current;
      if(!video||!target)return;
      const width=video.width??1920,height=video.height??1080;
      if(target.width!==width||target.height!==height){target.width=width;target.height=height;}
      const ctx=target.getContext('2d');if(!ctx)return;
      const active=activeVideoClips(video,state.playheadPosition);
      // Retain the previous complete frame while any visible decoder seeks.
      // Painting only ready lanes would flash the background during WebKit seeks.
      for(const clip of active){const element=decoders.current.get(clip.id);if(element)syncVideoElement(element,clip.sourceOffset+state.playheadPosition-clip.startTime,state.isPlaying&&(!hasNativeEffects(state.project)||useUIStore.getState().nativePreviewStatus==='playing'),setError);}
      if(active.some(clip=>{const element=decoders.current.get(clip.id);return !element||element.readyState<2||element.seeking;}))return;
      ctx.clearRect(0,0,width,height);ctx.fillStyle='black';ctx.fillRect(0,0,width,height);
      for(const track of pictureTracks(video).reverse()){
        const clips=active.filter(c=>pictureTrackId(c)===track.id);
        layer.width=width;layer.height=height;blend.width=width;blend.height=height;
        const layerContext=layer.getContext('2d');if(!layerContext)continue;
        for(const [index,clip] of clips.entries()){
          const element=decoders.current.get(clip.id);if(!element||element.readyState<2||element.error)continue;
          scratch.width=width;scratch.height=height;const ctx=scratch.getContext('2d');if(!ctx)continue;
          const value=pictureAt(clip,state.playheadPosition),orientation=clip.transform,rotated=(orientation?.rotation??0)%180!==0;
          const fit=Math.min(width/(rotated?element.videoHeight:element.videoWidth),height/(rotated?element.videoWidth:element.videoHeight));
          const local=state.playheadPosition-clip.startTime,p=clip.transitionDuration>0?Math.min(1,local/clip.transitionDuration):1;
          ctx.save();ctx.globalAlpha=value.opacity*clipOpacity(clip,state.playheadPosition);
          ctx.translate(width*(.5+value.x),height*(.5+value.y));ctx.rotate(value.rotation*Math.PI/180);ctx.scale(value.scale,value.scale);
          ctx.scale(orientation?.flipHorizontal?-1:1,orientation?.flipVertical?-1:1);ctx.rotate((orientation?.rotation??0)*Math.PI/180);
          ctx.filter=videoColorFilter(clip.colorCorrection)||'none';
          const crop=value.crop,sw=element.videoWidth,sh=element.videoHeight,left=crop.left*sw,top=crop.top*sh,cw=sw*(1-crop.left-crop.right),ch=sh*(1-crop.top-crop.bottom);
          ctx.drawImage(element,left,top,cw,ch,(-sw/2+left)*fit,(-sh/2+top)*fit,cw*fit,ch*fit);ctx.restore();
          if(index>0&&p<1){drawPictureTransition(blend,layer,scratch,clip.transition,p);layerContext.clearRect(0,0,width,height);layerContext.drawImage(blend,0,0);}else layerContext.drawImage(scratch,0,0);
        }
        ctx.drawImage(layer,0,0);
      }
      for(const track of [...(video.graphics??[])].reverse().filter(t=>t.visible))for(const clip of track.clips.filter(c=>c.startTime<=state.playheadPosition&&c.startTime+c.duration>state.playheadPosition)){
        const value=pictureAt(graphicAsVideo(clip),state.playheadPosition);
        ctx.save();ctx.translate(width*(.5+value.x),height*(.5+value.y));ctx.rotate(value.rotation*Math.PI/180);ctx.scale(value.scale,value.scale);ctx.globalAlpha=value.opacity;
        if(clip.type==='title'){ctx.translate(-width/2,-height/2);ctx.beginPath();ctx.rect(value.crop.left*width,value.crop.top*height,width*(1-value.crop.left-value.crop.right),height*(1-value.crop.top-value.crop.bottom));ctx.clip();drawTitle(ctx,clip.text!,clip.style!,width,height);}
        else {const image=imageMap.get(clip.id);if(image?.complete&&image.naturalWidth){const sw=image.naturalWidth,sh=image.naturalHeight,fit=Math.min(width/sw,height/sh),crop=value.crop,left=crop.left*sw,top=crop.top*sh,cw=sw*(1-crop.left-crop.right),ch=sh*(1-crop.top-crop.bottom);ctx.drawImage(image,left,top,cw,ch,(-sw/2+left)*fit,(-sh/2+top)*fit,cw*fit,ch*fit);}}
        ctx.restore();
      }
      const caption=video.captions;
      if(caption?.visible)for(const cue of caption.cues.filter(c=>c.start<=state.playheadPosition&&c.end>state.playheadPosition)){ctx.save();ctx.translate(0,height*.38);drawTitle(ctx,cue.text,caption.style,width,height);ctx.restore();}

    };
    frame=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(frame);for(const element of decoderMap.values())element.pause();};
  },[]);
  return <>
    <canvas ref={canvas} data-picture-composition className="absolute inset-0 w-full h-full object-contain" aria-label={t('interview.preview')}/>
    {videoClips(video).map(clip=><PictureDecoder key={clip.id} clip={clip} register={register} onError={setError}/>)}
    {(video?.graphics??[]).filter(t=>t.visible).flatMap(t=>t.clips).filter(c=>c.type==='image'&&c.startTime<=time&&c.startTime+c.duration>time).map(clip=><GraphicImage key={clip.id} clip={clip} register={registerImage} onError={setError}/>)}
    {safe&&<div data-safe-areas className="absolute pointer-events-none border border-dashed border-white/70" style={{inset:'5%'}}><div className="absolute border border-dashed border-white/50" style={{inset:'5.56%'}}/></div>}
    <div className="absolute top-0 right-0 flex items-center bg-black/50 rounded text-white z-30"><ToolButton icon={Scan} label={t('graphics.safeAreas')} aria-pressed={safe} onClick={()=>setSafe(v=>!v)}/><InfoButton label={t('graphics.safeAreasInfo')}><p>{t('graphics.safeAreasHelp')}</p></InfoButton></div>
    <PictureHandles/>
    {error&&<span role="alert" className="absolute bottom-0 text-xs bg-black text-amber-300">{error}</span>}
  </>;
}
