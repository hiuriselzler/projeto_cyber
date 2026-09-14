import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';

import { getSessionState, subscribeToSession } from '@/account';
import { readThemePreference, writeThemePreference } from '@/db/preferences';
import { LocaleProvider, readDeviceDefaults, ThemeProvider, type ThemePreference } from '@/ui';

/**
 * The user's theme, language and units, for the whole app. The theme override is stored on the device (07 §3).
 * Language and units are the signed-in account's — `users.locale` and `users.unit_system`, cached on the device so they
 * hold offline — and the device's own until someone signs in (ADR-008).
 */
export function PreferencesProvider({ children }: { readonly children: ReactNode }) {
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [deviceDefaults] = useState(readDeviceDefaults);
  const session = useSyncExternalStore(subscribeToSession, getSessionState);
  const { locale, unitSystem } = session.status === 'signed-in' ? session.account : deviceDefaults;

  const onPreferenceChange = useCallback((next: ThemePreference) => {
    writeThemePreference(next);
    setTheme(next);
  }, []);

  return (
    <ThemeProvider preference={theme} onPreferenceChange={onPreferenceChange}>
      <LocaleProvider locale={locale} unitSystem={unitSystem}>
        {children}
      </LocaleProvider>
    </ThemeProvider>
  );
}
