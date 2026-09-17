// ---------------------------------------------------------------------------
// TTSModal — iOS renders with the on-device system voices instead of the
// CrispASR server; other platforms keep the server form.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '../../../src/i18n';

const native = vi.hoisted(() => ({
  isIOSApp: vi.fn(() => false),
  listSystemVoices: vi.fn(),
  synthesizeWithSystemVoice: vi.fn(),
}));

vi.mock('../../../src/lib/native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/native')>()),
  ...native,
  haptic: vi.fn(),
}));

const fetchVoices = vi.hoisted(() => vi.fn(async () => []));
vi.mock('../../../src/services/ttsService', () => ({
  fetchVoices,
  synthesizeSpeech: vi.fn(),
}));

import { TTSModal } from '../../../src/components/timeline/TTSModal';

beforeAll(() => {
  globalThis.requestAnimationFrame = (() => 1) as unknown as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as unknown as typeof cancelAnimationFrame;
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running';
      async decodeAudioData() {
        return { duration: 1.5, sampleRate: 22050, numberOfChannels: 1, getChannelData: () => new Float32Array(10) };
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TTSModal', () => {
  it('uses the CrispASR server form off iOS', async () => {
    native.isIOSApp.mockReturnValue(false);
    render(<TTSModal />);

    expect(screen.getByLabelText(/engine/i)).toBeInTheDocument();
    await waitFor(() => expect(fetchVoices).toHaveBeenCalled());
    expect(native.listSystemVoices).not.toHaveBeenCalled();
  });

  it('lists system voices on iOS and renders with the chosen voice', async () => {
    native.isIOSApp.mockReturnValue(true);
    native.listSystemVoices.mockResolvedValue([
      { id: 'com.apple.voice.premium.en-US.Zoe', name: 'Zoe', language: 'en-US', quality: 'premium', novelty: false },
      { id: 'com.apple.voice.compact.de-DE.Anna', name: 'Anna', language: 'de-DE', quality: 'default', novelty: false },
    ]);
    native.synthesizeWithSystemVoice.mockResolvedValue(new ArrayBuffer(8));
    render(<TTSModal />);

    const select = (await screen.findByRole('combobox')) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(2));
    expect(screen.queryByLabelText(/engine/i)).not.toBeInTheDocument();
    expect(fetchVoices).not.toHaveBeenCalled();

    fireEvent.change(select, { target: { value: 'com.apple.voice.compact.de-DE.Anna' } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Guten Tag' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() =>
      expect(native.synthesizeWithSystemVoice).toHaveBeenCalledWith('Guten Tag', {
        voiceId: 'com.apple.voice.compact.de-DE.Anna',
        rate: 1,
        pitch: 1,
      }),
    );
    expect(await screen.findByRole('button', { name: /add to timeline/i })).toBeInTheDocument();
  });
});
