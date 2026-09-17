import i18n, { type BackendModule } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Literal imports produce local JS chunks: bundled by Tauri and precached by
// the web service worker's existing **/*.js glob, including the inactive locale.
const localeBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(language, _namespace, callback) {
    const resource = language === 'de'
      ? import('./locales/de/translation.json')
      : import('./locales/en/translation.json');
    resource.then(({ default: translations }) => callback(null, translations),
      (error: Error) => callback(error, false));
  },
};

export const i18nReady = i18n
  .use(localeBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    supportedLngs: ['en', 'de'],
    load: 'languageOnly',
    fallbackLng: 'en',
    // Detect synchronously so settingsStore can read the initial language;
    // resource loading itself remains asynchronous.
    initAsync: false,
    interpolation: { escapeValue: false },
  });

export default i18n;
