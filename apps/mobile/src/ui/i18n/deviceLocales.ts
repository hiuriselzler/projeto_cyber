import { getCalendars, getLocales } from 'expo-localization';

import { defaultsFromDevice, type LanguageAndUnits } from './device';

/** The language and unit system the device suggests, before the user has chosen (ADR-008). */
export function readDeviceDefaults(): LanguageAndUnits {
  return defaultsFromDevice(getLocales());
}

/**
 * The IANA zone this device is in right now — `America/Sao_Paulo`.
 *
 * Stored on every workout beside its `local_date`, because which day a session belongs to is a **fact recorded at
 * the time**, not something to recompute later from wherever the user happens to be standing (INV-17). The account
 * row carries a `timezone` too, but that one was read when the account was made and is the wrong answer for somebody
 * who has since flown.
 *
 * Null when the platform offers none, which the caller must handle rather than guess at.
 */
export function readDeviceTimeZone(): string | null {
  return getCalendars()[0]?.timeZone ?? null;
}
