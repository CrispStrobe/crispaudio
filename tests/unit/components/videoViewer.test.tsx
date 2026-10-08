import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPreviewCache } from '../../../src/lib/previewCache';
import { VideoViewer } from '../../../src/components/timeline/VideoViewer';
import { useProjectStore } from '../../../src/stores/projectStore';
const native=vi.hoisted(()=>({invoke:vi.fn(),setFullscreen:vi.fn().mockResolvedValue(undefined)}));
vi.mock('@tauri-apps/api/core',()=>({invoke:native.invoke,convertFileSrc:(path:string)=>path}));
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>({isFullscreen:async()=>false,setFullscreen:native.setFullscreen})}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('../../../src/components/timeline/VideoControls',()=>({VideoControls:()=>null}));
beforeEach(()=>{
  clearPreviewCache();
  native.invoke.mockReset().mockResolvedValue('/camera.mp4');native.setFullscreen.mockClear();
  vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
  Object.assign(window,{__TAURI_INTERNALS__:{}});
  const initial=useProjectStore.getInitialState();
  useProjectStore.setState({...initial,project:{...initial.project,video:{path:'/camera.mp4',duration:10,session:{} as never}},playheadPosition:4});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();Reflect.deleteProperty(window,'__TAURI_INTERNALS__');});
describe('video viewer lifecycle',()=>{
  it('waits for metadata before seeking, then synchronizes the current position',async()=>{
    await act(async()=>{render(<VideoViewer/>);});
    const video=screen.getByLabelText('interview.preview') as HTMLVideoElement;
    expect(video.currentTime).toBe(0);
    Object.defineProperty(video,'readyState',{value:1});Object.defineProperty(video,'duration',{value:10});
    fireEvent.loadedMetadata(video);expect(video.currentTime).toBe(4);
  });
  it('retries a transient first failure with a new media element',async()=>{
    vi.useFakeTimers();await act(async()=>{render(<VideoViewer/>);});
    const first=screen.getByLabelText('interview.preview');fireEvent.error(first);
    await act(async()=>{vi.advanceTimersByTime(501);});
    expect(native.invoke).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('interview.preview')).not.toBe(first);
  });
  it('expands visibly and restores native fullscreen on Escape',async()=>{
    await act(async()=>{render(<VideoViewer/>);});
    await act(async()=>{fireEvent.click(screen.getByText('video.fullscreen'));});
    expect(screen.getByText('editor.closeViewer').closest('.fixed')).toBeTruthy();
    expect(native.setFullscreen).toHaveBeenCalledWith(true);
    await act(async()=>{fireEvent.keyDown(document,{key:'Escape'});});
    expect(native.setFullscreen).toHaveBeenCalledWith(false);
  });
});
