import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForPreviewFrame } from '../../../src/lib/videoTransport';
import { clearPreviewCache } from '../../../src/lib/previewCache';
import { VideoViewer } from '../../../src/components/timeline/VideoViewer';
import { useProjectStore } from '../../../src/stores/projectStore';
const native=vi.hoisted(()=>({invoke:vi.fn(),setFullscreen:vi.fn().mockResolvedValue(undefined)}));
vi.mock('@tauri-apps/api/core',()=>({invoke:native.invoke,convertFileSrc:(path:string)=>path}));
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>({isFullscreen:async()=>false,setFullscreen:native.setFullscreen})}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('../../../src/components/timeline/VideoControls',()=>({VideoControls:()=>null}));
let notifyResize:()=>void=()=>{};
beforeEach(()=>{
  vi.stubGlobal('ResizeObserver',class { constructor(callback:()=>void){notifyResize=callback;} observe(){} disconnect(){} });
  clearPreviewCache();
  native.invoke.mockReset().mockResolvedValue('/camera.mp4');native.setFullscreen.mockReset().mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
  Object.assign(window,{__TAURI_INTERNALS__:{}});
  const initial=useProjectStore.getInitialState();
  useProjectStore.setState({...initial,project:{...initial.project,video:{path:'/camera.mp4',duration:10,session:{} as never}},playheadPosition:4});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();Reflect.deleteProperty(window,'__TAURI_INTERNALS__');Reflect.deleteProperty(document,'fullscreenElement');Reflect.deleteProperty(document,'exitFullscreen');Reflect.deleteProperty(document.documentElement,'requestFullscreen');});
describe('video viewer lifecycle',()=>{
  it('refits rotated picture on resize',async()=>{
    useProjectStore.setState(state=>({project:{...state.project,video:{...state.project.video!,clips:[{id:'v',startTime:0,duration:10,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0,transform:{rotation:90,flipHorizontal:true,flipVertical:false}}]}}}));
    await act(async()=>{render(<VideoViewer/>);});
    const video=screen.getByLabelText('interview.preview') as HTMLVideoElement;
    Object.defineProperties(video,{readyState:{value:1},duration:{value:10},videoWidth:{value:1920},videoHeight:{value:1080},clientWidth:{value:320,configurable:true},clientHeight:{value:180,configurable:true}});
    fireEvent.loadedMetadata(video);
    expect(video.style.transform).toBe('scale(0.5625) scale(-1, 1) rotate(90deg)');
    Object.defineProperties(video,{clientWidth:{value:180},clientHeight:{value:320}});
    act(()=>notifyResize());
    expect(video.style.transform).toBe('scale(1.7777777777777777) scale(-1, 1) rotate(90deg)');
  });

  it('keeps wipe direction in composition axes when the source is rotated',async()=>{
    const base={sourceOffset:0,duration:6,fadeIn:0,fadeOut:0,transitionDuration:0};
    useProjectStore.setState(state=>({playheadPosition:5,project:{...state.project,video:{...state.project.video!,clips:[{...base,id:'a',startTime:0,transition:'cut'},{...base,id:'b',startTime:4,transition:'wipeleft',transitionDuration:2,transform:{rotation:90,flipHorizontal:false,flipVertical:false}}]}}}));
    await act(async()=>{render(<VideoViewer/>);});
    const video=screen.getByLabelText('interview.preview') as HTMLVideoElement;
    Object.defineProperties(video,{readyState:{value:1},duration:{value:10},videoWidth:{value:1920},videoHeight:{value:1080},clientWidth:{value:320},clientHeight:{value:180}});
    fireEvent.loadedMetadata(video);
    expect(video.style.transform).toContain('rotate(90deg)');
    expect(video.style.clipPath).toBe('');
    expect(video.parentElement!.style.clipPath).toBe('inset(0 0 0 50%)');
    expect(video.parentElement!.style.transform).toBe('none');
  });
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
    let host:HTMLElement;await act(async()=>{host=render(<div style={{transform:'translateX(0)'}}><VideoViewer/></div>).container;});
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'video.fullscreen',exact:true}));});
    const overlay=screen.getByRole('button',{name:'editor.closeViewer',exact:true}).closest('.fixed');
    expect(overlay?.parentElement).toBe(document.body);
    expect(host!.contains(overlay)).toBe(false);
    expect(native.setFullscreen).toHaveBeenCalledWith(true);
    await act(async()=>{fireEvent.keyDown(document,{key:'Escape'});});
    expect(native.setFullscreen).toHaveBeenCalledWith(false);
  });
  it('shows intentional black immediately when opening at a gap without loading a source',async()=>{
    useProjectStore.setState(state=>({project:{...state.project,minimumDuration:15,duration:15},playheadPosition:12}));
    const {container}=render(<VideoViewer/>);
    expect(container.querySelector('[data-video-frame]')).toBeTruthy();
    expect(screen.getByText('video.noPicture')).toBeTruthy();
    expect(container.querySelector('[data-preview-loading=true]')).toBeNull();
    await expect(waitForPreviewFrame(new AbortController().signal)).resolves.toBeUndefined();
    expect(native.invoke).not.toHaveBeenCalled();
  });
  it('keeps a decoded secondary source hidden through gaps without falling back to the original',async()=>{
    useProjectStore.setState(state=>({project:{...state.project,video:{...state.project.video!,sources:[{id:'second',path:'/second.mp4',name:'second',duration:10}],clips:[{id:'v',sourceId:'second',startTime:6,duration:3,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0}]}},playheadPosition:7}));
    await act(async()=>{render(<VideoViewer/>);});
    const video=screen.getByLabelText('interview.preview') as HTMLVideoElement;
    expect(native.invoke).toHaveBeenCalledWith('prepare_video_preview',{path:'/second.mp4'});
    await act(async()=>{useProjectStore.getState().setPlayheadPosition(4);});
    expect(screen.getByLabelText('interview.preview')).toBe(video);
    expect(video.style.opacity).toBe('0');
    await expect(waitForPreviewFrame(new AbortController().signal)).resolves.toBeUndefined();
    await act(async()=>{useProjectStore.getState().setPlayheadPosition(7);});
    expect(video.style.opacity).toBe('1');
    expect(native.invoke).toHaveBeenCalledTimes(1);
  });
  it('steps within the extended canvas while fullscreen stays open in a black tail',async()=>{
    useProjectStore.setState(state=>({project:{...state.project,minimumDuration:15,duration:15},playheadPosition:12}));
    await act(async()=>{render(<VideoViewer/>);});
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'video.fullscreen',exact:true}));});
    fireEvent.click(screen.getByRole('button',{name:'video.stepForward'}));
    expect(useProjectStore.getState().playheadPosition).toBeCloseTo(12.04);
    expect(screen.getByRole('button',{name:'editor.closeViewer',exact:true}).closest('.fixed')).toBeTruthy();
  });
  it('exits a browser fullscreen request which completes after the viewer was closed',async()=>{
    await act(async()=>{render(<VideoViewer/>);});
    Reflect.deleteProperty(window,'__TAURI_INTERNALS__');
    let finish!:()=>void;
    const request=new Promise<void>(resolve=>{finish=resolve;}),exit=vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement,'requestFullscreen',{configurable:true,value:()=>request});
    Object.defineProperty(document,'exitFullscreen',{configurable:true,value:exit});
    fireEvent.click(screen.getByRole('button',{name:'video.fullscreen'}));
    fireEvent.click(screen.getByRole('button',{name:'editor.closeViewer'}));
    Object.defineProperty(document,'fullscreenElement',{configurable:true,value:document.documentElement});
    await act(async()=>{finish();await request;});
    expect(exit).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button',{name:'editor.closeViewer'})).toBeNull();
  });
  it('shows fullscreen failure inside the expanded viewer',async()=>{
    native.setFullscreen.mockRejectedValueOnce(new Error('Unavailable'));
    await act(async()=>{render(<VideoViewer/>);});
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'video.fullscreen',exact:true}));});
    expect(screen.getByText('usability.fullscreenFallback').closest('.fixed')).toBeTruthy();
  });

  it('owns viewer keyboard shortcuts, traps Tab and returns focus on close',async()=>{
    await act(async()=>{render(<VideoViewer/>);});
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'video.fullscreen'}));});
    const close=screen.getByRole('button',{name:'editor.closeViewer'}),play=screen.getByRole('button',{name:'timeline.play'});
    expect(close).toHaveFocus();
    const globalKey=vi.fn();window.addEventListener('keydown',globalKey);
    try{
      fireEvent.keyDown(close,{key:'ArrowRight',code:'ArrowRight'});
      expect(useProjectStore.getState().playheadPosition).toBeCloseTo(4.04);
      fireEvent.keyDown(close,{key:'Delete',code:'Delete'});
      fireEvent.keyDown(close,{key:' ',code:'Space'});
      expect(useProjectStore.getState().isPlaying).toBe(true);
      expect(globalKey).not.toHaveBeenCalled();
      fireEvent.keyDown(close,{key:'Tab',code:'Tab'});expect(play).toHaveFocus();
      fireEvent.keyDown(play,{key:'Tab',code:'Tab',shiftKey:true});expect(close).toHaveFocus();
      await act(async()=>{fireEvent.keyDown(close,{key:'Escape',code:'Escape'});});
      expect(screen.getByRole('button',{name:'video.fullscreen'})).toHaveFocus();
      expect(screen.queryByRole('dialog')).toBeNull();
    }finally{window.removeEventListener('keydown',globalKey);}
  });

});
