import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';

import type { LanguageAndUnits } from './device';
import { createI18n } from './i18n';

const LocaleContext = createContext<LanguageAndUnits | null>(null);

interface LocaleProviderProps extends LanguageAndUnits {
  readonly children: ReactNode;
}

/** The user's language and unit system, for every component below it (ADR-008). */
export function LocaleProvider({ locale, unitSystem, children }: LocaleProviderProps) {
  const i18n = useMemo(() => createI18n(locale), [locale]);
  const value = useMemo(() => ({ locale, unitSystem }), [locale, unitSystem]);
  return (
    <I18nextProvider i18n={i18n}>
      <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
    </I18nextProvider>
  );
}

export function useLocale(): LanguageAndUnits {
  const value = useContext(LocaleContext);
  if (value === null) {
    throw new Error('useLocale needs a LocaleProvider above it');
  }
  return value;
}

/** Translates a catalog key (INV-27). */
export function useT() {
  return useTranslation().t;
}
