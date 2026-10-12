import { isNativeMac } from './nativeMenuPlatform';
export interface MidiInputPort {
    id: string;
    name: string;
}
export interface MidiAccessHandle {
    ports: () => MidiInputPort[];
    connect: (id: string, onMessage: (bytes: number[]) => void, onDisconnect?: () => void) => Promise<() => Promise<void>>;
    close: () => void;
}
export async function openMidiInputs(): Promise<MidiAccessHandle> {
    if (isNativeMac()) {
        const { invoke } = await import('@tauri-apps/api/core'), { listen } = await import('@tauri-apps/api/event'), ports = await invoke<MidiInputPort[]>('list_midi_inputs');
        return { ports: () => ports, close: () => { }, connect: async (id, onMessage, onDisconnect) => {
                const session = crypto.randomUUID();
                let closed = false;
                
                const unlisten = await listen<{
                    session: string;
                    data: number[];
                }>('crispaudio-midi', e => { if (!closed && e.payload.session === session)
                    onMessage(e.payload.data); });
                try {
                    await invoke('connect_midi_input', { id, session });
                }
                catch (error) {
                    closed = true;
                    unlisten();
                    throw error;
                }
                const stop = async () => { if (closed)
                    return; closed = true; clearInterval(timer); unlisten(); await invoke('disconnect_midi_input', { session }); };
                const timer = setInterval(() => { void invoke<MidiInputPort[]>('list_midi_inputs').then(async (current) => { if (!closed && !current.some(p => p.id === id)) {
                    try { await stop(); } finally { onDisconnect?.(); }
                } }).catch(() => { }); }, 2000);
                return stop;
            } };
    }
    if (!navigator.requestMIDIAccess)
        throw new Error('MIDI input is unavailable here; use the Mac app or a MIDI-capable browser');
    const access = await navigator.requestMIDIAccess({ sysex: false }), owned = new Set<MIDIInput>();
    return { ports: () => [...access.inputs.values()].map(p => ({ id: p.id, name: p.name || p.id })), close: () => { for (const p of owned) {
            p.onmidimessage = null;
            p.onstatechange = null;
            void p.close();
        } owned.clear(); }, connect: async (id, onMessage, onDisconnect) => {
            const input = access.inputs.get(id);
            if (!input)
                throw new Error('MIDI device disconnected; refresh inputs');
            await input.open();
            owned.add(input);
            let closed = false;
            const stop = async () => { if (closed)
                return; closed = true; owned.delete(input); input.onmidimessage = null; input.onstatechange = null; await input.close(); };
            input.onmidimessage = e => { if (e.data && !closed)
                onMessage([...e.data]); };
            input.onstatechange = () => { if (input.state === 'disconnected' && !closed)
                void stop().finally(() => onDisconnect?.()).catch(() => { }); };
            return stop;
        } };
}
