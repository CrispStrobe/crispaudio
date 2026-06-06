// ---------------------------------------------------------------------------
// CrispAudio — App
// Root component. Renders AppShell and switches panels based on uiStore.
// ---------------------------------------------------------------------------

import { lazy, Suspense, useEffect, useRef } from 'react';
import { AppShell } from './components/layout/AppShell';
import { useUIStore } from './stores/uiStore';
import { useSettingsStore } from './stores/settingsStore';
import { useSynthStore, loadFromShareLink } from './stores/synthStore';
import { useAutosave } from './hooks/useAutosave';

const SFXPanel = lazy(() => import('./components/sfx/SFXPanel').then(m => ({ default: m.SFXPanel })));
const VoicePanel = lazy(() => import('./components/voice/VoicePanel').then(m => ({ default: m.VoicePanel })));
const TimelinePanel = lazy(() => import('./components/timeline/TimelinePanel').then(m => ({ default: m.TimelinePanel })));
const SettingsModal = lazy(() => import('./components/common/SettingsModal').then(m => ({ default: m.SettingsModal })));
const AboutModal = lazy(() => import('./components/common/AboutModal').then(m => ({ default: m.AboutModal })));

export default function App() {
  const { activePanel, setActivePanel, openModal, activeModal } = useUIStore();

  // Autosave timeline project structure periodically + on unload
  useAutosave();

  // Apply the persisted default export format to the synth store on startup.
  const defaultSampleRate = useSettingsStore((s) => s.defaultSampleRate);
  const defaultBitDepth = useSettingsStore((s) => s.defaultBitDepth);
  const setExportSettings = useSynthStore((s) => s.setExportSettings);
  useEffect(() => {
    setExportSettings(defaultSampleRate, defaultBitDepth);
  }, [defaultSampleRate, defaultBitDepth, setExportSettings]);

  // Load shared sound from URL on startup (e.g. ?sound=BASE64)
  const shareLoadedRef = useRef(false);
  useEffect(() => {
    if (shareLoadedRef.current) return;
    shareLoadedRef.current = true;
    if (loadFromShareLink()) {
      setActivePanel('sfx');
    }
  }, [setActivePanel]);

  // Listen for OS theme changes when "system" theme is selected
  const theme = useSettingsStore((s) => s.theme);
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle('light', !e.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // Global keyboard shortcuts for panel switching
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (activeModal) return; // don't intercept when modal is open
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === '1') { e.preventDefault(); setActivePanel('sfx'); }
        else if (e.key === '2') { e.preventDefault(); setActivePanel('voice'); }
        else if (e.key === '3') { e.preventDefault(); setActivePanel('timeline'); }
        else if (e.key === ',') { e.preventDefault(); openModal('settings'); }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setActivePanel, openModal, activeModal]);

  return (
    <AppShell>
      <Suspense fallback={
        <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-muted)' }}>
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" className="animate-pulse">
            <circle cx="12" cy="12" r="10" fill="#3b82f6" opacity="0.15" />
            <path d="M7 12 Q9 8 12 12 Q15 16 17 12" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
          <span className="text-sm font-medium">Loading…</span>
        </div>
      }>
        {activePanel === 'sfx' && <SFXPanel />}
        {activePanel === 'voice' && <VoicePanel />}
        {activePanel === 'timeline' && <TimelinePanel />}

        {activeModal === 'settings' && <SettingsModal />}
        {activeModal === 'about' && <AboutModal />}
      </Suspense>
    </AppShell>
  );
}
