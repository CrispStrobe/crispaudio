import { act,render,fireEvent,screen,cleanup } from '@testing-library/react';
import { afterEach,beforeEach,it,expect,vi } from 'vitest';
import { VideoTransformControls } from '../../../src/components/timeline/VideoTransformControls';
import { useProjectStore } from '../../../src/stores/projectStore';
import type { VideoClip } from '../../../src/types/audio';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
beforeEach(()=>{
 const state=useProjectStore.getInitialState();
 const clip: VideoClip={id:'a',startTime:0,sourceOffset:0,duration:2,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0};
 useProjectStore.setState({...state,project:{...state.project,video:{path:'/camera.mp4',duration:4,session:{} as never,clips:[clip,{...clip,id:'b',startTime:2}]}},selection:{startTime:0,endTime:4,segmentIds:['a','b']}});
 useProjectStore.temporal.getState().clear();
});
afterEach(cleanup);
it('rotates, mirrors, copies and resets independently with undo',()=>{
 render(<VideoTransformControls id="a"/>);
 fireEvent.click(screen.getByRole('button',{name:'videoTransform.left'}));
 fireEvent.click(screen.getByRole('button',{name:'videoTransform.horizontal'}));
 let clips=useProjectStore.getState().project.video!.clips!;
 expect(clips[0].transform).toEqual({rotation:270,flipHorizontal:true,flipVertical:false});
 fireEvent.click(screen.getByRole('button',{name:'videoTransform.copy'}));
 clips=useProjectStore.getState().project.video!.clips!;expect(clips[1].transform).toEqual(clips[0].transform);
 fireEvent.click(screen.getByRole('button',{name:'videoTransform.reset'}));
 expect(useProjectStore.getState().project.video!.clips![0].transform).toBeUndefined();
 act(()=>useProjectStore.temporal.getState().undo());
 expect(useProjectStore.getState().project.video!.clips![0].transform!.rotation).toBe(270);
 for(let i=0;i<4;i++)fireEvent.click(screen.getByRole('button',{name:'videoTransform.right'}));
 expect(useProjectStore.getState().project.video!.clips![0].transform!.rotation).toBe(270);
});
