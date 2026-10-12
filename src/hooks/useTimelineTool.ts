import { useEffect, useRef, useSyncExternalStore } from 'react';

type ToolAction = () => void | Promise<void>;
const tools = new Map<string, { run: ToolAction; enabled: boolean }>();
const notify = () => window.dispatchEvent(new Event('crispaudio-menu-state'));
/** Keep tool controllers mounted; menu commands open their existing dialogs. */
export function useTimelineTool(action: string, handler: ToolAction, enabled = true) {
    const latest = useRef(handler);
    useEffect(() => { latest.current = handler; }, [handler]);
    useEffect(() => {
        const entry = { run: () => { if (enabled) return latest.current(); }, enabled };
        tools.set(action, entry); notify();
        return () => { if (tools.get(action) === entry) { tools.delete(action); notify(); } };
    }, [action, enabled]);
}
export async function runTimelineTool(action: string) { await tools.get(action)?.run(); }
export const disabledTimelineTools = () => [...tools].filter(([, tool]) => !tool.enabled).map(([action]) => action).sort();
const subscribe = (listener: () => void) => { window.addEventListener('crispaudio-menu-state', listener); return () => window.removeEventListener('crispaudio-menu-state', listener); };
export function useTimelineToolAvailability() { useSyncExternalStore(subscribe, () => disabledTimelineTools().join('|')); }
