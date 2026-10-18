import {beforeEach,expect,it,vi} from 'vitest';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {NativeRecordingRecovery} from '../../../src/components/timeline/NativeRecordingRecovery';
import {useProjectStore} from '../../../src/stores/projectStore';
const mocks=vi.hoisted(()=>({discover:vi.fn(),review:vi.fn(),insert:vi.fn()}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('../../../src/audio/plugins/NativeRecordingRecovery',()=>({NativeRecordingRecovery:{discover:mocks.discover,review:mocks.review,insert:mocks.insert}}));
const props={context:()=>({}as BaseAudioContext),disabled:false,crossfade:0,onBusy:vi.fn()};
const candidate={kind:'interrupted',group:'native-group-fixture',projectId:'recovery-ui',tracks:['a'],importId:'boot/run',outputEndFrame:8192,recovered:false};
beforeEach(()=>{vi.clearAllMocks();const base=useProjectStore.getInitialState().project;useProjectStore.getState().loadProjectState({...base,id:'recovery-ui',tracks:[{id:'a',name:'Voice',segments:[],recordArmed:true,volume:1,pan:0,solo:false,muted:false}]},new Map());useProjectStore.setState({isPlaying:false});useProjectStore.temporal.getState().clear();mocks.discover.mockResolvedValue({candidates:[candidate],scanned:1,rejected:0,truncated:false});mocks.review.mockImplementation(async()=>({candidate,snapshot:useProjectStore.getState().project,result:{incomplete:true,manifest:{clips:[{track_id:'a'}],timing:{placements:[{trackId:'a',frames:24000}]}}}}));mocks.insert.mockImplementation(()=>({project:{...useProjectStore.getState().project,nativeRecordingImports:['boot/run']},sources:new Map()}));});
async function scan(){fireEvent.click(screen.getByText('recording.recovery'));fireEvent.click(screen.getByRole('button',{name:'recording.recoveryScan'}));await screen.findByText('Voice');await waitFor(()=>expect(screen.getByRole('button',{name:'recording.recoveryReview'})).toBeEnabled());}
it('keeps recovery collapsed, requires Review before Import and publishes once with Undo',async()=>{
 const original=useProjectStore.getState().project;const view=render(<NativeRecordingRecovery {...props}/>);expect(view.container.querySelector('details')).not.toHaveAttribute('open');expect(mocks.discover).not.toHaveBeenCalled();await scan();expect(screen.queryByRole('button',{name:'recording.recoveryImport'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'recording.recoveryReview'}));await screen.findByText('recording.recoveryVerifiedPrefix');expect(useProjectStore.getState().project).toBe(original);
 fireEvent.click(screen.getByRole('button',{name:'recording.recoveryImport'}));expect(mocks.insert).toHaveBeenCalledTimes(1);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);expect(screen.getByText('recording.recoveryAlreadyImported')).toBeInTheDocument();act(()=>useProjectStore.temporal.getState().undo());expect(useProjectStore.getState().project).toBe(original);
});
it('shows unavailable target reasons and bounded-search warnings without permitting import',async()=>{
 useProjectStore.setState({project:{...useProjectStore.getState().project,tracks:[]}});mocks.discover.mockResolvedValue({candidates:[candidate],scanned:512,rejected:2,truncated:true});render(<NativeRecordingRecovery {...props}/>);fireEvent.click(screen.getByText('recording.recovery'));fireEvent.click(screen.getByRole('button',{name:'recording.recoveryScan'}));await screen.findByText('recording.recoveryTruncated');expect(screen.getByRole('button',{name:'recording.recoveryReview'})).toBeDisabled();expect(screen.getByText('recording.recoveryRejected')).toBeInTheDocument();expect(mocks.review).not.toHaveBeenCalled();
});
it('discards late review after closing and never publishes on verification failure',async()=>{
 let resolve!:(v:unknown)=>void;mocks.review.mockReturnValue(new Promise(r=>{resolve=r;}));const view=render(<NativeRecordingRecovery {...props}/>);await scan();fireEvent.click(screen.getByRole('button',{name:'recording.recoveryReview'}));const signal=mocks.review.mock.calls[0][4]as AbortSignal;view.unmount();expect(signal.aborted).toBe(true);await act(async()=>resolve({candidate,result:{}}));expect(mocks.insert).not.toHaveBeenCalled();expect(props.onBusy).toHaveBeenLastCalledWith(false);
});
it('blocks recovery during playback or active recording',()=>{
 useProjectStore.setState({isPlaying:true});const view=render(<NativeRecordingRecovery {...props}/>);fireEvent.click(screen.getByText('recording.recovery'));expect(screen.getByRole('button',{name:'recording.recoveryScan'})).toBeDisabled();act(()=>useProjectStore.setState({isPlaying:false}));view.rerender(<NativeRecordingRecovery {...props} disabled/>);expect(screen.getByRole('button',{name:'recording.recoveryScan'})).toBeDisabled();
});
