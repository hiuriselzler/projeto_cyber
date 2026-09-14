import { useCallback, useState, type ReactNode } from 'react';

import { readThemePreference, writeThemePreference } from '@/db/preferences';
import { LocaleProvider, readDeviceDefaults, ThemeProvider, type ThemePreference } from '@/ui';

/**
 * The user's theme, language and units, for the whole app. The theme override is stored on the device (07 §3).
 * Language and units come from the device until the account holds them — `users.locale` and `users.unit_system`,
 * task 003 (ADR-008).
 */
export function PreferencesProvider({ children }: { readonly children: ReactNode }) {
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [languageAndUnits] = useState(readDeviceDefaults);

  const onPreferenceChange = useCallback((next: ThemePreference) => {
    writeThemePreference(next);
    setTheme(next);
  }, []);

  return (
    <ThemeProvider preference={theme} onPreferenceChange={onPreferenceChange}>
      <LocaleProvider locale={languageAndUnits.locale} unitSystem={languageAndUnits.unitSystem}>
        {children}
      </LocaleProvider>
    </ThemeProvider>
  );
}
