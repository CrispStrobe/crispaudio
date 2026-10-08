import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineActions } from '../../../src/components/timeline/TimelineActions';
import { TransportControls } from '../../../src/components/timeline/TransportControls';
import { useProjectStore } from '../../../src/stores/projectStore';
import type { AudioSegment } from '../../../src/types/audio';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../src/components/timeline/SegmentEffectsPanel', () => ({ SegmentEffectsPanel: () => <div>inspector</div> }));
beforeEach(() => {
  useProjectStore.setState(useProjectStore.getInitialState());
  const state = useProjectStore.getState();
  state.addTrack('Jacket'); state.addTrack('Room');
  const tracks = useProjectStore.getState().project.tracks.map((track, index) => ({ ...track, muted: index === 1, solo: index === 0,
    segments: [{ id: `clip-${index}`, trackId: track.id, sourceId: `source-${index}`, startTime: 0, duration: 10,
      sourceOffset: 2, gain: 1, fadeInDuration: 0, fadeOutDuration: 0, fadeInCurve: 'linear', fadeOutCurve: 'linear', effects: [], name: track.name, color: '#fff' } as AudioSegment] }));
  useProjectStore.setState({ project: { ...state.project, tracks, duration: 10 }, playheadPosition: 4 });
  useProjectStore.temporal.getState().clear();
});
afterEach(cleanup);
describe('interview touch workflow', () => {
  it('splits both microphones at the same boundary and undoes as one edit', () => {
    render(<TimelineActions touchArrange={false} onTouchArrange={() => {}} />);
    fireEvent.click(screen.getByText('timeline.splitAll'));
    for (const track of useProjectStore.getState().project.tracks) {
      expect(track.segments.map((clip) => [clip.startTime, clip.duration, clip.sourceOffset])).toEqual([[0, 4, 2], [4, 6, 6]]);
    }
    act(() => useProjectStore.temporal.getState().undo());
    expect(useProjectStore.getState().project.tracks.map((track) => track.segments.length)).toEqual([1, 1]);
  });
  it('switches microphone audibly by clearing previous solos and mutes', () => {
    render(<TimelineActions touchArrange={false} onTouchArrange={() => {}} />);
    fireEvent.click(screen.getByText('timeline.mixer'));
    const room = screen.getByDisplayValue('Room').closest('section')!;
    fireEvent.click(within(room).getByText('timeline.listenOnly'));
    expect(useProjectStore.getState().project.tracks.map((track) => [track.muted, track.solo])).toEqual([[true, false], [false, false]]);
  });
  it('seeks and brings that position into the visible timeline', () => {
    render(<TransportControls />);
    fireEvent.change(screen.getByLabelText('timeline.seek'), { target: { value: '8' } });
    expect(useProjectStore.getState().playheadPosition).toBe(8);
    expect(useProjectStore.getState().scrollOffset).toBe(7);
  });
  it('does not require precision clip selection to toggle touch arrangement', () => {
    const onTouchArrange = vi.fn();
    render(<TimelineActions touchArrange={false} onTouchArrange={onTouchArrange} />);
    fireEvent.click(screen.getByText('timeline.touchArrangeOff'));
    expect(onTouchArrange).toHaveBeenCalledOnce();
    expect(screen.getByText('timeline.splitAtPlayhead')).toBeDisabled();
  });
});
