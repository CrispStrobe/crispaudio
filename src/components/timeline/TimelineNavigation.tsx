import { CircleHelp } from 'lucide-react';
import { ToolButton } from '../common/ToolButton';
import { ProjectOverview } from './ProjectOverview';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { timelineDuration } from '../../lib/timelineView';
export function TimelineNavigation({ width }: { width: number }) {
  const { t } = useTranslation();
  const zoom = useProjectStore(s => s.zoomLevel), scroll = useProjectStore(s => s.scrollOffset);
  const duration = useProjectStore(s => timelineDuration(s.project));
  const ref = useRef<HTMLDivElement>(null);
  const max = Math.max(0, duration - width / zoom);
  useEffect(() => { if (ref.current) ref.current.scrollLeft = Math.min(scroll, max) * zoom; }, [scroll, max, zoom]);
  const move = (value: number) => useProjectStore.getState().setScrollOffset(Math.max(0, Math.min(max, value)));
  return <div data-help="navigation" className="timeline-navigation shrink-0 border-t border-gray-700 px-3 bg-gray-900">
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <button className="min-h-9 px-2" aria-label={t('editor.panLeft')} disabled={scroll <= 0} onClick={() => move(scroll - width / zoom * .8)}>◀</button>
      <ProjectOverview viewportWidth={width}/>
      <button className="min-h-9 px-2" aria-label={t('editor.panRight')} disabled={scroll >= max} onClick={() => move(scroll + width / zoom * .8)}>▶</button>
      <ToolButton icon={CircleHelp} label={t('editor.panHelp')}/>
    </div>
    <div ref={ref} hidden={!max} className="timeline-horizontal-scroll overflow-x-scroll" style={{ width, maxWidth: '100%', height: 16 }} aria-label={t('editor.scroll')}
      onScroll={e => { const value = e.currentTarget.scrollLeft / zoom; if (Math.abs(value - Math.min(scroll, max)) > .5 / zoom) move(value); }}>
      <div style={{ width: Math.max(width, duration * zoom), height: 1 }} />
    </div>
  </div>;
}
