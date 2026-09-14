/**
 * The one formatting module (INV-01, ADR-008): SI values in, the user's unit system and locale out, and keypad input
 * back to SI. No other code converts a unit.
 *
 * A formatted quantity carries its unit as a key, never as text, so the component that shows it translates the unit
 * (INV-27) and can set it one step smaller than the number (07 §4). Pace formats belong to sport profiles and arrive
 * in task 007 (INV-19).
 */
import { formatDecimal, parseDecimalInput, roundForDisplay, type Locale } from './number';

/** Exact by definition (the international yard and pound, 1959). */
export const KILOGRAMS_PER_POUND = 0.45359237;
export const METRES_PER_MILE = 1609.344;
export const METRES_PER_FOOT = 0.3048;

export type UnitSystem = 'metric' | 'imperial';
export type UnitKey = 'kg' | 'lb' | 'km' | 'mi' | 'm' | 'ft' | 'celsius' | 'fahrenheit';

export interface FormattedQuantity {
  /** The number as the user reads it, in their locale. */
  readonly text: string;
  /** The same number, rounded as displayed — what a plural rule is chosen by. */
  readonly amount: number;
  readonly unit: UnitKey;
}

// Two places covers every real plate: 1.25 kg and 2.5 lb.
const WEIGHT_FRACTION_DIGITS = 2;
const DISTANCE_FRACTION_DIGITS = 2;

function quantity(amount: number, digits: number, unit: UnitKey, locale: Locale): FormattedQuantity {
  return {
    text: formatDecimal(amount, locale, { maxFractionDigits: digits }),
    amount: roundForDisplay(amount, digits),
    unit,
  };
}

export function formatWeight(kilograms: number, unitSystem: UnitSystem, locale: Locale): FormattedQuantity {
  return unitSystem === 'imperial'
    ? quantity(kilograms / KILOGRAMS_PER_POUND, WEIGHT_FRACTION_DIGITS, 'lb', locale)
    : quantity(kilograms, WEIGHT_FRACTION_DIGITS, 'kg', locale);
}

/** A stored weight as the keypad should start from: the user's unit and separator, without grouping. */
export function weightForKeypad(kilograms: number, unitSystem: UnitSystem, locale: Locale): string {
  const amount = unitSystem === 'imperial' ? kilograms / KILOGRAMS_PER_POUND : kilograms;
  return formatDecimal(amount, locale, { maxFractionDigits: WEIGHT_FRACTION_DIGITS, grouping: false });
}

/** Keypad input in the user's unit, as kilograms. Converted, never rounded: rounding a load is INV-02's alone. */
export function keypadWeightToKilograms(input: string, unitSystem: UnitSystem): number | null {
  const amount = parseDecimalInput(input);
  if (amount === null) {
    return null;
  }
  return unitSystem === 'imperial' ? amount * KILOGRAMS_PER_POUND : amount;
}

export function formatDistance(metres: number, unitSystem: UnitSystem, locale: Locale): FormattedQuantity {
  return unitSystem === 'imperial'
    ? quantity(metres / METRES_PER_MILE, DISTANCE_FRACTION_DIGITS, 'mi', locale)
    : quantity(metres / 1000, DISTANCE_FRACTION_DIGITS, 'km', locale);
}

export function formatElevation(metres: number, unitSystem: UnitSystem, locale: Locale): FormattedQuantity {
  return unitSystem === 'imperial'
    ? quantity(metres / METRES_PER_FOOT, 0, 'ft', locale)
    : quantity(metres, 0, 'm', locale);
}

export function formatTemperature(celsius: number, unitSystem: UnitSystem, locale: Locale): FormattedQuantity {
  return unitSystem === 'imperial'
    ? quantity((celsius * 9) / 5 + 32, 0, 'fahrenheit', locale)
    : quantity(celsius, 0, 'celsius', locale);
}

/** `h:mm:ss`, or `m:ss` under an hour. Whole seconds, truncated; the same in every locale. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}
