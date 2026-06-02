// ---------------------------------------------------------------------------
// CrispAudio — App
// Root component. Renders AppShell and switches panels based on uiStore.
// ---------------------------------------------------------------------------

import { AppShell } from './components/layout/AppShell';
import { SFXPanel } from './components/sfx/SFXPanel';
import { VoicePanel } from './components/voice/VoicePanel';
import { TimelinePanel } from './components/timeline/TimelinePanel';
import { useUIStore } from './stores/uiStore';

export default function App() {
  const { activePanel } = useUIStore();

  return (
    <AppShell>
      {activePanel === 'sfx' && <SFXPanel />}
      {activePanel === 'voice' && <VoicePanel />}
      {activePanel === 'timeline' && <TimelinePanel />}
    </AppShell>
  );
}
