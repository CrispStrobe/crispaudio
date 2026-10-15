import {useEffect,useRef} from 'react';
import {useTimelineTransport} from '../../src/hooks/useTimelineTransport';
import {useAudioEngine} from '../../src/hooks/useAudioEngine';
import {TimelineEngine} from '../../src/audio/engine/TimelineEngine';
import {TransportControls} from '../../src/components/timeline/TransportControls';
import {TimelineRecording} from '../../src/components/timeline/TimelineRecording';
export function NativeRenderedHarness(){
 const audio=useAudioEngine(),engine=useRef<TimelineEngine|null>(null);
 useEffect(()=>{audio.masterGain.gain.setValueAtTime(0,audio.getContext().currentTime);engine.current=new TimelineEngine(audio.getContext(),audio.masterGain);return()=>{engine.current?.stop();engine.current=null;};},[audio]);
 useTimelineTransport(engine,audio);return <TransportControls recordingControls={<TimelineRecording engine={engine} audio={audio}/>}/>;
}
