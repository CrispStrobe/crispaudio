import { useEffect } from 'react';
import type { RefObject } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import type { TimelineEngine } from '../audio/engine/TimelineEngine';
import { TimelineMetronome } from '../audio/engine/TimelineMetronome';
import type { AudioEngineHandle } from './useAudioEngine';
export function useTimelineMetronome(engineRef: RefObject<TimelineEngine | null>, audio: AudioEngineHandle) {
    const playing = useProjectStore(s => s.isPlaying), music = useProjectStore(s => s.project.music);
    const recording = useUIStore(s => s.timelineRecording);
    useEffect(() => {
        const engine = engineRef.current;
        if (!engine || !playing || recording || !music?.metronome || music.clickLevel === 0)
            return;
        let metronome: TimelineMetronome | undefined;
        const restart = () => {
            metronome?.stop(); metronome = undefined;
            const clock = engine.monitorPlaybackClock();
            if (!clock || !useProjectStore.getState().isPlaying || useUIStore.getState().timelineRecording)
                return;
            metronome = new TimelineMetronome(audio.getContext(), audio.masterGain, music, clock.anchor, clock.end, clock.loop);
            metronome.start();
        };
        const unsubscribe = engine.onPlaybackClock(restart);
        restart();
        return () => { unsubscribe(); metronome?.stop(); };
    }, [engineRef, audio, playing, music, recording]);
}
