import { useTimelineToolAvailability } from '../../hooks/useTimelineTool';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import { OverflowMenu } from '../common/OverflowMenu';
import { dispatchNativeMenu, isNativeMac } from '../../lib/nativeMenu';
import { commandEnabled, timelineCommands } from '../../lib/timelineCommands';
import { useProjectStore } from '../../stores/projectStore';
export function TimelineCommandMenus() {
    const { t } = useTranslation();
    useTimelineToolAvailability();
    useProjectStore(s => s.project); useProjectStore(s => s.selection); useProjectStore(s => s.clipboard);
    useStore(useProjectStore.temporal, s => s.pastStates); useStore(useProjectStore.temporal, s => s.futureStates);
    if (isNativeMac()) return null;
    return <>{Object.entries(timelineCommands).map(([group, commands]) => <OverflowMenu key={group} label={t(`nativeMenu.${group}`)} text={t(`nativeMenu.${group}`)}>
        {commands.map(command => <button key={command.id} type="button" role="menuitem" disabled={!commandEnabled(command)} className="w-full min-h-11 px-2 text-sm text-left rounded hover:bg-gray-800 disabled:opacity-40" onClick={() => dispatchNativeMenu(command.id)}>{t(`nativeMenu.${command.label}`, command.label)}</button>)}
    </OverflowMenu>)}</>;
}
