import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '../../../src/stores/projectStore';
import { useSynthStore } from '../../../src/stores/synthStore';
import { synthHistoryGesture } from '../../../src/stores/synthStore';
import { voiceHistoryGesture } from '../../../src/stores/voiceStore';
import { projectHistoryGesture } from '../../../src/stores/projectStore';
import { useVoiceStore } from '../../../src/stores/voiceStore';

beforeEach(() => {
  synthHistoryGesture.end();
  voiceHistoryGesture.end();
  projectHistoryGesture.end();
  for (const store of [useProjectStore, useSynthStore, useVoiceStore]) {
    store.temporal.getState().resume();
    store.temporal.getState().clear();
  }
});

function prepareSegmentRedo() {
  const store = useProjectStore;
  store.getState().addTrack('Segment track');
  const trackId = store.getState().project.tracks.at(-1)!.id;
  const segment = {
    id: crypto.randomUUID(), trackId, sourceId: 'source', startTime: 0,
    duration: 2, sourceOffset: 0, fadeInDuration: 0, fadeOutDuration: 0,
    fadeInCurve: 'linear' as const, fadeOutCurve: 'linear' as const,
    effects: [], gain: 1, color: '#ffffff', name: 'Original',
  };
  store.getState().addSegment(trackId, segment);
  store.temporal.getState().clear();
  store.getState().setSegmentName(segment.id, 'Edited');
  store.temporal.getState().undo();
  return segment;
}

function expectSegmentRedoIntact() {
  expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
  expect(useProjectStore.temporal.getState().futureStates).toHaveLength(1);
  useProjectStore.temporal.getState().redo();
  expect(useProjectStore.getState().project.tracks.at(-1)!.segments[0].name).toBe('Edited');
}

describe('temporal isolation', () => {
  it.each(['in', 'out'] as const)('preserves redo for an unchanged %s fade', (side) => {
    const segment = prepareSegmentRedo();
    projectHistoryGesture.begin();
    useProjectStore.getState().setSegmentFade(segment.id, side, -1, 'linear');
    projectHistoryGesture.end();
    expectSegmentRedoIntact();
  });

  it.each(['left', 'right'] as const)('preserves redo for an unchanged %s trim', (side) => {
    const segment = prepareSegmentRedo();
    projectHistoryGesture.begin();
    useProjectStore.getState().trimSegment(segment.id, side, segment.duration, segment.sourceOffset);
    projectHistoryGesture.end();
    expectSegmentRedoIntact();
  });

  it.each([0, -1])('preserves redo for an unchanged segment move to %s', (start) => {
    const segment = prepareSegmentRedo();
    projectHistoryGesture.begin();
    useProjectStore.getState().moveSegment(segment.id, start, segment.trackId);
    projectHistoryGesture.end();
    expectSegmentRedoIntact();
  });

  it.each(['A', 'B'] as const)('preserves redo for unchanged restored voice settings in slot %s', (slot) => {
    const store = useVoiceStore;
    store.getState().setActiveSlot(slot);
    store.temporal.getState().clear();
    const original = slot === 'A' ? store.getState().settingsA : store.getState().settingsB;
    store.getState().setSettings({ pitchShift: original.pitchShift + 1 });
    store.temporal.getState().undo();
    voiceHistoryGesture.begin();
    store.getState().setSettings({ pitchShift: original.pitchShift });
    voiceHistoryGesture.end();
    expect(store.temporal.getState().pastStates).toHaveLength(0);
    expect(store.temporal.getState().futureStates).toHaveLength(1);
    store.temporal.getState().redo();
    const restored = slot === 'A' ? store.getState().settingsA : store.getState().settingsB;
    expect(restored.pitchShift).toBe(original.pitchShift + 1);
    store.getState().setActiveSlot('A');
  });

  it('preserves redo for an unchanged restored track name', () => {
    const store = useProjectStore;
    store.getState().addTrack('Original');
    const track = store.getState().project.tracks.at(-1)!;
    store.temporal.getState().clear();
    store.getState().updateTrack(track.id, { name: 'Edited' });
    store.temporal.getState().undo();
    projectHistoryGesture.begin();
    store.getState().updateTrack(track.id, { name: track.name });
    projectHistoryGesture.end();
    expect(store.temporal.getState().pastStates).toHaveLength(0);
    expect(store.temporal.getState().futureStates).toHaveLength(1);
    store.temporal.getState().redo();
    expect(store.getState().project.tracks.at(-1)!.name).toBe('Edited');
  });

  it('leaves redo intact for an unchanged synth gesture and separates subsequent gestures', () => {
    const original = useSynthStore.getState().paramsA.p_base_freq;
    useSynthStore.getState().setParams({ p_base_freq: original + 0.01 });
    useSynthStore.temporal.getState().undo();
    synthHistoryGesture.begin();
    useSynthStore.getState().setParams({ p_base_freq: original });
    synthHistoryGesture.end();
    expect(useSynthStore.temporal.getState().pastStates).toHaveLength(0);
    expect(useSynthStore.temporal.getState().futureStates).toHaveLength(1);
    for (const value of [original + 0.02, original + 0.03]) {
      synthHistoryGesture.begin();
      synthHistoryGesture.begin(); // repeated keydown is idempotent
      useSynthStore.getState().setParams({ p_base_freq: value });
      synthHistoryGesture.end();
      synthHistoryGesture.end();
    }
    expect(useSynthStore.temporal.getState().pastStates).toHaveLength(2);
    expect(useSynthStore.temporal.getState().futureStates).toHaveLength(0);
  });
  it('makes voice morph slider changes undoable', () => {
    useVoiceStore.setState({ morphAmount: 0 });
    useVoiceStore.temporal.getState().clear();
    voiceHistoryGesture.begin();
    useVoiceStore.getState().setMorphAmount(0.2);
    useVoiceStore.getState().setMorphAmount(0.8);
    voiceHistoryGesture.end();
    expect(useVoiceStore.temporal.getState().pastStates).toHaveLength(1);
    useVoiceStore.temporal.getState().undo();
    expect(useVoiceStore.getState().morphAmount).toBe(0);
  });
  it('groups voice settings and timeline edits into separate gestures', () => {
    const voiceGesture = voiceHistoryGesture;
    const projectGesture = projectHistoryGesture;
    expect(voiceGesture).toBeDefined();
    expect(projectGesture).toBeDefined();
    voiceGesture.begin();
    useVoiceStore.getState().setSettings({ pitchShift: 1 });
    useVoiceStore.getState().setSettings({ pitchShift: 2 });
    voiceGesture.end();
    projectGesture.begin();
    useProjectStore.getState().addTrack('One');
    useProjectStore.getState().addTrack('Two');
    projectGesture.end();
    expect(useVoiceStore.temporal.getState().pastStates).toHaveLength(1);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    useVoiceStore.getState().setSettings({ pitchShift: 3 });
    useProjectStore.getState().addTrack('Separate');
    expect(useVoiceStore.temporal.getState().pastStates).toHaveLength(2);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(2);
  });
  it('groups a synth gesture into one undo step without suppressing live updates', () => {
    const gesture = synthHistoryGesture;
    expect(gesture).toBeDefined();
    const original = useSynthStore.getState().paramsA;
    gesture.begin();
    for (let i = 1; i <= 10; i++) useSynthStore.getState().setParams({ p_base_freq: i / 10 });
    gesture.end();
    expect(useSynthStore.getState().paramsA.p_base_freq).toBe(1);
    expect(useSynthStore.temporal.getState().pastStates).toHaveLength(1);
    useSynthStore.temporal.getState().undo();
    expect(useSynthStore.getState().paramsA).toBe(original);
    useSynthStore.temporal.getState().redo();
    expect(useSynthStore.getState().paramsA.p_base_freq).toBe(1);
  });
  it('preserves voice edits and redo through processing updates', () => {
    const store = useVoiceStore;
    const original = store.getState().settingsA;
    store.getState().setSettings({ pitchShift: original.pitchShift + 1 });
    const edited = store.getState().settingsA;
    for (let i = 0; i < 60; i++) store.getState().setIsProcessing(i % 2 === 0);
    store.getState().setProcessedBuffer(null);
    expect(store.temporal.getState().pastStates).toHaveLength(1);
    store.temporal.getState().undo();
    expect(store.getState().settingsA).toBe(original);
    store.getState().setIsProcessing(false);
    expect(store.temporal.getState().futureStates).toHaveLength(1);
    store.temporal.getState().redo();
    expect(store.getState().settingsA).toBe(edited);
  });

  it('preserves synth edits and redo through buffer and playback updates', () => {
    const store = useSynthStore;
    const original = store.getState().paramsA;
    store.getState().setParams({ p_base_freq: original.p_base_freq + 0.01 });
    const edited = store.getState().paramsA;
    store.getState().generate();
    for (let i = 0; i < 60; i++) store.getState().setIsPlaying(i % 2 === 0);
    expect(store.temporal.getState().pastStates).toHaveLength(1);
    store.temporal.getState().undo();
    expect(store.getState().paramsA).toBe(original);
    store.getState().setIsPlaying(false);
    store.getState().generate();
    expect(store.temporal.getState().futureStates).toHaveLength(1);
    store.temporal.getState().redo();
    expect(store.getState().paramsA).toBe(edited);
  });

  it('preserves timeline edits and redo through repeated view/playback updates', () => {
    const store = useProjectStore;
    const original = store.getState().project;
    store.getState().addTrack('Undo target');
    const edited = store.getState().project;
    for (let i = 0; i < 120; i++) {
      store.getState().setPlayheadPosition(i);
      store.getState().setZoomLevel(100 + i);
      store.getState().setScrollOffset(i);
    }
    expect(store.temporal.getState().pastStates).toHaveLength(1);
    store.temporal.getState().undo();
    expect(store.getState().project).toBe(original);
    store.getState().setPlayheadPosition(0);
    expect(store.temporal.getState().futureStates).toHaveLength(1);
    store.temporal.getState().redo();
    expect(store.getState().project).toBe(edited);
  });
});
