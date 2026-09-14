import { getLocales } from 'expo-localization';

import { defaultsFromDevice, type LanguageAndUnits } from './device';

/** The language and unit system the device suggests, before the user has chosen (ADR-008). */
export function readDeviceDefaults(): LanguageAndUnits {
  return defaultsFromDevice(getLocales());
}
