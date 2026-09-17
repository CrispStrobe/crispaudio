import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimeline } from '../../../src/hooks/useTimeline';
import { projectHistoryGesture, useProjectStore } from '../../../src/stores/projectStore';
import type { AudioSegment } from '../../../src/types/audio';

const segment: AudioSegment = {
  id: 'clip', trackId: 'track', sourceId: 'source', name: 'Clip',
  startTime: 1, duration: 4, sourceOffset: 0,
  fadeInDuration: 0, fadeOutDuration: 0,
  fadeInCurve: 'linear', fadeOutCurve: 'linear', effects: [], gain: 1, color: '#fff',
};

function Timeline() {
  const timeline = useTimeline();
  return <canvas aria-label="Timeline" onMouseDown={timeline.onMouseDown}
    onMouseMove={timeline.onMouseMove} onMouseUp={timeline.onMouseUp} />;
}

const currentSegment = () => useProjectStore.getState().project.tracks[0].segments[0];
const history = () => useProjectStore.temporal.getState();

beforeEach(() => {
  projectHistoryGesture.end();
  useProjectStore.setState(useProjectStore.getInitialState());
  useProjectStore.setState({ project: {
    ...useProjectStore.getState().project, duration: 5,
    tracks: [{ id: 'track', name: 'Track', muted: false, solo: false, volume: 1, pan: 0, segments: [segment] }],
  } });
  history().resume();
  history().clear();
});

afterEach(() => {
  cleanup();
  projectHistoryGesture.end();
});

describe('useTimeline gestures', () => {
  it('closes an interrupted drag when the next press is on empty space', () => {
    render(<Timeline />);
    const canvas = screen.getByLabelText('Timeline');
    fireEvent.mouseDown(canvas, { clientX: 200, clientY: 40 });
    fireEvent.mouseMove(canvas, { clientX: 300, clientY: 40 });
    fireEvent.mouseDown(canvas, { clientX: 900, clientY: 40 });
    fireEvent.mouseUp(canvas);
    act(() => useProjectStore.getState().setSegmentGain('clip', 0.5));
    expect(history().pastStates).toHaveLength(2);
    expect(useProjectStore.getState().playheadPosition).toBe(9);
    expect(useProjectStore.getState().selection).toBeNull();
  });
  it.each(['mouseup', 'pointerup', 'pointercancel', 'blur', 'unmount'])(
    'ends a drag on %s so subsequent edits have their own checkpoint', (ending) => {
      const view = render(<Timeline />);
      const canvas = screen.getByLabelText('Timeline');
      fireEvent.mouseDown(canvas, { clientX: 200, clientY: 40 });
      fireEvent.mouseMove(canvas, { clientX: 250, clientY: 40 });
      fireEvent.mouseMove(canvas, { clientX: 300, clientY: 40 });
      if (ending === 'unmount') view.unmount();
      else fireEvent(window, new Event(ending));
      fireEvent.mouseMove(canvas, { clientX: 400, clientY: 40 });
      expect(currentSegment().startTime).toBe(2);
      act(() => useProjectStore.getState().setSegmentGain('clip', 0.5));
      expect(history().pastStates).toHaveLength(2);
      act(() => history().undo());
      expect(currentSegment().gain).toBe(1);
      expect(currentSegment().startTime).toBe(2);
      act(() => history().undo());
      expect(currentSegment().startTime).toBe(1);
    },
  );
  it('groups live drag updates into one undo and keeps the next drag separate', () => {
    render(<Timeline />);
    const canvas = screen.getByLabelText('Timeline');
    fireEvent.mouseDown(canvas, { clientX: 200, clientY: 40 });
    for (const clientX of [220, 250, 300]) fireEvent.mouseMove(canvas, { clientX, clientY: 40 });
    expect(currentSegment().startTime).toBe(2);
    fireEvent.mouseUp(canvas);
    expect(history().pastStates).toHaveLength(1);

    fireEvent.mouseDown(canvas, { clientX: 300, clientY: 40 });
    for (const clientX of [330, 400]) fireEvent.mouseMove(canvas, { clientX, clientY: 40 });
    fireEvent.mouseUp(canvas);
    expect(currentSegment().startTime).toBe(3);
    expect(history().pastStates).toHaveLength(2);
    act(() => history().undo());
    expect(currentSegment().startTime).toBe(2);
    act(() => history().undo());
    expect(currentSegment().startTime).toBe(1);
    act(() => history().redo());
    expect(currentSegment().startTime).toBe(2);
  });

  it('does not rerender on playhead updates', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useTimeline();
    });
    act(() => useProjectStore.getState().setPlayheadPosition(3));
    expect(renders).toBe(1);
    act(() => {
      useProjectStore.getState().setSegmentName('clip', 'Updated');
      useProjectStore.getState().setIsPlaying(true);
      useProjectStore.getState().selectSegment('clip');
    });
    expect(renders).toBe(1);
    expect(result.current.hitTest(200, 40)).toMatchObject({
      type: 'segment', segment: { name: 'Updated' },
    });
    act(() => useProjectStore.getState().setZoomLevel(200));
    expect(renders).toBe(2);
    expect(result.current.timeToPixels(2)).toBe(400);
    act(() => useProjectStore.getState().setScrollOffset(1));
    expect(result.current.pixelsToTime(200)).toBe(2);
    act(() => useProjectStore.getState().setSnapEnabled(false));
    expect(result.current.snapTime(0.123)).toBe(0.123);
  });

  it('keeps keyboard listeners installed while reading latest transport and project state', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = renderHook(() => useTimeline());
    const keyAdds = () => add.mock.calls.filter(([event]) => event === 'keydown');
    const keyRemoves = () => remove.mock.calls.filter(([event]) => event === 'keydown');
    act(() => {
      useProjectStore.getState().setIsPlaying(true);
      useProjectStore.getState().addSegment('track', { ...segment, id: 'second', startTime: 8 });
      useProjectStore.getState().setZoomLevel(200);
    });
    expect(keyAdds()).toHaveLength(1);
    expect(keyRemoves()).toHaveLength(0);
    fireEvent.keyDown(window, { code: 'Space' });
    expect(useProjectStore.getState().isPlaying).toBe(false);
    fireEvent.keyDown(window, { code: 'Space' });
    expect(useProjectStore.getState().isPlaying).toBe(true);
    fireEvent.keyDown(window, { code: 'KeyA', metaKey: true });
    expect(useProjectStore.getState().selection).toEqual({
      segmentIds: ['clip', 'second'], startTime: 1, endTime: 12,
    });
    fireEvent.keyDown(window, { code: 'KeyC', ctrlKey: true });
    expect(useProjectStore.getState().clipboard.segments).toHaveLength(2);
    act(() => useProjectStore.getState().setPlayheadPosition(20));
    fireEvent.keyDown(window, { code: 'KeyV', ctrlKey: true });
    expect(useProjectStore.getState().project.tracks[0].segments.map((s) => s.startTime)).toEqual([1, 8, 20, 27]);
    fireEvent.keyDown(window, { code: 'KeyZ', ctrlKey: true });
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(2);
    fireEvent.keyDown(window, { code: 'KeyZ', metaKey: true, shiftKey: true });
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(4);
    fireEvent.keyDown(window, { code: 'Backspace' });
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(2);
    fireEvent.keyDown(window, { code: 'KeyA', ctrlKey: true });
    fireEvent.keyDown(window, { code: 'KeyX', ctrlKey: true });
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(0);
    view.unmount();
    expect(keyRemoves()).toHaveLength(1);
    add.mockRestore();
    remove.mockRestore();
  });

  it('does not end an active gesture when an idle instance releases or unmounts', () => {
    render(<Timeline />);
    const idle = renderHook(() => useTimeline());
    const canvas = screen.getByLabelText('Timeline');
    fireEvent.mouseDown(canvas, { clientX: 200, clientY: 40 });
    fireEvent.mouseMove(canvas, { clientX: 250, clientY: 40 });
    act(() => idle.result.current.onMouseUp());
    idle.unmount();
    fireEvent.mouseMove(canvas, { clientX: 300, clientY: 40 });
    fireEvent.mouseUp(canvas);
    expect(history().pastStates).toHaveLength(1);
    act(() => history().undo());
    expect(currentSegment().startTime).toBe(1);
  });

  it.each([
    { kind: 'trim-left', x: 100, y: 40, dx: 100, expected: { startTime: 2, duration: 3, sourceOffset: 1 } },
    { kind: 'trim-right', x: 500, y: 40, dx: -100, expected: { duration: 3 } },
    { kind: 'fade-in', x: 100, y: 5, dx: 100, expected: { fadeInDuration: 1 } },
    { kind: 'fade-out', x: 500, y: 5, dx: -100, expected: { fadeOutDuration: 1 } },
  ])('preserves $kind semantics with one undo checkpoint', ({ x, y, dx, expected }) => {
    render(<Timeline />);
    const canvas = screen.getByLabelText('Timeline');
    fireEvent.mouseDown(canvas, { clientX: x, clientY: y });
    for (const fraction of [0.25, 0.5, 1]) {
      fireEvent.mouseMove(canvas, { clientX: x + dx * fraction, clientY: y });
    }
    fireEvent.mouseUp(canvas);
    expect(currentSegment()).toMatchObject(expected);
    expect(history().pastStates).toHaveLength(1);
    act(() => history().undo());
    expect(currentSegment()).toEqual(segment);
  });
});
