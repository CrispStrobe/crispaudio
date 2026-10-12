import {HelpDetails} from '../common/HelpDetails';
import {useTimelineTool} from '../../hooks/useTimelineTool';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import { NumberField } from './NumberField';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { DEFAULT_MUSIC, gridSeconds, barSeconds } from '../../lib/musicalTime';
import { EMPTY_MIDI, MidiCapture, prepareMidiClip, quantizeMidi, validMidiPattern, type MidiNote, type MidiPattern } from '../../lib/midiPattern';
import { openMidiInputs, type MidiAccessHandle, type MidiInputPort } from '../../lib/midiInput';
import { encodeMidiFile, saveMidiFile } from '../../lib/midiFile';
import { MidiTransportCapture } from '../../lib/midiTransportCapture';
import { TimelineEngineContext } from './timelineEngineContext';
import { MidiAudition } from '../../audio/engine/MidiAudition';
import type { AudioEngineHandle } from '../../hooks/useAudioEngine';
export function MidiControls({ audio, launcher = true }: {
    launcher?: boolean;
    audio: AudioEngineHandle;
}) {
    const { t } = useTranslation(), [open, setOpen] = useState(false);
    useTimelineTool('midi',()=>{setOpen(true);});
    return <>{launcher && <button className="timeline-tool" onClick={() => setOpen(true)}>{t('midi.title')}</button>}<Modal isOpen={open} onClose={() => setOpen(false)} title={t('midi.title')} widthClass="max-w-4xl">{open && <MidiEditor audio={audio} onClose={() => setOpen(false)}/>}</Modal></>;
}
function MidiEditor({ audio, onClose }: {
    audio: AudioEngineHandle;
    onClose: () => void;
}) {
    const { t } = useTranslation(), project = useProjectStore(s => s.project), playing = useProjectStore(s => s.isPlaying), recording = useUIStore(s => s.timelineRecording), selection = useProjectStore(s => s.selection);
    const initial = useRef(project), selected = project.tracks.flatMap(t => t.segments).find(c => selection?.segmentIds.includes(c.id) && c.midi), [replaceId, setReplaceId] = useState(selected?.id ?? ''), [trackId, setTrackId] = useState(selected?.trackId ?? project.tracks.find(t => !t.locked && t.kind !== 'bus')?.id ?? 'new'), [position, setPosition] = useState(useProjectStore.getState().playheadPosition), [pattern, setPattern] = useState<MidiPattern>(() => structuredClone(selected?.midi ?? EMPTY_MIDI)), [noteId, setNoteId] = useState(''), [base, setBase] = useState(48), [step, setStep] = useState(gridSeconds(project.music ?? DEFAULT_MUSIC) || 30 / (project.music ?? DEFAULT_MUSIC).tempo), [error, setError] = useState(''), [ports, setPorts] = useState<MidiInputPort[]>([]), [portId, setPortId] = useState(''), [connected, setConnected] = useState(false), [connecting, setConnecting] = useState(false), [capturing, setCapturing] = useState(false), [busy, setBusy] = useState(false), [count, setCount] = useState(0);
    const engine = useContext(TimelineEngineContext), [transportReady, setTransportReady] = useState(false);
    const reviewedClip = useRef(selected);
    const access = useRef<MidiAccessHandle | null>(null), disconnect = useRef<(() => Promise<void>) | null>(null), audition = useRef<MidiAudition | null>(null), capture = useRef<{
        recorder: MidiCapture;
        start: number;
        transport?: MidiTransportCapture;
    } | null>(null), disposed = useRef(false), operation = useRef(0), connectionPending = useRef(false), draft = useRef(pattern), heldKeys = useRef(new Set<number>()), focused = useRef(true), publishing = useRef(false);
    useEffect(() => { draft.current = pattern; }, [pattern]);
    const finishCapture = useCallback(() => { const active = capture.current; if (active) {
        const elapsed = audio.getContext().currentTime - active.start;
        const notes = active.transport ? active.transport.stop(undefined, elapsed) : active.recorder.stop(elapsed);
        capture.current = null;
        setPattern(p => ({ ...p, notes: [...p.notes, ...notes] }));
        setCapturing(false);
        setCount(notes.length);
    } }, [audio]);
    const panic = () => { heldKeys.current.clear(); audition.current?.stop(); audition.current = null; finishCapture(); };
    useEffect(() => { disposed.current = false; const focus = () => { focused.current = true; }; const blur = () => { focused.current = false; heldKeys.current.clear(); audition.current?.stop(); audition.current = null; const active = capture.current; if (active) {
        const elapsed = audio.getContext().currentTime - active.start;
        const notes = active.transport ? active.transport.stop(undefined, elapsed) : active.recorder.stop(elapsed);
        capture.current = null;
        setPattern(p => ({ ...p, notes: [...p.notes, ...notes] }));
        setCapturing(false);
    } }; window.addEventListener('blur', blur); window.addEventListener('focus', focus); return () => { disposed.current = true; window.removeEventListener('blur', blur); window.removeEventListener('focus', focus); audition.current?.stop(); capture.current = null; void disconnect.current?.().catch(() => { }); access.current?.close(); }; }, [audio]);
    useEffect(() => {
        const current = engine?.current;
        const changed = () => {
            setTransportReady(!!current?.automationClock());
            const active = capture.current;
            if (active?.transport && !active.transport.tick(current?.automationClock())) {
                finishCapture();
                audition.current?.stop();
                audition.current = null;
            }
        };
        changed();
        return current?.onPlaybackClock(changed);
    }, [engine, audio, finishCapture]);
    const receive = (data: number[]) => { if (!focused.current)
        return; const active = capture.current;
        if (active?.transport && !active.transport.message(data, engine?.current?.automationClock())) {
            finishCapture();
            audition.current?.stop();
            audition.current = null;
            return;
        }
        if (active?.transport) setCount(active.transport.count);
        const ctx = audio.getContext(); if (!audition.current)
        audition.current = new MidiAudition(ctx, audio.masterGain, draft.current); audition.current.message(data); if (active && !active.transport) {
        const time = ctx.currentTime - active.start;
        if (time >= draft.current.length) {
            finishCapture();
            audition.current.stop();
            audition.current = null;
            return;
        }
        active.recorder.message(data, time);
        setCount(active.recorder.notes.length);
    } };
    const refresh = async () => { panic(); const previous = disconnect.current; disconnect.current = null; setConnected(false); await previous?.(); access.current?.close(); access.current = null; const generation = ++operation.current; try {
        const next = await openMidiInputs();
        if (disposed.current || generation !== operation.current) {
            next.close();
            return;
        }
        access.current = next;
        setPorts(next.ports());
        setPortId(next.ports()[0]?.id ?? '');
        setError('');
    }
    catch (e) {
        if (!disposed.current)
            setError(String(e));
    } };
    const connect = async () => { if (connectionPending.current)
        return; connectionPending.current = true; setConnecting(true); const generation = ++operation.current; try {
        await audio.resume();
        panic();
        const previous = disconnect.current;
        disconnect.current = null;
        setConnected(false);
        await previous?.();
        const stop = await access.current?.connect(portId, data => { if (!disposed.current && generation === operation.current)
            receive(data); }, () => { if (!disposed.current && generation === operation.current) {
            disconnect.current = null;
            panic();
            setConnected(false);
        } });
        if (!stop)
            return;
        if (disposed.current || generation !== operation.current) {
            await stop();
            return;
        }
        disconnect.current = stop;
        setConnected(true);
        setError('');
    }
    catch (e) {
        if (!disposed.current)
            setError(String(e));
    }
    finally {
        connectionPending.current = false;
        if (!disposed.current)
            setConnecting(false);
    } };
    const update = (patch: Partial<MidiPattern>) => { const next = { ...pattern, ...patch }; if (!validMidiPattern(next))
        return false; panic(); setPattern(next); return true; };
    const updateNote = (patch: Partial<MidiNote>) => { const next = { ...pattern, notes: pattern.notes.map(n => n.id === noteId ? { ...n, ...patch } : n) }; if (!validMidiPattern(next))
        return false; setPattern(next); return true; };
    const newPattern = () => { panic(); reviewedClip.current = undefined; setReplaceId(''); setNoteId(''); setPattern(structuredClone(EMPTY_MIDI)); };
    const loadClip = (id: string) => { panic(); const clip = project.tracks.flatMap(t => t.segments).find(c => c.id === id); if (!clip?.midi)
        return; reviewedClip.current = clip; setReplaceId(id); setTrackId(clip.trackId); setPattern(structuredClone(clip.midi)); setNoteId(''); };
    const apply = async () => { if (publishing.current)
        return; publishing.current = true; setBusy(true); try {
        const state = useProjectStore.getState();
        if (state.isPlaying || useUIStore.getState().timelineRecording)
            throw new Error(t('midi.stopFirst'));
        if (state.project !== project || state.project.id !== initial.current.id)
            throw new Error(t('midi.stale'));
        if (replaceId && state.project.tracks.flatMap(track => track.segments).find(clip => clip.id === replaceId) !== reviewedClip.current) throw new Error(t('midi.stale'));
        const result = prepareMidiClip(state.project, state.sources, pattern, trackId, position, replaceId || undefined);
        if ('__TAURI_INTERNALS__' in window) {
            const { invoke } = await import('@tauri-apps/api/core'), { encodeAudioBufferToWav } = await import('../../audio/utils/audioBufferUtils');
            const source = result.sources.get(result.clip.sourceId)!;
            source.filePath = await invoke<string>('persist_recording', new Uint8Array(encodeAudioBufferToWav(source.buffer, 32)));
        }
        const current = useProjectStore.getState();
        if (disposed.current || current.project !== state.project || current.sources !== state.sources || current.isPlaying || useUIStore.getState().timelineRecording)
            throw new Error(t('midi.stale'));
        useProjectStore.setState({ project: result.project, sources: result.sources, selection: { startTime: result.clip.startTime, endTime: result.clip.startTime + result.clip.duration, segmentIds: [result.clip.id] } });
        onClose();
    }
    catch (e) {
        if (!disposed.current) {
            setError(String(e));
            setBusy(false);
            publishing.current = false;
        }
    } };
    const quarter = 60 / (project.music ?? DEFAULT_MUSIC).tempo;
    const grids = [{value:quarter,label:t('music.quarter')},{value:quarter/2,label:t('music.eighth')},{value:quarter/4,label:t('music.sixteenth')},{value:quarter/3,label:t('music.triplet')},{value:barSeconds(project.music ?? DEFAULT_MUSIC),label:t('music.bar')},...[.125,.25,.5,1].map(value=>({value,label:`${value} s`}))].filter((grid,index,list)=>list.findIndex(other=>Math.abs(other.value-grid.value)<1e-9)===index);
    const note = pattern.notes.find(n => n.id === noteId), clips = project.tracks.flatMap(t => t.segments.filter(c => c.midi).map(c => ({ clip: c, track: t }))), disabled = playing || recording || capturing || busy;
    useEffect(() => { if (!capturing)
        return; const timer = setInterval(() => { const active = capture.current;
        if (active?.transport) {
            if (!active.transport.tick(engine?.current?.automationClock())) {
                finishCapture();
                audition.current?.stop();
                audition.current = null;
            }
            return;
        }
        if (active && audio.getContext().currentTime - active.start >= draft.current.length) {
        const notes = active.recorder.stop(draft.current.length);
        capture.current = null;
        setPattern(p => ({ ...p, notes: [...p.notes, ...notes] }));
        setCapturing(false);
        audition.current?.stop();
        audition.current = null;
    } }, 20); return () => clearInterval(timer); }, [capturing, audio, engine, finishCapture]);
    const startCapture = async (followTransport = false) => { const generation = operation.current; try {
        await audio.resume();
        if (disposed.current || !focused.current || !connected || !disconnect.current || generation !== operation.current || capture.current || useUIStore.getState().timelineRecording) return;
        const state = useProjectStore.getState();
        if (state.project.id !== initial.current.id) throw new Error(t('midi.stale'));
        const clock = engine?.current?.automationClock();
        if (followTransport && (!state.isPlaying || !clock || replaceId)) throw new Error(t('midi.transportFirst'));
        if (!followTransport && state.isPlaying) throw new Error(t('midi.stopFirst'));
        panic();
        const start = audio.getContext().currentTime;
        let transport: MidiTransportCapture | undefined;
        if (followTransport && clock) {
            const end = state.rangePlayback && state.project.editRange ? Math.min(state.project.duration, state.project.editRange.end) : state.project.duration;
            const length = Math.min(pattern.length, end - clock.time);
            if (length < .01) throw new Error(t('midi.transportFirst'));
            transport = new MidiTransportCapture(clock, length);
            setPosition(transport.position);
        }
        capture.current = { recorder: new MidiCapture(pattern.length), start, transport };
        setCapturing(true);
        setCount(0);
        setError('');
    }
    catch (e) {
        setError(String(e));
    } };
    return <fieldset disabled={busy} className="space-y-3 text-sm min-w-0"><HelpDetails><p className="text-xs text-gray-400">{t('midi.clockNote')}</p></HelpDetails>
  <div className="grid grid-cols-2 gap-2"><label>{t('midi.clip')}<select className="w-full bg-gray-800 min-h-11" aria-label={t('midi.clip')} value={replaceId} disabled={capturing} onChange={e => e.target.value ? loadClip(e.target.value) : newPattern()}><option value="">{t('midi.new')}</option>{clips.map(({ clip, track }) => <option key={clip.id} value={clip.id}>{track.name} · {clip.name}</option>)}</select></label><label>{t('midi.track')}<select className="w-full bg-gray-800 min-h-11" aria-label={t('midi.track')} disabled={!!replaceId || capturing} value={trackId} onChange={e => setTrackId(e.target.value)}><option value="new">{t('midi.newTrack')}</option>{project.tracks.filter(t => t.kind !== 'bus' && !t.locked).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
  <label>{t('midi.length')}<NumberField label={t('midi.length')} width="w-full" value={pattern.length} min={.01} step={.25} disabled={capturing} onCommit={v => update({ length: v })}/></label><label>{t('midi.position')}<NumberField label={t('midi.position')} width="w-full" value={position} step={.1} disabled={!!replaceId || capturing} onCommit={v => { setPosition(v); return true; }}/></label>
  <label>{t('midi.instrument')}<select className="w-full bg-gray-800 min-h-11" aria-label={t('midi.instrument')} value={pattern.instrument} disabled={capturing} onChange={e => update({ instrument: e.target.value as MidiPattern['instrument'] })}>{['sine', 'bell'].map(v => <option key={v} value={v}>{t(`midi.${v}`)}</option>)}</select></label><label>{t('midi.grid')}<select className="w-full bg-gray-800 min-h-11" aria-label={t('midi.grid')} value={step} disabled={capturing} onChange={e => setStep(Number(e.target.value))}>{grids.map(grid => <option key={grid.value} value={grid.value}>{grid.label}</option>)}</select></label></div>
  {replaceId && <p className="text-xs text-gray-400">{t('midi.trimNote')}</p>}
  <label className="flex items-center gap-2">{t('midi.lowest')}<NumberField label={t('midi.lowest')} value={base} min={0} step={12} disabled={capturing} onCommit={v => { if (!Number.isInteger(v) || v > 104)
        return false; setBase(v); return true; }}/></label>
  <PianoRoll pattern={pattern} base={base} step={step} selected={noteId} disabled={capturing || busy} onSelect={setNoteId} onChange={setPattern}/>
  <HelpDetails><p className="text-xs text-gray-400">{t('midi.rollHelp')}</p></HelpDetails>
  {note && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{(['pitch', 'start', 'duration', 'velocity'] as const).map(key => <label key={key}>{t(`midi.${key}`)}<NumberField width="w-full" label={t(`midi.${key}`)} value={note[key]} min={key === 'duration' ? .001 : key === 'velocity' ? .001 : 0} step={key === 'pitch' ? 1 : key === 'velocity' ? .05 : step} disabled={capturing} onCommit={v => updateNote({ [key]: v })}/></label>)}<button className="timeline-tool" disabled={capturing} onClick={() => { setPattern({ ...pattern, notes: pattern.notes.filter(n => n.id !== noteId) }); setNoteId(''); }}>{t('midi.delete')}</button></div>}
  <div className="flex flex-wrap gap-2"><button className="timeline-tool" disabled={capturing} onClick={() => setPattern(quantizeMidi(pattern, step))}>{t('midi.quantize')}</button><button className="timeline-tool" disabled={disabled || !trackId || !validMidiPattern(pattern)} onClick={() => void apply()}>{t('midi.apply')}</button><button className="timeline-tool" disabled={capturing || !validMidiPattern(pattern)} onClick={() => void saveMidiFile(encodeMidiFile(pattern, project.music ?? DEFAULT_MUSIC)).catch(e => setError(String(e)))}>{t('midi.export')}</button></div>
  <fieldset className="border border-gray-700 rounded p-2 space-y-2"><legend>{t('midi.input')}</legend><div className="flex flex-wrap gap-2"><button className="timeline-tool" disabled={capturing || connecting} onClick={() => void refresh().catch(e => setError(String(e)))}>{t('midi.refresh')}</button><select className="bg-gray-800 min-h-11 max-w-full" aria-label={t('midi.input')} value={portId} disabled={capturing || connected || connecting} onChange={e => setPortId(e.target.value)}>{ports.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="timeline-tool" disabled={!portId || capturing || connected || connecting} onClick={() => void connect()}>{t('midi.connect')}</button><button className="timeline-tool" onClick={panic}>{t('midi.panic')}</button><button className="timeline-tool" disabled={disabled || !connected} onClick={() => void startCapture()}>{t('midi.record')}</button><button className="timeline-tool" disabled={recording || capturing || busy || !connected || !playing || !transportReady || !!replaceId} onClick={() => void startCapture(true)}>{t('midi.recordTransport')}</button><button className="timeline-tool" disabled={!capturing} onClick={finishCapture}>{t('midi.stop')}</button></div><p role="status">{t(connected ? 'midi.connected' : 'midi.disconnected')} · {count} {t('midi.notes')}</p><HelpDetails><p className="text-xs text-gray-400">{t('midi.recordNote')}</p></HelpDetails><HelpDetails><p className="text-xs text-gray-400">{t('midi.transportNote')}</p></HelpDetails><button className="timeline-tool" disabled={recording || (capturing && !playing)} onClick={() => useProjectStore.getState().setIsPlaying(!useProjectStore.getState().isPlaying)}>{t(playing ? 'midi.stopTimeline' : 'midi.playTimeline')}</button></fieldset>
  <div className="flex flex-wrap gap-1" aria-label={t('midi.keyboard')}>{Array.from({ length: 12 }, (_, i) => base + i).map(pitch => <button key={pitch} className="min-h-11 w-10 border border-gray-600 rounded touch-none" aria-label={`${t('midi.pitch')} ${pitch}`} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); heldKeys.current.add(pitch); void audio.resume().then(() => { if (!disposed.current && heldKeys.current.has(pitch))
        receive([0x90, pitch, 100]); }).catch(e => setError(String(e))); }} onPointerUp={() => { if (heldKeys.current.delete(pitch))
        receive([0x80, pitch, 0]); }} onPointerCancel={() => panic()} onLostPointerCapture={() => { if (heldKeys.current.delete(pitch))
        receive([0x80, pitch, 0]); }}>{pitch}</button>)}</div>
  {error && <p role="alert" className="text-amber-300">{error}</p>}
 </fieldset>;
}
function PianoRoll({ pattern, base, step, selected, disabled, onSelect, onChange }: {
    pattern: MidiPattern;
    base: number;
    step: number;
    selected: string;
    disabled: boolean;
    onSelect: (id: string) => void;
    onChange: (p: MidiPattern) => void;
}) {
    const { t } = useTranslation(), drag = useRef<{
        id: string;
        x: number;
        y: number;
        note: MidiNote;
        pattern: MidiPattern;
    } | null>(null), width = 800, height = 360;
    const point = (event: React.PointerEvent<SVGSVGElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width * width, y: (event.clientY - rect.top) / rect.height * height }; };
    return <svg role="grid" aria-label={t('midi.roll')} viewBox={`0 0 ${width} ${height}`} className="w-full bg-gray-950 border border-gray-700 touch-none" onPointerDown={e => { if (disabled)
        return; const p = point(e), id = (e.target as SVGElement).dataset.note, note = pattern.notes.find(n => n.id === id); if (note) {
        onSelect(note.id);
        drag.current = { id: note.id, x: p.x, y: p.y, note, pattern };
        e.currentTarget.setPointerCapture(e.pointerId);
    }
    else {
        const start = Math.min(pattern.length - .001, Math.max(0, Math.floor(p.x / width * pattern.length / step) * step)), pitch = base + 23 - Math.min(23, Math.max(0, Math.floor(p.y / 15))), n: MidiNote = { id: crypto.randomUUID(), pitch, start, duration: Math.min(step, pattern.length - start), velocity: .8, channel: 0 }, next = { ...pattern, notes: [...pattern.notes, n] };
        if (validMidiPattern(next)) {
            onChange(next);
            onSelect(n.id);
        }
    } }} onPointerMove={e => { const d = drag.current; if (!d || disabled)
        return; const p = point(e), start = Math.max(0, Math.min(pattern.length - d.note.duration, Math.round((d.note.start + (p.x - d.x) / width * pattern.length) / step) * step)), pitch = Math.max(0, Math.min(127, d.note.pitch - Math.round((p.y - d.y) / 15))); onChange({ ...d.pattern, notes: d.pattern.notes.map(n => n.id === d.id ? { ...n, start, pitch } : n) }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { const d = drag.current; if (d)
        onChange(d.pattern); drag.current = null; }} onLostPointerCapture={() => { const d = drag.current; if (d)
        onChange(d.pattern); drag.current = null; }}>
 {Array.from({ length: 24 }, (_, i) => <g key={i}><rect x="0" y={i * 15} width={width} height="15" fill={[1, 3, 6, 8, 10].includes((base + 23 - i) % 12) ? '#151b2a' : '#202a38'}/><text x="2" y={i * 15 + 11} fill="#94a3b8" fontSize="9" pointerEvents="none">{base + 23 - i}</text></g>)}
 {Array.from({ length: Math.min(512, Math.ceil(pattern.length / step) + 1) }, (_, i) => <line key={i} x1={i * step / pattern.length * width} x2={i * step / pattern.length * width} y1="0" y2={height} stroke="#475569" strokeWidth=".5" pointerEvents="none"/>)}
 {pattern.notes.filter(n => n.pitch >= base && n.pitch < base + 24).map(n => <rect key={n.id} role="gridcell" tabIndex={0} aria-label={`${t('midi.pitch')} ${n.pitch} · ${n.start.toFixed(3)} s`} data-note={n.id} x={n.start / pattern.length * width} y={(base + 23 - n.pitch) * 15 + 1} width={Math.max(3, n.duration / pattern.length * width)} height="13" fill={n.id === selected ? '#fbbf24' : '#a78bfa'} opacity={.4 + .6 * n.velocity} onFocus={() => onSelect(n.id)} onKeyDown={e => { if (disabled)
        return; if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        onChange({ ...pattern, notes: pattern.notes.filter(v => v.id !== n.id) });
    }
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        const pitch = Math.max(0, Math.min(127, n.pitch + (e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0))), start = Math.max(0, Math.min(pattern.length - n.duration, n.start + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0)));
        onChange({ ...pattern, notes: pattern.notes.map(v => v.id === n.id ? { ...v, pitch, start } : v) });
    } }}/>)}
 </svg>;
}
