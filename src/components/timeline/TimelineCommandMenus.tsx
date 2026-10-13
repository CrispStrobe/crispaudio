import {useState} from 'react';
import {ChevronUp} from 'lucide-react';
import {useSettingsStore} from '../../stores/settingsStore';
import {useTouchInterface} from '../../hooks/useTouchInterface';
import { useTimelineToolAvailability } from '../../hooks/useTimelineTool';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import { OverflowMenu } from '../common/OverflowMenu';
import { dispatchNativeMenu, isNativeMac } from '../../lib/nativeMenu';
import { commandEnabled, timelineCommands } from '../../lib/timelineCommands';
import { useProjectStore } from '../../stores/projectStore';
export function TimelineCommandMenus() {
    const { t } = useTranslation(),touch=useTouchInterface(),mode=useSettingsStore(s=>s.timelineRibbon),[tab,setTab]=useState<string|null>(null);
    const ribbon=mode==='always'||mode==='auto'&&touch;
    useTimelineToolAvailability();
    useProjectStore(s => s.project); useProjectStore(s => s.selection); useProjectStore(s => s.clipboard);
    useStore(useProjectStore.temporal, s => s.pastStates); useStore(useProjectStore.temporal, s => s.futureStates);
    if(ribbon)return <div data-touch-ribbon className="w-full min-w-0 shrink-0"><div role="tablist" aria-label={t('settings.timelineRibbon')} className="flex overflow-x-auto">{Object.keys(timelineCommands).map(group=><button key={group} type="button" role="tab" data-help-command={`menu:${group}`} aria-selected={tab===group} aria-controls="timeline-ribbon-panel" className={`min-h-11 px-3 text-sm shrink-0 border-b-2 ${tab===group?'border-indigo-400 text-indigo-300':'border-transparent text-gray-400'}`} onClick={()=>setTab(old=>old===group?null:group)}>{t(`nativeMenu.${group}`,group)}</button>)}{tab&&<button type="button" className="min-w-11 min-h-11 shrink-0" aria-label={t('ribbon.collapse')} onClick={()=>setTab(null)}><ChevronUp size={16}/></button>}</div>{tab&&<div id="timeline-ribbon-panel" role="tabpanel" aria-label={t(`nativeMenu.${tab}`,tab)} className="grid grid-flow-col grid-rows-2 auto-cols-[104px] gap-1 p-1 overflow-x-auto border-t border-gray-800">{timelineCommands[tab].map(command=><button key={command.id} type="button" data-ribbon-command={command.id} data-help-command={command.id} aria-label={t(`nativeMenu.${command.label}`,command.label)} title={t(`nativeMenu.${command.label}`,command.label)} disabled={!commandEnabled(command)} className="min-h-11 px-2 text-xs rounded bg-gray-800/50 hover:bg-gray-800 disabled:opacity-35" onClick={()=>{setTab(null);dispatchNativeMenu(command.id);}}>{t(`ribbon.${command.id}`,command.label.replace(/…$/,''))}</button>)}</div>}</div>;
    if (isNativeMac()) return null;
    return <div className="flex gap-1 shrink-0 overflow-x-auto px-2 border-b border-gray-800">{Object.entries(timelineCommands).map(([group, commands]) => <OverflowMenu key={group} label={t(`nativeMenu.${group}`)} text={t(`nativeMenu.${group}`)}>
        {commands.map(command => <button key={command.id} type="button" role="menuitem" data-help-command={command.id} disabled={!commandEnabled(command)} className="w-full min-h-11 px-2 text-sm text-left rounded hover:bg-gray-800 disabled:opacity-40" onClick={() => dispatchNativeMenu(command.id)}>{t(`nativeMenu.${command.label}`, command.label)}</button>)}
    </OverflowMenu>)}</div>;
}
