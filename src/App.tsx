// ---------------------------------------------------------------------------
// CrispAudio — App
// Root component. Renders AppShell and switches panels based on uiStore.
// ---------------------------------------------------------------------------

import { AppShell } from './components/layout/AppShell';
import { SFXPanel } from './components/sfx/SFXPanel';
import { VoicePanel } from './components/voice/VoicePanel';
import { TimelinePanel } from './components/timeline/TimelinePanel';
import { SettingsModal } from './components/common/SettingsModal';
import { AboutModal } from './components/common/AboutModal';
import { LicensesModal } from './components/common/LicensesModal';
import { useUIStore } from './stores/uiStore';
import { useSettingsStore } from './stores/settingsStore';
import { useSynthStore, loadFromShareLink } from './stores/synthStore';
import { useEffect, useRef } from 'react';

export default function App() {
  const { activePanel, setActivePanel } = useUIStore();

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

  return (
    <AppShell>
      {activePanel === 'sfx' && <SFXPanel />}
      {activePanel === 'voice' && <VoicePanel />}
      {activePanel === 'timeline' && <TimelinePanel />}

      <SettingsModal />
      <AboutModal />
      <LicensesModal />
    </AppShell>
  );
}
