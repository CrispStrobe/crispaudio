// ---------------------------------------------------------------------------
// CrispAudio — Sidebar
// Vertical icon+label nav. Active panel highlighted with accent tint.
// On mobile (< md), renders as a slide-in overlay with backdrop.
// ---------------------------------------------------------------------------

import { Music2, Mic, LayoutList, Settings, X } from 'lucide-react';
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

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { activePanel, setActivePanel, openModal } = useUIStore();

  const handleNav = (panel: ActivePanel) => {
    setActivePanel(panel);
    // On mobile, close sidebar after navigating
    onClose?.();
  };

  const sidebarContent = (
    <aside
      role="navigation"
      aria-label="Main navigation"
      className="flex flex-col items-center py-4 gap-1 h-full"
      style={{
        width: 72,
        minWidth: 72,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      {/* Logo mark */}
      <div
        className="flex items-center justify-center mb-5"
        style={{ width: 36, height: 36 }}
        title="CrispAudio"
      >
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" role="img" aria-label="CrispAudio">
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

      {/* Close button — mobile only */}
      {onClose && (
        <button
          onClick={onClose}
          className="btn-ghost flex items-center justify-center rounded-lg md:hidden"
          style={{ width: 40, height: 40, marginBottom: 8 }}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      )}

      {/* Panel nav */}
      <nav className="flex flex-col items-center gap-1 flex-1">
        {NAV_ITEMS.map(({ panel, icon: Icon, labelKey }) => {
          const isActive = activePanel === panel;
          const label = t(labelKey);
          return (
            <button
              key={panel}
              onClick={() => handleNav(panel)}
              title={label}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center rounded-lg transition-all duration-150 ${
                isActive ? 'btn-nav-active' : 'btn-ghost'
              }`}
              style={{ width: 56, height: 52, gap: 3 }}
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
        onClick={() => {
          openModal('settings');
          onClose?.();
        }}
        title={t('nav.settings')}
        aria-label={t('nav.settings')}
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

  // Desktop: always visible, no overlay
  // Mobile: render as overlay with backdrop when not collapsed
  return (
    <>
      {/* Desktop sidebar — always visible */}
      <div className="hidden md:flex h-full">
        {sidebarContent}
      </div>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 sidebar-backdrop"
            style={{ background: 'rgba(0, 0, 0, 0.5)' }}
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Sidebar panel */}
          <div className="relative z-10 sidebar-slide-in h-full">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
