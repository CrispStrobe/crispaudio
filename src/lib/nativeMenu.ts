import {hasNativeEffects} from './nativeEffects';
export { isNativeMac } from './nativeMenuPlatform';
import { useUIStore } from '../stores/uiStore';
import { useSynthStore } from '../stores/synthStore';
import { useVoiceStore } from '../stores/voiceStore';
import { useProjectStore } from '../stores/projectStore';
import { timelineDuration } from './timelineView';
import i18n from '../i18n';
import {disabledTimelineTools} from '../hooks/useTimelineTool';

export const textEditing = () => document.activeElement instanceof HTMLElement&&!!document.activeElement.closest('textarea,[contenteditable="true"],input:not([type="range"]):not([type="checkbox"]):not([type="button"]):not([type="file"])');
export const menuBlocked = () => useUIStore.getState().activeModal!==null||!!document.querySelector('[role="dialog"]:not([aria-modal="false"]),[data-timeline-help="true"]');
const editActions=new Set(['source-editor','place-clips','trim-start-playhead','trim-end-playhead','previous-clip','next-clip','clip-above','clip-below','undo','redo','cut','copy','paste','delete','select-all','deselect','split','trim-tools','edit-groups','clip-settings','split-all','fades','blend','retime','range-tools','nudge-left','nudge-right']);
const timelineActions=new Set(['navigation-view','walkthroughs','review-export','mix-review','view-settings','track-folders','samples','track-settings','load-tracks','save-tracks','delivery','mixer','automation','waveform-mode','align','auto-sync','source-speech','tts','video-setup','open-session','export-video','detach-video','recover-media','multicam','musical-time','midi','clip-settings','split-all','fades','blend','retime','range-tools','nudge-left','nudge-right','nudge-settings','recording','new','open','save','import','export','export-range','commands','previous-edit','next-edit',...editActions,'add-track','zoom-in','zoom-out','fit','height-up','height-down','workspace','snap','play','stop','start','end','loop','range-mode','play-range','clear-range','help']);
type Handler=(action:string)=>void|Promise<void>;
let handler:Handler|undefined,pending:string|undefined,busy=false;
export const nativeMenuBusy=()=>busy;
const notify=()=>window.dispatchEvent(new Event('crispaudio-menu-state'));
async function run(action:string){
 if(!handler||busy||menuBlocked()||(editActions.has(action)&&action!=='deselect'&&action!=='source-editor'&&textEditing()))return;
 busy=true;notify();
 try{await handler(action);}catch(error){window.dispatchEvent(new CustomEvent('crispaudio-edit-error',{detail:String(error)}));}
 finally{busy=false;notify();}
}
/** File/view commands can arrive while the lazy timeline is mounting. */
export function registerTimelineMenu(next:Handler){
 handler=next;
 if(pending){const action=pending;pending=undefined;void run(action);}
 return()=>{if(handler===next)handler=undefined;};
}
export function dispatchNativeMenu(action:string){
 if(menuBlocked()||busy)return;
 const ui=useUIStore.getState();
 if(action==='settings'||action==='about'||action==='shortcuts'){ui.openModal(action);return;}
 if(action==='timeline'||action==='voice'||action==='sfx'){ui.setActivePanel(action);return;}
 if(!timelineActions.has(action))return;
 if((action==='undo'||action==='redo')&&ui.activePanel!=='timeline'&&!textEditing()){
  const history=ui.activePanel==='sfx'?useSynthStore.temporal.getState():useVoiceStore.temporal.getState();
  history[action]();if(ui.activePanel==='sfx')useSynthStore.getState().generate();return;
 }
 if(editActions.has(action)&&((action!=='deselect'&&action!=='source-editor'&&textEditing())||ui.activePanel!=='timeline'))return;
 if(handler&&ui.activePanel==='timeline')void run(action);
 else {pending=action;ui.setActivePanel('timeline');}
}
let labelsLanguage='',labels:Record<string,string>={};
export function nativeMenuContext(){
 if(labelsLanguage!==i18n.language){labelsLanguage=i18n.language;labels=i18n.t('nativeMenu',{returnObjects:true}) as Record<string,string>;}
 const state=useProjectStore.getState(),panel=useUIStore.getState().activePanel,history=panel==='sfx'?useSynthStore.temporal.getState():panel==='voice'?useVoiceStore.temporal.getState():useProjectStore.temporal.getState();
 return {
  language:i18n.language,labels:hasNativeEffects(state.project)?{...labels,'Play / Pause':i18n.t('nativePreview.menu')}:labels,disabledTools:disabledTimelineTools(),ready:true,timeline:useUIStore.getState().activePanel==='timeline',
  textEditing:textEditing(),blocked:menuBlocked()||busy,helpMode:!!document.querySelector('[data-timeline-help="true"]'),
  canUndo:history.pastStates.length>0,canRedo:history.futureStates.length>0,
  selection:!!state.selection?.segmentIds.length,anySelection:state.selection!==null,
  clipboard:!!(state.clipboard.segments.length||state.clipboard.videos?.length),
  editRange:!!state.project.editRange,rangeMode:state.selectionMode==='range',content:timelineDuration(state.project)>0,loopEnabled:state.loopEnabled,snapEnabled:state.snapEnabled,
 };
}
