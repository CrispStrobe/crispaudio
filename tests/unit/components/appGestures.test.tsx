import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useUIStore } from '../../../src/stores/uiStore';
import { useSynthStore } from '../../../src/stores/synthStore';
import { useVoiceStore } from '../../../src/stores/voiceStore';
import { useProjectStore } from '../../../src/stores/projectStore';
import App from '../../../src/App';

vi.mock('../../../src/hooks/useAutosave', () => ({ useAutosave: () => {} }));
vi.mock('../../../src/lib/native', () => ({
  setAudioSessionType: vi.fn(),
  subscribeOpenedFiles: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock('../../../src/components/layout/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../../../src/components/sfx/SFXPanel', () => ({ SFXPanel: () =>
  <input aria-label="SFX test" type="range" onChange={event => useSynthStore.getState().setMorphAmount(Number(event.target.value))} min="0" max="1" step="0.1" />,
}));
vi.mock('../../../src/components/voice/VoicePanel', () => ({ VoicePanel: () =>
  <input aria-label="Voice test" type="range" onChange={event => useVoiceStore.getState().setMorphAmount(Number(event.target.value))} min="0" max="1" step="0.1" />,
}));
vi.mock('../../../src/components/timeline/TimelinePanel', () => ({ TimelinePanel: () =>
  <input aria-label="Timeline test" type="range" onChange={event => useProjectStore.getState().updateTrack(useProjectStore.getState().project.tracks[0].id, { volume: Number(event.target.value) })} min="0" max="1" step="0.1" />,
}));

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  useUIStore.setState({ activeModal: null });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('app history wiring', () => {
  it.each(['sfx', 'voice', 'timeline'] as const)('groups %s panel range changes through the real store', async panel => {
    useUIStore.setState({ activePanel: panel });
    if (panel === 'timeline') useProjectStore.getState().addTrack('Test');
    if (panel === 'sfx') useSynthStore.getState().setMorphAmount(0);
    if (panel === 'voice') useVoiceStore.getState().setMorphAmount(0);
    const store = panel === 'sfx' ? useSynthStore : panel === 'voice' ? useVoiceStore : useProjectStore;
    await act(async () => { render(<App />); });
    const input = await screen.findByRole('slider');
    store.temporal.getState().clear();
    fireEvent.pointerDown(input);
    fireEvent.change(input, { target: { value: '0.2' } });
    fireEvent.change(input, { target: { value: '0.6' } });
    fireEvent.pointerUp(window);
    expect(store.temporal.getState().pastStates).toHaveLength(1);
    fireEvent.change(input, { target: { value: '0.8' } });
    expect(store.temporal.getState().pastStates).toHaveLength(2);
  });
});
