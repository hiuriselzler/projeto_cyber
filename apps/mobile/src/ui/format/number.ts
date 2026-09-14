/**
 * Numbers for display and from the keypad, in the two supported locales (ADR-008). Formatted by hand rather than
 * through `Intl.NumberFormat`, so a test run under Node and the app under Hermes produce the same characters.
 */

export type Locale = 'en' | 'pt-BR';

const SEPARATORS: Record<Locale, { readonly decimal: string; readonly group: string }> = {
  en: { decimal: '.', group: ',' },
  'pt-BR': { decimal: ',', group: '.' },
};

/** The decimal separator the keypad shows for a locale (07 §6). */
export function decimalSeparator(locale: Locale): string {
  return SEPARATORS[locale].decimal;
}

/**
 * Rounds half away from zero to `digits` decimal places, for display only. Loads are never rounded here: that is
 * `round_to_increment`'s job alone (INV-02).
 */
export function roundForDisplay(value: number, digits: number): number {
  const factor = 10 ** digits;
  // The nudge keeps a value such as 1.005, stored in binary as 1.00499…, rounding the way it reads.
  const rounded = Math.round(Math.abs(value) * factor * (1 + Number.EPSILON)) / factor;
  return value < 0 && rounded !== 0 ? -rounded : rounded;
}

export interface DecimalOptions {
  /** Digits after the separator at most; trailing zeros beyond `minFractionDigits` are dropped. */
  readonly maxFractionDigits: number;
  readonly minFractionDigits?: number;
  /** Thousands grouping. Off for anything that goes back into the keypad. */
  readonly grouping?: boolean;
}

export function formatDecimal(value: number, locale: Locale, options: DecimalOptions): string {
  const { maxFractionDigits, minFractionDigits = 0, grouping = true } = options;
  const rounded = roundForDisplay(value, maxFractionDigits);
  const [integer, fullFraction = ''] = Math.abs(rounded).toFixed(maxFractionDigits).split('.');
  let fraction = fullFraction;
  while (fraction.length > minFractionDigits && fraction.endsWith('0')) {
    fraction = fraction.slice(0, -1);
  }
  const { decimal, group } = SEPARATORS[locale];
  const grouped = grouping ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, group) : integer;
  return `${rounded < 0 ? '-' : ''}${grouped}${fraction ? decimal + fraction : ''}`;
}

/**
 * Parses keypad input typed with either separator, `,` or `.`, whatever the locale (07 §6). Returns null for anything
 * that is not a plain non-negative decimal: no grouping, no sign, no second separator.
 */
export function parseDecimalInput(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d*(?:[.,]\d*)?$/.test(trimmed) || !/\d/.test(trimmed)) {
    return null;
  }
  return Number(trimmed.replace(',', '.'));
}
