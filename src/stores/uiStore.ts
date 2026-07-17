// ---------------------------------------------------------------------------
// CrispAudio — uiStore
// Zustand store for global UI state: active panel, sidebar, zoom, snap.
// ---------------------------------------------------------------------------

import { create } from 'zustand';

export type ActivePanel = 'sfx' | 'voice' | 'timeline';
export type ActiveModal = 'settings' | 'about' | 'shortcuts' | 'voiceEffects' | 'tts' | null;

interface UIState {
  activePanel: ActivePanel;
  activeModal: ActiveModal;
  sidebarCollapsed: boolean;
  zoomLevel: number;
  snapEnabled: boolean;
  snapInterval: number;
  voiceEffectsTargetSegmentId: string | null;

  setActivePanel: (panel: ActivePanel) => void;
  openModal: (modal: Exclude<ActiveModal, null>) => void;
  closeModal: () => void;
  openVoiceEffects: (segmentId: string) => void;
  toggleSidebar: () => void;
  setZoomLevel: (level: number) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setSnapInterval: (interval: number) => void;
}

// Optional build-time override of the starting panel — used only by the
// screenshot CI job (VITE_INITIAL_PANEL) so it can capture each panel.
const INITIAL_PANEL: ActivePanel =
  (['sfx', 'voice', 'timeline'] as const).includes(
    import.meta.env.VITE_INITIAL_PANEL as ActivePanel,
  )
    ? (import.meta.env.VITE_INITIAL_PANEL as ActivePanel)
    : 'sfx';

export const useUIStore = create<UIState>()((set) => ({
  activePanel: INITIAL_PANEL,
  activeModal: null,
  sidebarCollapsed: false,
  zoomLevel: 1,
  snapEnabled: true,
  snapInterval: 16,
  voiceEffectsTargetSegmentId: null,

  setActivePanel: (panel) => set({ activePanel: panel }),
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null, voiceEffectsTargetSegmentId: null }),
  openVoiceEffects: (segmentId) => set({ activeModal: 'voiceEffects', voiceEffectsTargetSegmentId: segmentId }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setZoomLevel: (level) =>
    set({ zoomLevel: Math.max(0.25, Math.min(8, level)) }),
  setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),
  setSnapInterval: (interval) => set({ snapInterval: interval }),
}));
