/**
 * The numeric keypad's logic, apart from its layout so it can be tested exactly (07 §6): what a key press does to the
 * value, and how far a list must scroll so the keypad never covers the row being edited.
 */
import { decimalSeparator, type Locale } from '../format/number';

export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type KeypadKey = Digit | 'separator' | 'delete';

export interface KeypadRules {
  readonly locale: Locale;
  readonly allowDecimal: boolean;
  readonly maxFractionDigits: number;
  readonly maxIntegerDigits: number;
}

/** A value in the locale's separator, whichever of `,` and `.` it arrived with. */
export function normalizeKeypadValue(value: string, locale: Locale): string {
  return value.replace(/[.,]/, decimalSeparator(locale));
}

export function applyKey(value: string, key: KeypadKey, rules: KeypadRules): string {
  const separator = decimalSeparator(rules.locale);
  const current = normalizeKeypadValue(value, rules.locale);
  if (key === 'delete') {
    return current.slice(0, -1);
  }
  const separatorAt = current.indexOf(separator);
  if (key === 'separator') {
    if (!rules.allowDecimal || rules.maxFractionDigits === 0 || separatorAt !== -1) {
      return current;
    }
    return `${current === '' ? '0' : current}${separator}`;
  }
  if (separatorAt !== -1) {
    return current.length - separatorAt - 1 >= rules.maxFractionDigits ? current : current + key;
  }
  if (current === '0') {
    return key;
  }
  return current.length >= rules.maxIntegerDigits ? current : current + key;
}

export interface RevealGeometry {
  /** The edited row's top and bottom, in the list's content coordinates. */
  readonly rowTop: number;
  readonly rowBottom: number;
  readonly scrollOffset: number;
  readonly viewportHeight: number;
  readonly keypadHeight: number;
  /** Clear space kept between the row and the keypad, or the top of the list. */
  readonly margin: number;
}

/** The scroll offset at which the edited row sits fully above the keypad, moving the list as little as possible. */
export function offsetToReveal({ rowTop, rowBottom, scrollOffset, viewportHeight, keypadHeight, margin }: RevealGeometry): number {
  const lowestVisible = scrollOffset + viewportHeight - keypadHeight - margin;
  if (rowBottom > lowestVisible) {
    // A row taller than the space left keeps its top in view rather than its bottom.
    return Math.min(scrollOffset + (rowBottom - lowestVisible), Math.max(0, rowTop - margin));
  }
  if (rowTop < scrollOffset + margin) {
    return Math.max(0, rowTop - margin);
  }
  return scrollOffset;
}
