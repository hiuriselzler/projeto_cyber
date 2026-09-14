import type { Locale } from '../format/number';
import type { UnitSystem } from '../format/quantities';

export interface DeviceLocale {
  readonly languageCode: string | null;
  readonly regionCode: string | null;
}

export interface LanguageAndUnits {
  readonly locale: Locale;
  readonly unitSystem: UnitSystem;
}

/**
 * The defaults ADR-008 takes from the device at first launch, from its most preferred locale: any Portuguese gives
 * `pt-BR` and anything else `en`; a US region gives `imperial` and anything else `metric`. The two are independent.
 */
export function defaultsFromDevice(locales: readonly DeviceLocale[]): LanguageAndUnits {
  const preferred = locales[0];
  return {
    locale: preferred?.languageCode === 'pt' ? 'pt-BR' : 'en',
    unitSystem: preferred?.regionCode === 'US' ? 'imperial' : 'metric',
  };
}
