import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoLane } from '../../../src/components/timeline/VideoLane';
import { useProjectStore } from '../../../src/stores/projectStore';
import type { VideoClip } from '../../../src/types/audio';
const capture = vi.hoisted(() => vi.fn());
vi.mock('../../../src/lib/videoThumbnails', async importOriginal => ({
  ...await importOriginal<object>(), captureVideoThumbnails: capture,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../src/components/timeline/PlayheadHandle', () => ({ PlayheadHandle: () => null }));
function clip(id: string, startTime: number, sourceId?: string): VideoClip {
  return { id, startTime, sourceId, sourceOffset: 3, duration: 5, fadeIn: 0, fadeOut: 0, transition: 'cut', transitionDuration: 0 };
}
beforeEach(() => {
  Object.assign(window, { __TAURI_INTERNALS__: {} });
  capture.mockReset().mockImplementation(async (path, _duration, _signal, publish) => publish([{time: 0, url: `${path}.jpg`}]));
  const initial = useProjectStore.getInitialState();
  useProjectStore.setState({ ...initial, project: { ...initial.project, duration: 10, video: {
    path: '/a.mp4', duration: 12, session: {} as never,
    sources: [{ id: 'b', path: '/b.mp4', name: 'B', duration: 12 }],
    clips: [clip('a', 0), clip('b', 5, 'b')],
  } } });
});
afterEach(() => { cleanup(); Reflect.deleteProperty(window, '__TAURI_INTERNALS__'); });
describe('multiple camera filmstrips', () => {
  it('keeps both camera images through selection changes and draws trimmed starts', async () => {
    let root!: ReturnType<typeof render>;
    await act(async () => { root = render(<VideoLane width={1000}/>); });
    expect([...root.container.querySelectorAll('img')].map(img => img.getAttribute('src'))).toEqual(['/a.mp4.jpg', '/b.mp4.jpg']);
    expect([...root.container.querySelectorAll('img')].every(img => img.style.left === '0px')).toBe(true);
    await act(async () => { useProjectStore.getState().setSelection({startTime: 5, endTime: 10, segmentIds: ['b']}); });
    expect(root.container.querySelectorAll('img')).toHaveLength(2);
    expect(capture).toHaveBeenCalledTimes(2);
  });
  it('runs one background decoder at a time and cancels the queue on unmount', async () => {
    let complete!: () => void;
    let signal!: AbortSignal;
    capture.mockImplementation((_path, _duration, jobSignal) => { signal = jobSignal; return new Promise<void>(resolve => { complete = resolve; }); });
    let root!: ReturnType<typeof render>;
    await act(async () => { root = render(<VideoLane width={1000}/>); });
    expect(capture).toHaveBeenCalledTimes(1);
    root.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { complete(); });
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
