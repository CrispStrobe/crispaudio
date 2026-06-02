// ---------------------------------------------------------------------------
// CrispAudio — settingsStore
// Persisted application settings (language, default export format).
// Backed by localStorage via zustand's persist middleware.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '../i18n';

export type Language = 'en' | 'de';

export const SAMPLE_RATES = [22050, 44100, 48000] as const;
export const BIT_DEPTHS = [8, 16, 24, 32] as const;

export type SampleRate = (typeof SAMPLE_RATES)[number];
export type BitDepth = (typeof BIT_DEPTHS)[number];

interface SettingsState {
  language: Language;
  defaultSampleRate: SampleRate;
  defaultBitDepth: BitDepth;

  setLanguage: (lang: Language) => void;
  setDefaultSampleRate: (rate: SampleRate) => void;
  setDefaultBitDepth: (depth: BitDepth) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: (i18n.language?.startsWith('de') ? 'de' : 'en') as Language,
      defaultSampleRate: 44100,
      defaultBitDepth: 16,

      setLanguage: (language) => {
        i18n.changeLanguage(language);
        set({ language });
      },
      setDefaultSampleRate: (defaultSampleRate) => set({ defaultSampleRate }),
      setDefaultBitDepth: (defaultBitDepth) => set({ defaultBitDepth }),
    }),
    {
      name: 'crispaudio-settings',
      // After rehydrating from storage, make i18next reflect the saved language.
      onRehydrateStorage: () => (state) => {
        if (state?.language) i18n.changeLanguage(state.language);
      },
    },
  ),
);
