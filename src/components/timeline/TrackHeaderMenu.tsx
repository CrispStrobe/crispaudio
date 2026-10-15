import {useSettingsStore} from '../../stores/settingsStore';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal,flushSync} from 'react-dom';
import {Ellipsis} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {projectSelection,linkedIds} from '../../lib/projectEdits';
import {openTrackMenu,type MenuPoint} from '../../lib/trackHeaderMenu';
/** The same track actions are reachable through right-click, keyboard and touch. */
export function TrackHeaderMenu({trackId}:{trackId:string}){
 const {t}=useTranslation(),track=useProjectStore(s=>s.project.tracks.find(track=>track.id===trackId)),index=useProjectStore(s=>s.project.tracks.findIndex(track=>track.id===trackId)),count=useProjectStore(s=>s.project.tracks.length),recording=useUIStore(s=>s.timelineRecording),[point,setPoint]=useState<MenuPoint|null>(null),button=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),projectId=useRef(useProjectStore.getState().project.id);
 const waveformMode=useSettingsStore(s=>s.waveformMode);
 const close=()=>{setPoint(null);button.current?.focus();};
 useEffect(()=>{const show=(e:Event)=>{const p=(e as CustomEvent<MenuPoint>).detail;projectId.current=useProjectStore.getState().project.id;setPoint(p.trackId===trackId?p:null);};window.addEventListener('crispaudio-track-menu',show);const unsubscribe=useProjectStore.subscribe(state=>{if(state.project.id!==projectId.current)setPoint(null);});return()=>{window.removeEventListener('crispaudio-track-menu',show);unsubscribe();};},[trackId]);
 useLayoutEffect(()=>{if(!point||!panel.current)return;const p=panel.current,r=p.getBoundingClientRect();p.style.left=`${Math.max(8,Math.min(point.x,innerWidth-r.width-8))}px`;p.style.top=`${Math.max(8,Math.min(point.y,innerHeight-r.height-8))}px`;p.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();},[point]);
 useEffect(()=>{if(!point)return;const outside=(e:PointerEvent)=>{if(e.target instanceof Node&&!panel.current?.contains(e.target)&&!button.current?.contains(e.target))setPoint(null);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();setPoint(null);button.current?.focus();}};const scroll=(e:Event)=>{if(e.target instanceof Node&&panel.current?.contains(e.target))return;setPoint(null);};document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);document.addEventListener('scroll',scroll,true);window.addEventListener('resize',scroll);return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true);document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',scroll);};},[point]);
 if(!track)return null;
 const change=(action:'muted'|'solo'|'arm'|'lock'|'up'|'down'|'remove'|'select'|'recording')=>{
  const state=useProjectStore.getState(),current=state.project.tracks.find(t=>t.id===trackId);if(!current||state.project.id!==projectId.current||useUIStore.getState().timelineRecording)return;
  close();if(action==='lock'){state.updateTrack(trackId,{locked:!current.locked});return;}if(action==='up'||action==='down'){state.reorderTrack(trackId,state.project.tracks.indexOf(current)+(action==='up'?-1:1));return;}
  if(action==='select'){state.setSelection(projectSelection(state.project,linkedIds(state.project,current.segments.map(c=>c.id))));return;}
  if(action==='recording'){flushSync(()=>setPoint(null));window.dispatchEvent(new CustomEvent('crispaudio-recording',{detail:trackId}));return;}
  if(current.locked)return;
  if(action==='remove')state.removeTrack(trackId);else if(action==='arm')state.updateTrack(trackId,{recordArmed:!current.recordArmed});else state.updateTrack(trackId,{[action]:!current[action]});
 };
 const itemClass='w-full min-h-11 text-left px-3 py-2 hover:bg-gray-700 focus:bg-gray-700 disabled:opacity-30';
 return <><button ref={button} type="button" data-track-menu-button data-help="trackActions" className="track-more shrink-0 rounded text-gray-400 hover:text-white hover:bg-gray-700" aria-label={`${track.name}: ${t('timeline.trackActions')}`} title={t('timeline.trackActions')} aria-haspopup="menu" aria-expanded={!!point} onClick={()=>{if(point)close();else{const r=button.current!.getBoundingClientRect();openTrackMenu(trackId,r.left,r.bottom);}}}><Ellipsis size={16}/></button>{point&&createPortal(<div ref={panel} role="menu" aria-label={`${track.name}: ${t('timeline.trackActions')}`} className="fixed z-50 w-60 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-y-auto rounded border border-gray-600 bg-gray-800 shadow-xl py-1 text-sm" style={{left:point.x,top:point.y}} onKeyDown={e=>{const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],i=buttons.indexOf(document.activeElement as HTMLButtonElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}else if(e.key==='Tab')setPoint(null);}}>
  {(['muted','solo'] as const).map(key=><button role="menuitemcheckbox" aria-checked={track[key]} className={itemClass} disabled={recording||track.locked} key={key} onClick={()=>change(key)}>{t(key==='muted'?'timeline.mute':'timeline.solo')}{track[key]?' ✓':''}</button>)}
  {track.kind!=='bus'&&<><button role="menuitemcheckbox" aria-checked={track.recordArmed??false} className={itemClass} disabled={recording||track.locked} onClick={()=>change('arm')}>{t('recording.arm')}{track.recordArmed?' ✓':''}</button><button role="menuitem" className={itemClass} disabled={recording} onClick={()=>change('recording')}>{t('recording.settings')}</button></>}
  <button role="menuitem" className={itemClass} disabled={recording||!track.segments.length} onClick={()=>change('select')}>{t('timeline.selectTrackClips')}</button>
  <button role="menuitemcheckbox" aria-checked={(track.waveformMode??waveformMode)==='level'} className={itemClass} disabled={recording} onClick={()=>{useProjectStore.getState().updateTrack(trackId,{waveformMode:(track.waveformMode??waveformMode)==='level'?'normalized':'level'});close();}}>{t('timeline.waveformAtMixLevel')}{(track.waveformMode??waveformMode)==='level'?' ✓':''}</button>
  <hr className="border-gray-700 my-1"/>
  <button role="menuitem" className={itemClass} disabled={recording||index===0} onClick={()=>change('up')}>{t('timeline.moveTrackUp')}</button><button role="menuitem" className={itemClass} disabled={recording||index===count-1} onClick={()=>change('down')}>{t('timeline.moveTrackDown')}</button>
  <button role="menuitemcheckbox" aria-checked={track.locked??false} className={itemClass} disabled={recording} onClick={()=>change('lock')}>{t(track.locked?'ranges.unlock':'ranges.lock')}</button><button role="menuitem" className={`${itemClass} text-red-300`} disabled={recording||track.locked} onClick={()=>change('remove')}>{t('timeline.removeTrack')}</button>
 </div>,document.body)}</>;
}
