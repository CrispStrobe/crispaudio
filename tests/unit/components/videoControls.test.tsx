import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoControls } from '../../../src/components/timeline/VideoControls';
import { useProjectStore } from '../../../src/stores/projectStore';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
beforeEach(() => {
  const initial = useProjectStore.getInitialState();
  useProjectStore.setState({ ...initial, project: { ...initial.project, video: {
    path: '/video.mp4', duration: 254, inPoint: 30, outPoint: 254, session: {} as never,
  } } });
});
afterEach(cleanup);
describe('video range entry', () => {
  it('allows intermediate digits before committing an end after the start', () => {
    render(<VideoControls />);
    fireEvent.click(screen.getByRole('button',{name:'video.range'}));
    const end = screen.getByLabelText('video.out');
    fireEvent.focus(end);
    fireEvent.change(end, { target: { value: '1' } });
    expect(end).toHaveValue(1);
    fireEvent.change(end, { target: { value: '123' } });
    fireEvent.blur(end);
    expect(useProjectStore.getState().project.video?.outPoint).toBe(123);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('rejects an invalid end visibly and restores the valid range', () => {
    render(<VideoControls />);
    fireEvent.click(screen.getByRole('button',{name:'video.range'}));
    const end = screen.getByLabelText('video.out');
    fireEvent.focus(end); fireEvent.change(end, { target: { value: '2' } }); fireEvent.blur(end);
    expect(useProjectStore.getState().project.video?.outPoint).toBe(254);
    expect(screen.getByRole('alert')).toHaveTextContent('video.invalidRange');
    expect(end).toHaveValue(254);
  });
});
