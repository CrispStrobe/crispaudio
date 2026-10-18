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
export const EXPORT_FORMATS = ['wav', 'flac', 'mp3', 'aac', 'opus'] as const;

export type SampleRate = (typeof SAMPLE_RATES)[number];
export type BitDepth = (typeof BIT_DEPTHS)[number];
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

interface SettingsState {
  nativeRecording:boolean;
  nativeRecordingOutput:string;
  setNativeRecording:(enabled:boolean)=>void;
  setNativeRecordingOutput:(uid:string)=>void;
  waveformMode:'normalized'|'level';
  setWaveformMode:(mode:'normalized'|'level')=>void;
  nativePlaybackMode:'live'|'rendered';
  setNativePlaybackMode:(mode:'live'|'rendered')=>void;
  timelineAutoFit:boolean;
  timelineNavigation:boolean;
  mixerLoudness:boolean;
  setTimelineNavigation:(enabled:boolean)=>void;
  setMixerLoudness:(enabled:boolean)=>void;
  timelineRibbon:'auto'|'always'|'never';
  setTimelineAutoFit:(enabled:boolean)=>void;
  setTimelineRibbon:(mode:'auto'|'always'|'never')=>void;
  language: Language;
  theme: Theme;
  defaultSampleRate: SampleRate;
  defaultBitDepth: BitDepth;
  defaultExportFormat: ExportFormat;
  defaultBitrateKbps: number;

  setLanguage: (lang: Language) => void;
  setTheme: (theme: Theme) => void;
  setDefaultSampleRate: (rate: SampleRate) => void;
  setDefaultBitDepth: (depth: BitDepth) => void;
  setDefaultExportFormat: (format: ExportFormat) => void;
  setDefaultBitrateKbps: (kbps: number) => void;
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
      nativeRecording:false,
      nativeRecordingOutput:'',
      setNativeRecording:(nativeRecording)=>set({nativeRecording}),
      setNativeRecordingOutput:(nativeRecordingOutput)=>set({nativeRecordingOutput}),
      waveformMode:'normalized',
      setWaveformMode:(waveformMode)=>set({waveformMode}),
      nativePlaybackMode:'live',
      setNativePlaybackMode:(nativePlaybackMode)=>set({nativePlaybackMode}),
      language: (i18n.language?.startsWith('de') ? 'de' : 'en') as Language,
      theme: 'dark' as Theme,
      timelineAutoFit:true,
      timelineNavigation:true,
      mixerLoudness:true,
      setTimelineNavigation:(timelineNavigation)=>set({timelineNavigation}),
      setMixerLoudness:(mixerLoudness)=>set({mixerLoudness}),
      timelineRibbon:'auto',
      setTimelineAutoFit:(timelineAutoFit)=>set({timelineAutoFit}),
      setTimelineRibbon:(timelineRibbon)=>set({timelineRibbon}),
      defaultSampleRate: 44100,
      defaultBitDepth: 16,
      defaultExportFormat: 'wav' as ExportFormat,
      defaultBitrateKbps: 192,

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
      setDefaultExportFormat: (defaultExportFormat) => set({ defaultExportFormat }),
      setDefaultBitrateKbps: (defaultBitrateKbps) => set({ defaultBitrateKbps }),
    }),
    {
      name: 'crispaudio-settings',
      // Retired speech generation preferences must not return on rehydration.
      merge: (persisted, current) => {
        const saved = { ...(persisted as Record<string, unknown>) };
        for (const key of ['ttsServerUrl', 'ttsDefaultVoice', 'ttsDefaultBackend']) delete saved[key];
        return { ...current, ...saved, nativeRecording:saved.nativeRecording===true, nativeRecordingOutput:typeof saved.nativeRecordingOutput==='string'?saved.nativeRecordingOutput:'' };
      },
      onRehydrateStorage: () => (state) => {
        if (state?.language) i18n.changeLanguage(state.language);
        if (state?.theme) applyTheme(state.theme);
      },
    },
  ),
);
