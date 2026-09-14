import { applyKey, normalizeKeypadValue, offsetToReveal, type KeypadKey, type KeypadRules } from '../keypad';

const ENGLISH: KeypadRules = { locale: 'en', allowDecimal: true, maxFractionDigits: 2, maxIntegerDigits: 4 };
const PORTUGUESE: KeypadRules = { ...ENGLISH, locale: 'pt-BR' };

function typeKeys(keys: KeypadKey[], rules: KeypadRules, start = ''): string {
  return keys.reduce((value, key) => applyKey(value, key, rules), start);
}

describe('keypad input (07 §6)', () => {
  it('types with the locale’s separator', () => {
    expect(typeKeys(['6', '2', 'separator', '5'], ENGLISH)).toBe('62.5');
    expect(typeKeys(['6', '2', 'separator', '5'], PORTUGUESE)).toBe('62,5');
  });

  it('continues a value that arrived with the other separator', () => {
    expect(typeKeys(['0'], PORTUGUESE, '62.5')).toBe('62,50');
    expect(typeKeys(['0'], ENGLISH, '62,5')).toBe('62.50');
    expect(normalizeKeypadValue('137.5', 'pt-BR')).toBe('137,5');
  });

  it('allows one separator and no more fraction digits than the rule', () => {
    expect(typeKeys(['1', 'separator', 'separator', '2', '5', '5'], ENGLISH)).toBe('1.25');
  });

  it('starts a bare separator with a zero, and replaces a lone leading zero', () => {
    expect(typeKeys(['separator', '5'], PORTUGUESE)).toBe('0,5');
    expect(typeKeys(['0', '0', '7'], ENGLISH)).toBe('7');
  });

  it('ignores the separator where decimals are not allowed, as for reps', () => {
    expect(typeKeys(['1', 'separator', '2'], { ...ENGLISH, allowDecimal: false })).toBe('12');
  });

  it('caps the whole-number digits', () => {
    expect(typeKeys(['1', '2', '3', '4', '5'], ENGLISH)).toBe('1234');
  });

  it('deletes the last character, and does nothing to an empty value', () => {
    expect(typeKeys(['delete'], ENGLISH, '62.5')).toBe('62.');
    expect(typeKeys(['delete'], ENGLISH)).toBe('');
  });
});

describe('keeping the edited row above the keypad (07 §6)', () => {
  const screen = { viewportHeight: 800, keypadHeight: 360, margin: 8 };

  it('scrolls a row the keypad would cover until it sits just above it', () => {
    const offset = offsetToReveal({ ...screen, rowTop: 500, rowBottom: 556, scrollOffset: 0 });

    expect(offset).toBe(556 - (800 - 360 - 8));
    expect(556 - offset).toBeLessThanOrEqual(800 - 360 - 8);
  });

  it('leaves a row that is already clear where it is', () => {
    expect(offsetToReveal({ ...screen, rowTop: 100, rowBottom: 156, scrollOffset: 0 })).toBe(0);
  });

  it('scrolls back up to a row above the top of the list', () => {
    expect(offsetToReveal({ ...screen, rowTop: 40, rowBottom: 96, scrollOffset: 300 })).toBe(32);
  });

  it('keeps the top of a row in view when the space left is shorter than the row', () => {
    const short = { viewportHeight: 420, keypadHeight: 360, margin: 8 };
    expect(offsetToReveal({ ...short, rowTop: 500, rowBottom: 612, scrollOffset: 0 })).toBe(492);
  });
});
