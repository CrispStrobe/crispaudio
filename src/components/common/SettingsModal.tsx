// ---------------------------------------------------------------------------
// CrispAudio — SettingsModal
// Application preferences: language and default export format.
// ---------------------------------------------------------------------------

import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { Modal } from './Modal';
import { useUIStore } from '../../stores/uiStore';
import {
  useSettingsStore,
  SAMPLE_RATES,
  BIT_DEPTHS,
  type Language,
  type Theme,
  type SampleRate,
  type BitDepth,
} from '../../stores/settingsStore';

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

const fieldLabel = 'text-xs font-medium text-gray-400 mb-1.5 block';
const selectClass =
  'w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm ' +
  'text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400';

export function SettingsModal() {
  const { t } = useTranslation();
  const { activeModal, closeModal, openModal } = useUIStore();
  const {
    language,
    theme,
    defaultSampleRate,
    defaultBitDepth,
    setLanguage,
    setTheme,
    setDefaultSampleRate,
    setDefaultBitDepth,
  } = useSettingsStore();

  return (
    <Modal
      isOpen={activeModal === 'settings'}
      onClose={closeModal}
      title={t('settings.title')}
    >
      <div className="flex flex-col gap-5">
        {/* Language */}
        <div>
          <label className={fieldLabel} htmlFor="settings-language">
            {t('settings.language')}
          </label>
          <select
            id="settings-language"
            className={selectClass}
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* Theme */}
        <div>
          <label className={fieldLabel} htmlFor="settings-theme">
            {t('settings.theme')}
          </label>
          <select
            id="settings-theme"
            className={selectClass}
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
          >
            {THEMES.map((th) => (
              <option key={th.value} value={th.value}>
                {th.label}
              </option>
            ))}
          </select>
        </div>

        {/* Default export format */}
        <div>
          <h3 className="text-xs font-semibold text-gray-300 mb-2 uppercase tracking-wide">
            {t('settings.exportDefaults')}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel} htmlFor="settings-samplerate">
                {t('settings.sampleRate')}
              </label>
              <select
                id="settings-samplerate"
                className={selectClass}
                value={defaultSampleRate}
                onChange={(e) =>
                  setDefaultSampleRate(Number(e.target.value) as SampleRate)
                }
              >
                {SAMPLE_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r} Hz
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabel} htmlFor="settings-bitdepth">
                {t('settings.bitDepth')}
              </label>
              <select
                id="settings-bitdepth"
                className={selectClass}
                value={defaultBitDepth}
                onChange={(e) =>
                  setDefaultBitDepth(Number(e.target.value) as BitDepth)
                }
              >
                {BIT_DEPTHS.map((d) => (
                  <option key={d} value={d}>
                    {d}-bit
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* About link */}
        <div className="flex gap-2 pt-2 border-t border-gray-700/70">
          <button
            type="button"
            onClick={() => openModal('about')}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-100 transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
            {t('about.title')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
