// ---------------------------------------------------------------------------
// CrispAudio — uiStore
// Zustand store for global UI state: active panel, sidebar, zoom, snap.
// ---------------------------------------------------------------------------

import { create } from 'zustand';

export type ActivePanel = 'sfx' | 'voice' | 'timeline';
export type ActiveModal = 'settings' | 'about' | 'licenses' | null;

interface UIState {
  activePanel: ActivePanel;
  activeModal: ActiveModal;
  sidebarCollapsed: boolean;
  zoomLevel: number;
  snapEnabled: boolean;
  snapInterval: number;

  setActivePanel: (panel: ActivePanel) => void;
  openModal: (modal: Exclude<ActiveModal, null>) => void;
  closeModal: () => void;
  toggleSidebar: () => void;
  setZoomLevel: (level: number) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setSnapInterval: (interval: number) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  activePanel: 'sfx',
  activeModal: null,
  sidebarCollapsed: false,
  zoomLevel: 1,
  snapEnabled: true,
  snapInterval: 16,

  setActivePanel: (panel) => set({ activePanel: panel }),
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setZoomLevel: (level) =>
    set({ zoomLevel: Math.max(0.25, Math.min(8, level)) }),
  setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),
  setSnapInterval: (interval) => set({ snapInterval: interval }),
}));
