import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {useUIStore} from '../../../src/stores/uiStore';
const bridge=vi.hoisted(()=>({handler:undefined as undefined|((event:{payload:{type:string;paths?:string[]}})=>void),stop:vi.fn()}));
vi.mock('../../../src/lib/native',()=>({isTauri:()=>true,isIOSApp:()=>false}));
vi.mock('@tauri-apps/api/webview',()=>({getCurrentWebview:()=>({onDragDropEvent:vi.fn(async(handler:typeof bridge.handler)=>{bridge.handler=handler;return bridge.stop;})})}));
import {useMediaDrop} from '../../../src/hooks/useMediaDrop';
beforeEach(()=>{bridge.handler=undefined;bridge.stop.mockClear();useUIStore.setState({activePanel:'sfx',activeModal:'settings',pendingDroppedPaths:[]});});
it('accepts Finder MP4 paths from any panel without reading the entire video into JS',async()=>{
 const {result,unmount}=renderHook(useMediaDrop);await waitFor(()=>expect(bridge.handler).toBeDefined());
 act(()=>bridge.handler!({payload:{type:'enter'}}));expect(result.current).toBe(true);
 act(()=>bridge.handler!({payload:{type:'drop',paths:['/tmp/Camera.MP4']}}));
 expect(result.current).toBe(false);expect(useUIStore.getState()).toMatchObject({activePanel:'timeline',activeModal:null,pendingDroppedPaths:['/tmp/Camera.MP4']});
 unmount();expect(bridge.stop).toHaveBeenCalledOnce();
 act(()=>bridge.handler!({payload:{type:'drop',paths:['/tmp/ignored.mp4']}}));expect(useUIStore.getState().pendingDroppedPaths).toEqual(['/tmp/Camera.MP4']);
});
