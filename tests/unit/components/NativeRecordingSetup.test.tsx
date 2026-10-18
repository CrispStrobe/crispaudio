import {beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {NativeRecordingSetup} from '../../../src/components/timeline/NativeRecordingSetup';
import {useSettingsStore} from '../../../src/stores/settingsStore';
const mocks=vi.hoisted(()=>({inputs:vi.fn(),outputs:vi.fn()}));
vi.mock('react-i18next',async importOriginal=>({...await importOriginal<typeof import('react-i18next')>(),useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('../../../src/audio/plugins/NativeTimelineRecording',()=>({NativeTimelineRecording:{inputs:mocks.inputs}}));
vi.mock('../../../src/lib/audioOutput',()=>({playbackOutputs:mocks.outputs}));
beforeEach(()=>{vi.clearAllMocks();useSettingsStore.setState({nativeRecording:false,nativeRecordingOutput:''});mocks.inputs.mockResolvedValue({permission:'Authorized',devices:[{uid:'native-mic',label:'Mac microphone',channels:2,nominalRate:48000,isDefault:true}]});mocks.outputs.mockResolvedValue({devices:[{id:'native-speakers',label:'Mac speakers',isDefault:true}]});});
it('keeps routing collapsed until native is chosen, then supports input/channel/output selection',async()=>{
 const onChange=vi.fn(),disconnect=vi.fn();render(<NativeRecordingSetup input={{deviceId:'browser-opaque',channel:'mono',monitor:false,countIn:0,latencyMs:500}} disabled={false} onChange={onChange} onError={vi.fn()} onEngineChange={disconnect}/>);
 expect(screen.queryByLabelText('recording.nativeOutput')).not.toBeInTheDocument();expect(screen.queryByText('recording.nativeEngineHelp')).not.toBeInTheDocument();
 fireEvent.change(screen.getByRole('combobox',{name:'recording.engine'}),{target:{value:'native'}});await waitFor(()=>expect(screen.getByRole('option',{name:'Mac microphone'})).toBeInTheDocument());expect(disconnect).toHaveBeenCalledTimes(1);
 fireEvent.change(screen.getByRole('combobox',{name:'recording.device'}),{target:{value:'native-mic'}});expect(onChange).toHaveBeenCalledWith({native:{device:'native-mic',channels:[0]}});
 fireEvent.change(screen.getByRole('combobox',{name:'recording.channel'}),{target:{value:'0,1'}});expect(onChange).toHaveBeenCalledWith({native:{device:'',channels:[0,1]}});
 fireEvent.change(screen.getByRole('combobox',{name:'recording.nativeOutput'}),{target:{value:'native-speakers'}});expect(useSettingsStore.getState().nativeRecordingOutput).toBe('native-speakers');
 expect(screen.getByText('recording.timing').closest('details')).not.toHaveAttribute('open');
});
it('shows unavailable saved UIDs and keeps controls disabled while recording',async()=>{
 useSettingsStore.setState({nativeRecording:true,nativeRecordingOutput:'old-output'});const onChange=vi.fn();render(<NativeRecordingSetup input={{deviceId:'browser-opaque',channel:'mono',monitor:false,countIn:0,latencyMs:500,native:{device:'old-input',channels:[7]}}} disabled onChange={onChange} onError={vi.fn()} onEngineChange={vi.fn()}/>);
 expect(screen.getByRole('combobox',{name:'recording.device'})).toHaveValue('old-input');expect(screen.getByRole('combobox',{name:'recording.nativeOutput'})).toHaveValue('old-output');expect(screen.getByRole('combobox',{name:'recording.engine'})).toBeDisabled();expect(screen.getByRole('combobox',{name:'recording.channel'})).toBeDisabled();expect(screen.getByRole('spinbutton',{name:'recording.nativeCorrection'})).toBeDisabled();
});
