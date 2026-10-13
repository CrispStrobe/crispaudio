import {useEffect,useLayoutEffect,useRef} from 'react';
import {createPortal,flushSync} from 'react-dom';
import {useTranslation} from 'react-i18next';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {timelineCommands} from '../../lib/timelineCommandCatalog';
import {disabledTimelineTools,useTimelineToolAvailability} from '../../hooks/useTimelineTool';
import {pictureLocked} from '../../lib/pictureComposition';
import {videoClips} from '../../lib/videoEditing';
const ids=['clip-settings','place-clips','trim-tools','trim-start-playhead','trim-end-playhead','fades','retime','edit-groups','split','copy','cut','delete'];
export function VideoClipMenu({point,onClose}:{point:{x:number;y:number;clipId:string;projectId:string;touchPointerId?:number}|null;onClose:()=>void}){
 useTimelineToolAvailability();
 const {t}=useTranslation(),panel=useRef<HTMLDivElement>(null),project=useProjectStore(s=>s.project),recording=useUIStore(s=>s.timelineRecording);
 useLayoutEffect(()=>{if(!point||!panel.current)return;const p=panel.current,r=p.getBoundingClientRect();p.style.left=`${Math.max(8,Math.min(point.x,innerWidth-r.width-8))}px`;p.style.top=`${Math.max(8,Math.min(point.y,innerHeight-r.height-8))}px`;p.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});},[point]);
 useEffect(()=>{if(!point)return;const outside=(e:PointerEvent)=>{if(e.target instanceof Node&&!panel.current?.contains(e.target))onClose();};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();onClose();}};const scroll=(e:Event)=>{if(e.target instanceof Node&&panel.current?.contains(e.target))return;onClose();};document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);document.addEventListener('scroll',scroll,true);window.addEventListener('resize',scroll);return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true);document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',scroll);};},[point,onClose]);
 const clip=point&&point.projectId===project.id?videoClips(project.video).find(c=>c.id===point.clipId):undefined;if(!clip||!point)return null;
 // The initiating long press can synthesize a click under the lifted finger.
 // Ignore that pointer only; the next tap can choose a command normally.
 const locked=pictureLocked(project.video,clip);
 return createPortal(<div ref={panel} role="menu" aria-label={t('editing.videoClipActions')} data-video-clip-menu className="fixed z-50 w-60 max-w-[calc(100vw-16px)] max-h-[70dvh] overflow-y-auto rounded border border-gray-600 bg-gray-800 shadow-xl py-1 text-sm" style={{left:point.x,top:point.y}} onClickCapture={e=>{if(point.touchPointerId!==undefined&&(e.nativeEvent as PointerEvent).pointerId===point.touchPointerId){e.preventDefault();e.stopPropagation();}}} onKeyDown={e=>{const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],i=buttons.indexOf(document.activeElement as HTMLButtonElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}else if(e.key==='Tab')onClose();}}>{ids.map(id=>{const command=Object.values(timelineCommands).flat().find(c=>c.id===id)!,readOnly=id==='clip-settings'||id==='copy';return <button key={id} type="button" role="menuitem" disabled={disabledTimelineTools().includes(id)||(recording||locked)&&!readOnly} className={`w-full min-h-11 text-left px-3 py-2 hover:bg-gray-700 focus:bg-gray-700 disabled:opacity-30 ${id==='delete'?'text-red-300':''}`} onClick={()=>{if(useProjectStore.getState().project.id!==point.projectId)return;flushSync(onClose);void import('../../lib/nativeMenu').then(({dispatchNativeMenu})=>{const state=useProjectStore.getState();if(state.project.id===point.projectId&&state.selection?.segmentIds.includes(point.clipId))dispatchNativeMenu(id);});}}>{t(`nativeMenu.${command.label}`,command.label)}</button>;})}</div>,document.body);
}
