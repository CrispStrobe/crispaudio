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

describe('uiStore — voice navigation', () => {
  it('ignores a missing timeline clip rather than opening an empty modal', () => {
    useUIStore.getState().openVoiceEffects('missing');
    expect(useUIStore.getState().activeModal).toBeNull();
    expect(useUIStore.getState().voiceEffectsTargetSegmentId).toBeNull();
  });
  it('closing Settings preserves an ongoing Voice editing target', () => {
    useUIStore.setState({voiceEffectsTargetSegmentId:'editing'});
    useUIStore.getState().openModal('settings');
    useUIStore.getState().closeModal();
    expect(useUIStore.getState().voiceEffectsTargetSegmentId).toBe('editing');
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

describe('uiStore — files opened from other apps', () => {
  it('queues files, switches to the timeline, and hands them out once', () => {
    useUIStore.setState({ activePanel: 'sfx', pendingOpenedFiles: [] });
    const file = { name: 'loop.wav', bytes: new ArrayBuffer(4) };

    useUIStore.getState().queueOpenedFiles([file]);
    expect(useUIStore.getState().activePanel).toBe('timeline');
    expect(useUIStore.getState().pendingOpenedFiles).toHaveLength(1);

    expect(useUIStore.getState().takeOpenedFiles()).toEqual([file]);
    expect(useUIStore.getState().takeOpenedFiles()).toEqual([]);
  });
});
