/**
 * Renders a design-system component the way the app does: inside a theme and a locale. Every component is tested
 * across `MATRIX` — both languages, both unit systems and both themes (task 011, ADR-008). Language and unit system
 * are independent settings, so the realistic pairs (Portuguese with kilograms, English with pounds) and the crossed
 * ones are all covered.
 */
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

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

/**
 * A phone with a status bar and a gesture handle. Given explicitly rather than left to the default,
 * so `Screen`'s insets are *exercised* by every test rather than silently zeroed — the defect task
 * 017 found on a device was a missing inset, and a harness with no insets could not have caught it.
 */
export const TEST_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 400, height: 800 },
  insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

export function renderUi(element: ReactElement, setting: Setting = MATRIX[0]) {
  return render(
    <SafeAreaProvider initialMetrics={TEST_METRICS}>
      <ThemeProvider preference={setting.preference}>
        <LocaleProvider locale={setting.locale} unitSystem={setting.unitSystem}>
          {element}
        </LocaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}
