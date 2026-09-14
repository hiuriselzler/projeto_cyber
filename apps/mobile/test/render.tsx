/**
 * Renders a design-system component the way the app does: inside a theme and a locale. Every component is tested
 * across `MATRIX` — both languages, both unit systems and both themes (task 011, ADR-008). Language and unit system
 * are independent settings, so the realistic pairs (Portuguese with kilograms, English with pounds) and the crossed
 * ones are all covered.
 */
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import type { Locale } from '../src/ui/format/number';
import type { UnitSystem } from '../src/ui/format/quantities';
import { LocaleProvider } from '../src/ui/i18n/LocaleProvider';
import { ThemeProvider, type ThemePreference } from '../src/ui/theme/ThemeProvider';

export interface Setting {
  readonly locale: Locale;
  readonly unitSystem: UnitSystem;
  readonly preference: ThemePreference;
}

const LOCALES: readonly Locale[] = ['en', 'pt-BR'];
const UNIT_SYSTEMS: readonly UnitSystem[] = ['metric', 'imperial'];
const THEMES: readonly ThemePreference[] = ['dark', 'light'];

export const MATRIX: readonly Setting[] = LOCALES.flatMap((locale) =>
  UNIT_SYSTEMS.flatMap((unitSystem) => THEMES.map((preference) => ({ locale, unitSystem, preference }))),
);

export function renderUi(element: ReactElement, setting: Setting = MATRIX[0]) {
  return render(
    <ThemeProvider preference={setting.preference}>
      <LocaleProvider locale={setting.locale} unitSystem={setting.unitSystem}>
        {element}
      </LocaleProvider>
    </ThemeProvider>,
  );
}
