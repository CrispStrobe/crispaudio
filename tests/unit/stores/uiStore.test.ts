// ---------------------------------------------------------------------------
// uiStore unit tests
// ---------------------------------------------------------------------------
// NOTE: Zustand stores are module-level singletons; state persists between
// tests.  We reset to initial defaults in a beforeEach hook.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../../../src/stores/uiStore';
import type { ActivePanel, ActiveModal } from '../../../src/stores/uiStore';

// ---------------------------------------------------------------------------
// Reset helper
// ---------------------------------------------------------------------------

function resetStore(): void {
  useUIStore.setState({
    activePanel: 'sfx',
    activeModal: null,
    sidebarCollapsed: false,
    zoomLevel: 1,
    snapEnabled: true,
    snapInterval: 16,
  });
}

beforeEach(() => {
  resetStore();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('uiStore — initial state', () => {
  it('activePanel defaults to "sfx"', () => {
    expect(useUIStore.getState().activePanel).toBe('sfx');
  });

  it('activeModal defaults to null', () => {
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('sidebarCollapsed defaults to false', () => {
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it('zoomLevel defaults to 1', () => {
    expect(useUIStore.getState().zoomLevel).toBe(1);
  });

  it('snapEnabled defaults to true', () => {
    expect(useUIStore.getState().snapEnabled).toBe(true);
  });

  it('snapInterval defaults to 16', () => {
    expect(useUIStore.getState().snapInterval).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// setActivePanel
// ---------------------------------------------------------------------------

describe('uiStore — setActivePanel', () => {
  it('changes panel to "voice"', () => {
    useUIStore.getState().setActivePanel('voice');
    expect(useUIStore.getState().activePanel).toBe('voice');
  });

  it('changes panel to "timeline"', () => {
    useUIStore.getState().setActivePanel('timeline');
    expect(useUIStore.getState().activePanel).toBe('timeline');
  });

  it('changes panel back to "sfx"', () => {
    useUIStore.getState().setActivePanel('voice');
    useUIStore.getState().setActivePanel('sfx');
    expect(useUIStore.getState().activePanel).toBe('sfx');
  });

  it('setting the same panel is idempotent', () => {
    useUIStore.getState().setActivePanel('sfx');
    useUIStore.getState().setActivePanel('sfx');
    expect(useUIStore.getState().activePanel).toBe('sfx');
  });

  const allPanels: ActivePanel[] = ['sfx', 'voice', 'timeline'];
  for (const panel of allPanels) {
    it(`setActivePanel("${panel}") stores correct value`, () => {
      useUIStore.getState().setActivePanel(panel);
      expect(useUIStore.getState().activePanel).toBe(panel);
    });
  }
});

// ---------------------------------------------------------------------------
// openModal / closeModal
// ---------------------------------------------------------------------------

describe('uiStore — openModal / closeModal', () => {
  it('openModal("settings") sets activeModal to "settings"', () => {
    useUIStore.getState().openModal('settings');
    expect(useUIStore.getState().activeModal).toBe('settings');
  });

  it('openModal("about") sets activeModal to "about"', () => {
    useUIStore.getState().openModal('about');
    expect(useUIStore.getState().activeModal).toBe('about');
  });

  it('openModal("licenses") sets activeModal to "licenses"', () => {
    useUIStore.getState().openModal('licenses');
    expect(useUIStore.getState().activeModal).toBe('licenses');
  });

  it('closeModal sets activeModal back to null', () => {
    useUIStore.getState().openModal('settings');
    useUIStore.getState().closeModal();
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('calling closeModal when no modal is open leaves state as null', () => {
    expect(useUIStore.getState().activeModal).toBeNull();
    useUIStore.getState().closeModal();
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('opening a second modal replaces the first', () => {
    useUIStore.getState().openModal('settings');
    useUIStore.getState().openModal('about');
    expect(useUIStore.getState().activeModal).toBe('about');
  });

  const modals: Array<Exclude<ActiveModal, null>> = ['settings', 'about', 'licenses'];
  for (const modal of modals) {
    it(`openModal("${modal}") stores correct value`, () => {
      useUIStore.getState().openModal(modal);
      expect(useUIStore.getState().activeModal).toBe(modal);
    });
  }
});

// ---------------------------------------------------------------------------
// toggleSidebar
// ---------------------------------------------------------------------------

describe('uiStore — toggleSidebar', () => {
  it('toggleSidebar flips false → true', () => {
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
  });

  it('toggleSidebar flips true → false', () => {
    useUIStore.setState({ sidebarCollapsed: true });
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it('toggling twice returns to original state', () => {
    const initial = useUIStore.getState().sidebarCollapsed;
    useUIStore.getState().toggleSidebar();
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(initial);
  });

  it('three toggles = one toggle', () => {
    useUIStore.getState().toggleSidebar();
    useUIStore.getState().toggleSidebar();
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// setZoomLevel
// ---------------------------------------------------------------------------

describe('uiStore — setZoomLevel', () => {
  it('sets zoom to a valid value', () => {
    useUIStore.getState().setZoomLevel(2);
    expect(useUIStore.getState().zoomLevel).toBe(2);
  });

  it('sets zoom to 4', () => {
    useUIStore.getState().setZoomLevel(4);
    expect(useUIStore.getState().zoomLevel).toBe(4);
  });

  it('clamps zoom below minimum (0.25)', () => {
    useUIStore.getState().setZoomLevel(0);
    expect(useUIStore.getState().zoomLevel).toBe(0.25);
  });

  it('clamps zoom above maximum (8)', () => {
    useUIStore.getState().setZoomLevel(100);
    expect(useUIStore.getState().zoomLevel).toBe(8);
  });

  it('exact minimum boundary 0.25 is accepted', () => {
    useUIStore.getState().setZoomLevel(0.25);
    expect(useUIStore.getState().zoomLevel).toBe(0.25);
  });

  it('exact maximum boundary 8 is accepted', () => {
    useUIStore.getState().setZoomLevel(8);
    expect(useUIStore.getState().zoomLevel).toBe(8);
  });

  it('fractional zoom values are stored as-is', () => {
    useUIStore.getState().setZoomLevel(1.5);
    expect(useUIStore.getState().zoomLevel).toBe(1.5);
  });

  it('negative zoom is clamped to 0.25', () => {
    useUIStore.getState().setZoomLevel(-5);
    expect(useUIStore.getState().zoomLevel).toBe(0.25);
  });
});

// ---------------------------------------------------------------------------
// setSnapEnabled
// ---------------------------------------------------------------------------

describe('uiStore — setSnapEnabled', () => {
  it('setSnapEnabled(false) disables snap', () => {
    useUIStore.getState().setSnapEnabled(false);
    expect(useUIStore.getState().snapEnabled).toBe(false);
  });

  it('setSnapEnabled(true) enables snap', () => {
    useUIStore.getState().setSnapEnabled(false);
    useUIStore.getState().setSnapEnabled(true);
    expect(useUIStore.getState().snapEnabled).toBe(true);
  });

  it('setting the same value is idempotent', () => {
    useUIStore.getState().setSnapEnabled(true);
    useUIStore.getState().setSnapEnabled(true);
    expect(useUIStore.getState().snapEnabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// setSnapInterval
// ---------------------------------------------------------------------------

describe('uiStore — setSnapInterval', () => {
  it('sets snapInterval to 8', () => {
    useUIStore.getState().setSnapInterval(8);
    expect(useUIStore.getState().snapInterval).toBe(8);
  });

  it('sets snapInterval to 32', () => {
    useUIStore.getState().setSnapInterval(32);
    expect(useUIStore.getState().snapInterval).toBe(32);
  });

  it('sets snapInterval to 1', () => {
    useUIStore.getState().setSnapInterval(1);
    expect(useUIStore.getState().snapInterval).toBe(1);
  });

  it('snapInterval is stored as provided (no clamping)', () => {
    useUIStore.getState().setSnapInterval(64);
    expect(useUIStore.getState().snapInterval).toBe(64);
  });

  it('updating snapInterval does not change other state', () => {
    useUIStore.getState().setActivePanel('voice');
    useUIStore.getState().setSnapInterval(4);
    expect(useUIStore.getState().activePanel).toBe('voice');
    expect(useUIStore.getState().snapInterval).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Cross-field isolation — actions don't clobber unrelated state
// ---------------------------------------------------------------------------

describe('uiStore — state isolation', () => {
  it('setActivePanel does not change sidebarCollapsed', () => {
    useUIStore.getState().toggleSidebar(); // collapse it
    useUIStore.getState().setActivePanel('voice');
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
  });

  it('toggleSidebar does not change activePanel', () => {
    useUIStore.getState().setActivePanel('timeline');
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().activePanel).toBe('timeline');
  });

  it('setZoomLevel does not change snapEnabled', () => {
    useUIStore.getState().setSnapEnabled(false);
    useUIStore.getState().setZoomLevel(3);
    expect(useUIStore.getState().snapEnabled).toBe(false);
  });

  it('openModal does not change activePanel', () => {
    useUIStore.getState().setActivePanel('voice');
    useUIStore.getState().openModal('settings');
    expect(useUIStore.getState().activePanel).toBe('voice');
  });
});
