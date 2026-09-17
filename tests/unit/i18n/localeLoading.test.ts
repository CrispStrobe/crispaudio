import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem('i18nextLng', 'en-US');
});

describe('locale loading', () => {
  it.each(['de-DE', 'de-AT', 'de-CH'])('detects %s as German with English fallback', async (language) => {
    localStorage.setItem('i18nextLng', language);
    const { default: i18n, i18nReady } = await import('../../../src/i18n');
    await i18nReady;
    expect(i18n.resolvedLanguage).toBe('de');
    expect(i18n.t('settings.title')).toBe('Einstellungen');
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
    i18n.addResource('en', 'translation', 'fallbackProbe', 'English fallback');
    expect(i18n.t('fallbackProbe')).toBe('English fallback');
  });

  it('falls back to English for unsupported languages', async () => {
    localStorage.setItem('i18nextLng', 'fr-FR');
    const { default: i18n, i18nReady } = await import('../../../src/i18n');
    await i18nReady;
    expect(i18n.resolvedLanguage).toBe('en');
    expect(i18n.t('settings.title')).toBe('Settings');
    expect(i18n.hasResourceBundle('de', 'translation')).toBe(false);
  });

  it('uses navigator detection without a saved language', async () => {
    localStorage.clear();
    const languages = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-AT']);
    try {
      const { default: i18n, i18nReady } = await import('../../../src/i18n');
      await i18nReady;
      expect(i18n.resolvedLanguage).toBe('de');
      expect(i18n.t('settings.title')).toBe('Einstellungen');
    } finally {
      languages.mockRestore();
    }
  });

  it('does not load German until the user switches from English', async () => {
    const { default: i18n, i18nReady } = await import('../../../src/i18n');
    await i18nReady;

    expect(i18n.t('settings.title')).toBe('Settings');
    expect(i18n.hasResourceBundle('de', 'translation')).toBe(false);

    await i18n.changeLanguage('de');
    expect(i18n.t('settings.title')).toBe('Einstellungen');
    expect(i18n.hasResourceBundle('de', 'translation')).toBe(true);
    await i18n.changeLanguage('en');
    expect(i18n.t('settings.title')).toBe('Settings');
  });
});
