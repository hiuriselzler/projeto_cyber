import './polyfills';

import en from '@cyberathlete/shared/i18n/en.json';
import ptBR from '@cyberathlete/shared/i18n/pt-BR.json';
import { createInstance, type i18n } from 'i18next';
import ICU from 'i18next-icu';
import { initReactI18next } from 'react-i18next';

import type { Locale } from '../format/number';

/**
 * An i18next instance over the shared catalogs, in ICU MessageFormat (ADR-008). Created synchronously: the catalogs
 * are bundled, so no screen ever waits for a translation.
 */
export function createI18n(locale: Locale): i18n {
  const instance = createInstance();
  void instance
    .use(ICU)
    .use(initReactI18next)
    .init({
      resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
      lng: locale,
      // Both catalogs hold every key (scripts/check-catalogs.mjs), so a missing one is a bug to see, not to hide.
      fallbackLng: false,
      initAsync: false,
      interpolation: { escapeValue: false },
    });
  return instance;
}
