// ---------------------------------------------------------------------------
// CrispAudio — Sidebar
// Vertical icon nav, 56 px wide. Active panel highlighted.
// ---------------------------------------------------------------------------

import { Music2, Mic, LayoutList, Settings } from 'lucide-react';
import { useUIStore, type ActivePanel } from '../../stores/uiStore';

interface NavItem {
  panel: ActivePanel;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { panel: 'sfx', icon: Music2, label: 'SFX' },
  { panel: 'voice', icon: Mic, label: 'Voice' },
  { panel: 'timeline', icon: LayoutList, label: 'Timeline' },
];

export function Sidebar() {
  const { activePanel, setActivePanel } = useUIStore();

  return (
    <aside
      className="flex flex-col items-center py-3 gap-1"
      style={{
        width: 56,
        minWidth: 56,
        background: '#0a1120',
        borderRight: '1px solid #1e2d40',
        height: '100%',
      }}
    >
      {/* Logo mark */}
      <div
        className="flex items-center justify-center mb-4"
        style={{ width: 32, height: 32 }}
        title="CrispAudio"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
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
        {NAV_ITEMS.map(({ panel, icon: Icon, label }) => {
          const isActive = activePanel === panel;
          return (
            <div key={panel} className="relative group">
              <button
                onClick={() => setActivePanel(panel)}
                title={label}
                className="flex items-center justify-center rounded-lg transition-all duration-150"
                style={{
                  width: 40,
                  height: 40,
                  background: isActive ? '#1d4ed8' : 'transparent',
                  color: isActive ? '#93c5fd' : '#64748b',
                  border: isActive ? '1px solid #2563eb' : '1px solid transparent',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      '#1e293b';
                    (e.currentTarget as HTMLButtonElement).style.color =
                      '#94a3b8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      'transparent';
                    (e.currentTarget as HTMLButtonElement).style.color =
                      '#64748b';
                  }
                }}
              >
                <Icon size={18} />
              </button>
              {/* Tooltip */}
              <div
                className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50"
                style={{
                  background: '#1e293b',
                  color: '#e2e8f0',
                  border: '1px solid #334155',
                  fontSize: 11,
                }}
              >
                {label}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Settings at bottom */}
      <div className="relative group">
        <button
          title="Settings"
          className="flex items-center justify-center rounded-lg transition-all duration-150"
          style={{
            width: 40,
            height: 40,
            background: 'transparent',
            color: '#475569',
            border: '1px solid transparent',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#1e293b';
            (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = '#475569';
          }}
        >
          <Settings size={18} />
        </button>
        <div
          className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50"
          style={{
            background: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid #334155',
            fontSize: 11,
          }}
        >
          Settings
        </div>
      </div>
    </aside>
  );
}
