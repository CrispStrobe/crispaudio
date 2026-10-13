import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal,flushSync} from 'react-dom';
import {Ellipsis} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {pictureTracks,pictureTrackId,LEGACY_PICTURE_TRACK} from '../../lib/pictureComposition';
import {videoClips} from '../../lib/videoEditing';
import {linkedIds,projectSelection} from '../../lib/projectEdits';
import {timelineDuration} from '../../lib/timelineView';
import {openPictureTrackMenu,openPictureTrackSettings} from '../../lib/pictureTrackMenu';
import type {MenuPoint} from '../../lib/trackHeaderMenu';

export function PictureTrackMenu({trackId}:{trackId:string}){
 const {t}=useTranslation(),project=useProjectStore(s=>s.project),recording=useUIStore(s=>s.timelineRecording);
 const [point,setPoint]=useState<MenuPoint|null>(null),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),projectId=useRef(project.id);
 const tracks=pictureTracks(project.video),track=tracks.find(t=>t.id===trackId),index=tracks.findIndex(t=>t.id===trackId);
 const close=()=>{setPoint(null);trigger.current?.focus({preventScroll:true});};
 useEffect(()=>{
  const show=(e:Event)=>{const p=(e as CustomEvent<MenuPoint>).detail;projectId.current=useProjectStore.getState().project.id;setPoint(p.trackId===trackId?p:null);};
  window.addEventListener('crispaudio-picture-track-menu',show);
  const unsubscribe=useProjectStore.subscribe(s=>{if(s.project.id!==projectId.current)setPoint(null);});
  return()=>{window.removeEventListener('crispaudio-picture-track-menu',show);unsubscribe();};
 },[trackId]);
 useLayoutEffect(()=>{if(!point||!panel.current)return;const p=panel.current,r=p.getBoundingClientRect();p.style.left=`${Math.max(8,Math.min(point.x,innerWidth-r.width-8))}px`;p.style.top=`${Math.max(8,Math.min(point.y,innerHeight-r.height-8))}px`;p.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});},[point]);
 useEffect(()=>{
  if(!point)return;
  const outside=(e:PointerEvent)=>{if(e.target instanceof Node&&!panel.current?.contains(e.target)&&!trigger.current?.contains(e.target))setPoint(null);};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();setPoint(null);trigger.current?.focus({preventScroll:true});}};
  const scroll=(e:Event)=>{if(e.target instanceof Node&&panel.current?.contains(e.target))return;setPoint(null);};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);document.addEventListener('scroll',scroll,true);window.addEventListener('resize',scroll);
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true);document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',scroll);};
 },[point]);
 if(!track)return null;
 const locked=!!project.video?.locked||track.locked;
 const change=(action:'visible'|'locked'|'rippleEnabled'|'up'|'down'|'select'|'settings'|'remove')=>{
  const state=useProjectStore.getState(),video=state.project.video,current=pictureTracks(video),target=current.find(t=>t.id===trackId);
  if(!video||!target||state.project.id!==projectId.current)return;
  if(action==='settings'){flushSync(close);openPictureTrackSettings();return;}
  if(useUIStore.getState().timelineRecording)return;
  close();
  const clips=videoClips(video).filter(c=>pictureTrackId(c)===trackId);
  if(action==='select'){state.setSelection(projectSelection(state.project,linkedIds(state.project,clips.map(c=>c.id))));return;}
  if(action==='up'||action==='down'){
   const i=current.indexOf(target),j=i+(action==='up'?-1:1);if(j<0||j>=current.length)return;
   [current[i],current[j]]=[current[j],current[i]];
   useProjectStore.setState({project:{...state.project,video:{...video,tracks:current}}});return;
  }
  if(action!=='locked'&&(video.locked||target.locked))return;
  if(action==='remove'){
   if(trackId===LEGACY_PICTURE_TRACK)return;
   const links=new Set(clips.map(c=>c.linkGroup).filter(Boolean));
   const next={...state.project,video:{...video,tracks:current.filter(t=>t.id!==trackId),clips:videoClips(video).filter(c=>pictureTrackId(c)!==trackId)},tracks:state.project.tracks.map(t=>({...t,segments:t.segments.map(c=>c.linkGroup&&links.has(c.linkGroup)?{...c,linkGroup:undefined}:c)}))};
   useProjectStore.setState({project:{...next,duration:timelineDuration(next)},selection:null,isPlaying:false});return;
  }
  if(video.locked&&action==='locked')return;
  useProjectStore.setState({project:{...state.project,video:{...video,tracks:current.map(t=>t.id===trackId?{...t,[action]:!t[action]}:t)}}});
 };
 const item='w-full min-h-11 text-left px-3 py-2 hover:bg-gray-700 focus:bg-gray-700 disabled:opacity-30',name=track.name||t('video.track');
 return <><button ref={trigger} type="button" data-picture-menu-button data-help="pictureTrackActions" className="track-more shrink-0 rounded text-gray-400 hover:text-white hover:bg-gray-700" aria-label={`${name}: ${t('timeline.trackActions')}`} aria-haspopup="menu" aria-expanded={!!point} onClick={()=>{if(point)close();else{const r=trigger.current!.getBoundingClientRect();openPictureTrackMenu(trackId,r.left,r.bottom);}}}><Ellipsis size={16}/></button>{point&&createPortal(<div ref={panel} data-picture-track-menu role="menu" aria-label={`${name}: ${t('timeline.trackActions')}`} className="fixed z-50 w-60 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-y-auto rounded border border-gray-600 bg-gray-800 shadow-xl py-1 text-sm" style={{left:point.x,top:point.y}} onKeyDown={e=>{const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],i=buttons.indexOf(document.activeElement as HTMLButtonElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}else if(e.key==='Tab')setPoint(null);}}>
  {(['visible','locked','rippleEnabled'] as const).map(key=><button key={key} role="menuitemcheckbox" aria-checked={track[key]} disabled={recording||!!project.video?.locked||(key!=='locked'&&locked)} className={item} onClick={()=>change(key)}>{t(`picture.${key}`)}{track[key]?' ✓':''}</button>)}
  <button role="menuitem" className={item} disabled={recording||!videoClips(project.video).some(c=>pictureTrackId(c)===trackId)} onClick={()=>change('select')}>{t('timeline.selectTrackClips')}</button>
  <button role="menuitem" className={item} disabled={recording||index===0} onClick={()=>change('up')}>{t('timeline.moveTrackUp')}</button>
  <button role="menuitem" className={item} disabled={recording||index===tracks.length-1} onClick={()=>change('down')}>{t('timeline.moveTrackDown')}</button>
  <button role="menuitem" className={item} onClick={()=>change('settings')}>{t('picture.tracks')}…</button>
  <button role="menuitem" className={`${item} text-red-300`} disabled={recording||locked||trackId===LEGACY_PICTURE_TRACK} onClick={()=>change('remove')}>{t('picture.removeTrack')}</button>
 </div>,document.body)}</>;
}
