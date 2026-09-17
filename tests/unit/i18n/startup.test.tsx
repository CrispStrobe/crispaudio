import { afterEach, expect, it, vi } from 'vitest';

const startup = vi.hoisted(() => ({
  render: vi.fn(),
  releaseGerman: () => {},
  germanRequested: false,
}));

// Hold back the real German resource to exercise a slow/offline-cache import.
vi.mock('../../../src/i18n/locales/de/translation.json', async (importOriginal) => {
  await new Promise<void>((resolve) => {
    startup.releaseGerman = resolve;
    startup.germanRequested = true;
  });
  return importOriginal();
});
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: startup.render }) }));
vi.mock('../../../src/App.tsx', async () => {
  // App normally imports this store, whose persisted language overrides detection.
  await import('../../../src/stores/settingsStore');
  return { default: () => null };
});

afterEach(() => { localStorage.clear(); });

it('waits for persisted language resources before the first app render', async () => {
  localStorage.setItem('i18nextLng', 'en-US');
  localStorage.setItem('crispaudio-settings', JSON.stringify({
    state: { language: 'de', theme: 'dark' }, version: 0,
  }));
  document.body.innerHTML = '<div id="root"></div>';
  await import('../../../src/main');
  const { default: i18n } = await import('../../../src/i18n');
  const { useSettingsStore } = await import('../../../src/stores/settingsStore');
  expect(useSettingsStore.getState().language).toBe('de');
  expect(startup.render).not.toHaveBeenCalled();

  const firstRenderLanguages: string[] = [];
  startup.render.mockImplementation(() => firstRenderLanguages.push(i18n.t('settings.title')));
  await vi.waitFor(() => expect(startup.germanRequested).toBe(true));
  startup.releaseGerman();
  await vi.waitFor(() => expect(startup.render).toHaveBeenCalledOnce());
  expect(firstRenderLanguages).toEqual(['Einstellungen']);
});
