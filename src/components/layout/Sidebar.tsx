// ---------------------------------------------------------------------------
// CrispAudio — Sidebar
// Vertical icon+label nav. Active panel highlighted with accent tint.
// ---------------------------------------------------------------------------

import { Music2, Mic, LayoutList, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore, type ActivePanel } from '../../stores/uiStore';

interface NavItem {
  panel: ActivePanel;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  labelKey: string;
}

const NAV_ITEMS: NavItem[] = [
  { panel: 'sfx', icon: Music2, labelKey: 'nav.sfx' },
  { panel: 'voice', icon: Mic, labelKey: 'nav.voice' },
  { panel: 'timeline', icon: LayoutList, labelKey: 'nav.timeline' },
];

export function Sidebar() {
  const { t } = useTranslation();
  const { activePanel, setActivePanel, openModal } = useUIStore();

  return (
    <aside
      className="flex flex-col items-center py-4 gap-1"
      style={{
        width: 72,
        minWidth: 72,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-subtle)',
        height: '100%',
      }}
    >
      {/* Logo mark */}
      <div
        className="flex items-center justify-center mb-5"
        style={{ width: 36, height: 36 }}
        title="CrispAudio"
      >
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
          <circle cx="12" cy="12" r="10" fill="#3b82f6" opacity="0.15" />
          <path
            d="M7 12 Q9 8 12 12 Q15 16 17 12"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>

      {/* Panel nav */}
      <nav className="flex flex-col items-center gap-1 flex-1">
        {NAV_ITEMS.map(({ panel, icon: Icon, labelKey }) => {
          const isActive = activePanel === panel;
          const label = t(labelKey);
          return (
            <button
              key={panel}
              onClick={() => setActivePanel(panel)}
              title={label}
              className={`flex flex-col items-center justify-center rounded-lg transition-all duration-150 ${
                isActive ? 'btn-nav-active' : 'btn-ghost'
              }`}
              style={{
                width: 56,
                height: 52,
                gap: 3,
                background: isActive ? '#1d4ed8' : undefined,
                color: isActive ? '#93c5fd' : undefined,
                border: isActive ? '1px solid #2563eb' : undefined,
              }}
            >
              <Icon size={18} />
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Settings at bottom */}
      <button
        onClick={() => openModal('settings')}
        title={t('nav.settings')}
        className="btn-ghost flex flex-col items-center justify-center rounded-lg transition-all duration-150"
        style={{ width: 56, height: 52, gap: 3 }}
      >
        <Settings size={18} />
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {t('nav.settings')}
        </span>
      </button>
    </aside>
  );
}
