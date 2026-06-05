// ---------------------------------------------------------------------------
// CrispAudio — settingsStore
// Persisted application settings (language, theme, default export format).
// Backed by localStorage via zustand's persist middleware.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '../i18n';

export type Language = 'en' | 'de';
export type Theme = 'dark' | 'light' | 'system';

export const SAMPLE_RATES = [22050, 44100, 48000] as const;
export const BIT_DEPTHS = [8, 16, 24, 32] as const;

export type SampleRate = (typeof SAMPLE_RATES)[number];
export type BitDepth = (typeof BIT_DEPTHS)[number];

interface SettingsState {
  language: Language;
  theme: Theme;
  defaultSampleRate: SampleRate;
  defaultBitDepth: BitDepth;

  setLanguage: (lang: Language) => void;
  setTheme: (theme: Theme) => void;
  setDefaultSampleRate: (rate: SampleRate) => void;
  setDefaultBitDepth: (depth: BitDepth) => void;
}

/** Apply theme class to the document root element. */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('light', !prefersDark);
  } else {
    root.classList.toggle('light', theme === 'light');
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: (i18n.language?.startsWith('de') ? 'de' : 'en') as Language,
      theme: 'dark' as Theme,
      defaultSampleRate: 44100,
      defaultBitDepth: 16,

      setLanguage: (language) => {
        i18n.changeLanguage(language);
        set({ language });
      },
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      setDefaultSampleRate: (defaultSampleRate) => set({ defaultSampleRate }),
      setDefaultBitDepth: (defaultBitDepth) => set({ defaultBitDepth }),
    }),
    {
      name: 'crispaudio-settings',
      onRehydrateStorage: () => (state) => {
        if (state?.language) i18n.changeLanguage(state.language);
        if (state?.theme) applyTheme(state.theme);
      },
    },
  ),
);
