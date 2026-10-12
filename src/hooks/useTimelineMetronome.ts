import { useEffect } from 'react';
import type { RefObject } from 'react';
import { useProjectStore } from '../stores/projectStore';
import type { TimelineEngine } from '../audio/engine/TimelineEngine';
import { TimelineMetronome } from '../audio/engine/TimelineMetronome';
import type { AudioEngineHandle } from './useAudioEngine';
export function useTimelineMetronome(engineRef: RefObject<TimelineEngine | null>, audio: AudioEngineHandle) {
    const playing = useProjectStore(s => s.isPlaying), music = useProjectStore(s => s.project.music);
    useEffect(() => {
        const engine = engineRef.current;
        if (!engine || !playing || !music?.metronome || music.clickLevel === 0)
            return;
        let metronome: TimelineMetronome | undefined;
        const restart = () => { metronome?.stop(); metronome = undefined; const state = useProjectStore.getState(), anchor = engine.playbackAnchor(); if (!anchor || !state.isPlaying)
            return; const end = state.rangePlayback ? state.project.editRange?.end ?? state.project.duration : state.project.duration; metronome = new TimelineMetronome(audio.getContext(), audio.masterGain, music, anchor, end); metronome.start(); };
        const unsubscribe = engine.onPlaybackClock(restart);
        restart();
        return () => { unsubscribe(); metronome?.stop(); };
    }, [engineRef, audio, playing, music]);
}
