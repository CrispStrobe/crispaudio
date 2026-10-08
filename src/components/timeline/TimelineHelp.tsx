import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Inspect controls in place. Help gestures never edit the arrangement. */
export function TimelineHelp({open,onClose}:{open:boolean;onClose:()=>void}) {
  const {t}=useTranslation();
  const [target,setTarget]=useState<HTMLElement|null>(null);
  const card=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    const editor=document.querySelector<HTMLElement>('.timeline-editor');
    if(!editor)return;
    editor.dataset.timelineHelp='true';
    const find=(event:Event)=>event.target instanceof Element?event.target.closest<HTMLElement>('[data-help]'):null;
    const inspect=(event:Event)=>{const next=find(event);if(next&&editor.contains(next))setTarget(next);};
    const block=(event:Event)=>{
      if(!(event.target instanceof Element)||!editor.contains(event.target)||event.target.closest('[data-help-toggle]'))return;
      if(event.type==='keydown'&&(event as KeyboardEvent).key==='Tab')return;
      inspect(event);event.preventDefault();event.stopImmediatePropagation();
    };
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();onClose();}else block(event);};
    document.addEventListener('pointerover',inspect,true);
    document.addEventListener('focusin',inspect,true);
    for(const type of ['pointerdown','click','dblclick','contextmenu'])document.addEventListener(type,block,true);
    document.addEventListener('keydown',key,true);
    return()=>{
      delete editor.dataset.timelineHelp;
      document.removeEventListener('pointerover',inspect,true);
      document.removeEventListener('focusin',inspect,true);
      for(const type of ['pointerdown','click','dblclick','contextmenu'])document.removeEventListener(type,block,true);
      document.removeEventListener('keydown',key,true);
    };
  },[open,onClose]);
  useLayoutEffect(()=>{
    if(!open||!target)return;
    target.setAttribute('data-help-target','true');
    const place=()=>{
      if(!card.current||!target.isConnected)return;
      const anchor=target.getBoundingClientRect(),panel=card.current;
      const width=Math.min(300,window.innerWidth-24);
      panel.style.width=`${width}px`;
      panel.style.left=`${Math.max(12,Math.min(anchor.left,window.innerWidth-width-12))}px`;
      const height=panel.getBoundingClientRect().height;
      panel.style.top=`${Math.max(12,Math.min(anchor.bottom+10+height<=window.innerHeight-12?anchor.bottom+10:anchor.top-height-10,window.innerHeight-height-12))}px`;
    };
    place();const observer=new ResizeObserver(place);if(card.current)observer.observe(card.current);
    window.addEventListener('resize',place);document.addEventListener('scroll',place,true);
    return()=>{target.removeAttribute('data-help-target');observer.disconnect();window.removeEventListener('resize',place);document.removeEventListener('scroll',place,true);};
  },[open,target,t]);
  if(!open)return null;
  const topic=target?.dataset.help;
  return createPortal(<>
    <div className="timeline-help-status" role="status" data-help-chrome>
      <span>{t('usability.contextHelp')}</span>
      <button type="button" aria-label={t('usability.closeHelp')} title={t('usability.closeHelp')} onClick={onClose}><X size={18}/></button>
    </div>
    {target&&topic&&<div ref={card} role="note" aria-label={t(`usability.help_${topic}_title`)} className="timeline-help-card" data-help-chrome>
      <strong>{t(`usability.help_${topic}_title`)}</strong>
      <p>{t(`usability.help_${topic}`)}</p>
    </div>}
  </>,document.body);
}
