import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectOverview } from '../../../src/components/timeline/ProjectOverview';
import { useProjectStore } from '../../../src/stores/projectStore';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const initial = useProjectStore.getInitialState();
  useProjectStore.setState({...initial,zoomLevel: 100,scrollOffset: 2,project: {...initial.project,
    video: {path: '/camera.mp4',duration: 10,session: {} as never},
  }});
});
afterEach(() => { cleanup();vi.unstubAllGlobals(); });
describe('separate whole-project navigation', () => {
  it('shows the visible interval independently of zoomed editing rows', () => {
    const {container} = render(<ProjectOverview viewportWidth={500}/>);
    const viewport=container.querySelector<HTMLElement>('[data-overview-window]')!;
    expect(viewport.style.left).toBe('20%');
    expect(viewport.style.width).toBe('50%');
    act(() => { useProjectStore.getState().setZoomLevel(200); });
    expect(viewport.style.width).toBe('25%');
  });
  it('supports keyboard browsing without moving any clip or the playback position', () => {
    const project=useProjectStore.getState().project;
    render(<ProjectOverview viewportWidth={500}/>);
    const navigation=screen.getByRole('slider',{name:'editing.visibleTimelineRange'});
    fireEvent.keyDown(navigation,{key:'ArrowRight'});
    expect(useProjectStore.getState().scrollOffset).toBe(2.5);
    fireEvent.keyDown(navigation,{key:'End'});
    expect(useProjectStore.getState().scrollOffset).toBe(5);
    fireEvent.keyDown(navigation,{key:'Home'});
    expect(useProjectStore.getState().scrollOffset).toBe(0);
    expect(useProjectStore.getState().project).toBe(project);
    expect(useProjectStore.getState().playheadPosition).toBe(0);
  });
});
