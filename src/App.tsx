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
import { useSynthStore } from './stores/synthStore';
import { useEffect } from 'react';

export default function App() {
  const { activePanel } = useUIStore();

  // Apply the persisted default export format to the synth store on startup.
  const defaultSampleRate = useSettingsStore((s) => s.defaultSampleRate);
  const defaultBitDepth = useSettingsStore((s) => s.defaultBitDepth);
  const setExportSettings = useSynthStore((s) => s.setExportSettings);
  useEffect(() => {
    setExportSettings(defaultSampleRate, defaultBitDepth);
  }, [defaultSampleRate, defaultBitDepth, setExportSettings]);

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
