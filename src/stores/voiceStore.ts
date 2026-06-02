import { create } from 'zustand';
import type { VoiceSettings, VoicePresetName } from '../types/voicelab';
import { getPreset } from '../audio/presets/voicePresets';

// ── State shape ──────────────────────────────────────────────────────────────

interface VoiceState {
  settingsA: VoiceSettings;
  settingsB: VoiceSettings;
  activeSlot: 'A' | 'B';
  morphAmount: number;            // 0–1; 0 = pure active slot, 1 = pure other slot
  sourceBuffer: AudioBuffer | null;
  processedBuffer: AudioBuffer | null;
  isProcessing: boolean;
  selectedPreset: VoicePresetName;

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Merge a partial settings update into the currently active slot. */
  setSettings: (settings: Partial<VoiceSettings>) => void;

  /** Load a named preset into the currently active slot. */
  loadPreset: (name: VoicePresetName) => void;

  /** Store the source (unprocessed) AudioBuffer. */
  setSourceBuffer: (buffer: AudioBuffer) => void;

  /** Store the result of the latest processing run (or null to clear). */
  setProcessedBuffer: (buffer: AudioBuffer | null) => void;

  /** Switch which slot (A or B) is the 'active' slot. */
  setActiveSlot: (slot: 'A' | 'B') => void;

  /** Set the morph blend amount between slot A and slot B. */
  setMorphAmount: (amount: number) => void;

  /** Swap the settings stored in slot A and slot B. */
  swapSlots: () => void;

  /** Mark processing as in-progress or finished. */
  setIsProcessing: (value: boolean) => void;

  /**
   * Return the effective VoiceSettings to use for the current render pass.
   * When `morphAmount` is 0 this is simply the active slot's settings.
   * When > 0 it is a linear interpolation towards the other slot.
   */
  getEffectiveSettings: () => VoiceSettings;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useVoiceStore = create<VoiceState>()((set, get) => ({
  settingsA: getPreset('original'),
  settingsB: getPreset('original'),
  activeSlot: 'A',
  morphAmount: 0,
  sourceBuffer: null,
  processedBuffer: null,
  isProcessing: false,
  selectedPreset: 'original',

  setSettings: (partial) => {
    set((state) => {
      if (state.activeSlot === 'A') {
        return { settingsA: { ...state.settingsA, ...partial } };
      }
      return { settingsB: { ...state.settingsB, ...partial } };
    });
  },

  loadPreset: (name) => {
    const settings = getPreset(name);
    set((state) => {
      if (state.activeSlot === 'A') {
        return { settingsA: settings, selectedPreset: name };
      }
      return { settingsB: settings, selectedPreset: name };
    });
  },

  setSourceBuffer: (buffer) => set({ sourceBuffer: buffer }),

  setProcessedBuffer: (buffer) => set({ processedBuffer: buffer }),

  setActiveSlot: (slot) => set({ activeSlot: slot }),

  setMorphAmount: (amount) =>
    set({ morphAmount: Math.max(0, Math.min(1, amount)) }),

  swapSlots: () =>
    set((state) => ({
      settingsA: state.settingsB,
      settingsB: state.settingsA,
    })),

  setIsProcessing: (value) => set({ isProcessing: value }),

  getEffectiveSettings: () => {
    const { activeSlot, morphAmount, settingsA, settingsB } = get();

    if (morphAmount === 0) {
      return activeSlot === 'A' ? settingsA : settingsB;
    }

    const src = activeSlot === 'A' ? settingsA : settingsB;
    const dst = activeSlot === 'A' ? settingsB : settingsA;
    return lerpSettings(src, dst, morphAmount);
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function lerpSettings(
  a: VoiceSettings,
  b: VoiceSettings,
  t: number,
): VoiceSettings {
  const result = {} as VoiceSettings;
  const keys = Object.keys(a) as Array<keyof VoiceSettings>;
  for (const key of keys) {
    (result as unknown as Record<string, number>)[key] =
      (a[key] as number) + ((b[key] as number) - (a[key] as number)) * t;
  }
  return result;
}
