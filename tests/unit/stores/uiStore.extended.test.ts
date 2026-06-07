// ---------------------------------------------------------------------------
// uiStore extended tests — voice effects modal and TTS modal
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../../../src/stores/uiStore';

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
    voiceEffectsTargetSegmentId: null,
  });
}

beforeEach(resetStore);

// ---------------------------------------------------------------------------
// openVoiceEffects
// ---------------------------------------------------------------------------

describe('uiStore — openVoiceEffects', () => {
  it('sets activeModal to "voiceEffects"', () => {
    useUIStore.getState().openVoiceEffects('seg-123');
    expect(useUIStore.getState().activeModal).toBe('voiceEffects');
  });

  it('stores the target segment ID', () => {
    useUIStore.getState().openVoiceEffects('seg-abc');
    expect(useUIStore.getState().voiceEffectsTargetSegmentId).toBe('seg-abc');
  });

  it('closeModal clears segment ID', () => {
    useUIStore.getState().openVoiceEffects('seg-123');
    useUIStore.getState().closeModal();
    expect(useUIStore.getState().activeModal).toBeNull();
    expect(useUIStore.getState().voiceEffectsTargetSegmentId).toBeNull();
  });

  it('opening a different modal preserves and then clears segment ID on close', () => {
    useUIStore.getState().openVoiceEffects('seg-xyz');
    useUIStore.getState().openModal('settings');
    expect(useUIStore.getState().activeModal).toBe('settings');
    // voiceEffectsTargetSegmentId is still set (not cleared by openModal)
    useUIStore.getState().closeModal();
    expect(useUIStore.getState().voiceEffectsTargetSegmentId).toBeNull();
  });

  it('does not change activePanel', () => {
    useUIStore.getState().setActivePanel('timeline');
    useUIStore.getState().openVoiceEffects('seg-123');
    expect(useUIStore.getState().activePanel).toBe('timeline');
  });
});

// ---------------------------------------------------------------------------
// TTS modal
// ---------------------------------------------------------------------------

describe('uiStore — TTS modal', () => {
  it('openModal("tts") sets activeModal to "tts"', () => {
    useUIStore.getState().openModal('tts');
    expect(useUIStore.getState().activeModal).toBe('tts');
  });

  it('closeModal clears TTS modal', () => {
    useUIStore.getState().openModal('tts');
    useUIStore.getState().closeModal();
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('TTS modal does not set voiceEffectsTargetSegmentId', () => {
    useUIStore.getState().openModal('tts');
    expect(useUIStore.getState().voiceEffectsTargetSegmentId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// voiceEffects modal type
// ---------------------------------------------------------------------------

describe('uiStore — voiceEffects via openModal', () => {
  it('openModal("voiceEffects") sets modal but not segment ID', () => {
    useUIStore.getState().openModal('voiceEffects');
    expect(useUIStore.getState().activeModal).toBe('voiceEffects');
    expect(useUIStore.getState().voiceEffectsTargetSegmentId).toBeNull();
  });
});
