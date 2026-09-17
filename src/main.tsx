import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import i18n, { i18nReady } from './i18n';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { useSettingsStore } from './stores/settingsStore';

// Store hydration can override browser detection while initial resources load.
// Wait for that final language too, before mounting any translated UI.
void i18nReady
  .then(() => i18n.changeLanguage(useSettingsStore.getState().language))
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
  });
