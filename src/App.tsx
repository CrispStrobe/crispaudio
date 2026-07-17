// ---------------------------------------------------------------------------
// CrispAudio — App
// Root component. Renders AppShell and switches panels based on uiStore.
// ---------------------------------------------------------------------------

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
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
const ShortcutsModal = lazy(() => import('./components/common/ShortcutsModal').then(m => ({ default: m.ShortcutsModal })));
const VoiceEffectsModal = lazy(() => import('./components/timeline/VoiceEffectsModal').then(m => ({ default: m.VoiceEffectsModal })));
const TTSModal = lazy(() => import('./components/timeline/TTSModal').then(m => ({ default: m.TTSModal })));

export default function App() {
  const { activePanel, setActivePanel, openModal, activeModal } = useUIStore();

  // Autosave timeline project structure periodically + on unload
  useAutosave();

  // CI-only plugin-fs self-test (VITE_FS_SELFTEST build flag). Confirms the
  // sandbox-safe file I/O actually reads/writes on the target platform.
  const [fsSelfTest, setFsSelfTest] = useState<{ ok: boolean; detail: string } | null>(null);
  useEffect(() => {
    if (!import.meta.env.VITE_FS_SELFTEST) return;
    import('./lib/fsSelfTest').then((m) => m.runFsSelfTest()).then(setFsSelfTest);
  }, []);

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
      } else if (e.key === '?' || (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        openModal('shortcuts');
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setActivePanel, openModal, activeModal]);

  return (
    <AppShell>
      {fsSelfTest && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            zIndex: 99999,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'monospace',
            color: '#fff',
            background: fsSelfTest.ok ? '#16a34a' : '#dc2626',
          }}
        >
          FS {fsSelfTest.ok ? 'PASS' : 'FAIL'}: {fsSelfTest.detail}
        </div>
      )}
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
        {activeModal === 'shortcuts' && <ShortcutsModal />}
        {activeModal === 'voiceEffects' && <VoiceEffectsModal />}
        {activeModal === 'tts' && <TTSModal />}
      </Suspense>
    </AppShell>
  );
}
