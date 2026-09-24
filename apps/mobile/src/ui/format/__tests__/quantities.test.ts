import { formatDecimal, parseDecimalInput } from '../number';
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatTemperature,
  formatWeight,
  KILOGRAMS_PER_POUND,
  formatShortDistance,
  keypadShortDistanceToMetres,
  keypadWeightToKilograms,
  shortDistanceForKeypad,
  weightForKeypad,
} from '../quantities';

/** What Postgres and SQLite keep of a load: `numeric(9,4)` (INV-02, ADR-008). */
function storedAsLoad(kilograms: number): number {
  return Math.round(kilograms * 10_000) / 10_000;
}

describe('weights (INV-01, INV-02)', () => {
  it('shows kilograms with a decimal point in English and a decimal comma in Portuguese', () => {
    expect(formatWeight(62.5, 'metric', 'en')).toEqual({ text: '62.5', amount: 62.5, unit: 'kg' });
    expect(formatWeight(62.5, 'metric', 'pt-BR')).toEqual({ text: '62,5', amount: 62.5, unit: 'kg' });
    expect(formatWeight(40, 'metric', 'pt-BR').text).toBe('40');
    expect(formatWeight(1.25, 'metric', 'en').text).toBe('1.25');
  });

  it.each([
    ['5 lb', 5],
    ['2.5 lb', 2.5],
  ])('shows every load on a %s grid, after storage precision, as an exact multiple over 52 cycles', (_, stepLb) => {
    for (let cycle = 0; cycle <= 52; cycle += 1) {
      const pounds = 135 + stepLb * cycle;
      const stored = storedAsLoad(pounds * KILOGRAMS_PER_POUND);
      const shown = formatWeight(stored, 'imperial', 'en');

      expect(shown.amount).toBe(pounds);
      expect(shown.text).toBe(String(pounds));
      expect(shown.unit).toBe('lb');
    }
  });

  it('parses keypad input with either separator to the same kilograms, in both unit systems', () => {
    expect(keypadWeightToKilograms('62,5', 'metric')).toBe(62.5);
    expect(keypadWeightToKilograms('62.5', 'metric')).toBe(62.5);
    expect(keypadWeightToKilograms('137,5', 'imperial')).toBe(keypadWeightToKilograms('137.5', 'imperial'));
    expect(keypadWeightToKilograms('137.5', 'imperial')).toBeCloseTo(137.5 * KILOGRAMS_PER_POUND, 12);
  });

  it('round-trips a pound load typed in Portuguese back to the same text', () => {
    const kilograms = storedAsLoad(keypadWeightToKilograms('137,5', 'imperial') ?? Number.NaN);
    expect(formatWeight(kilograms, 'imperial', 'pt-BR').text).toBe('137,5');
    expect(weightForKeypad(kilograms, 'imperial', 'pt-BR')).toBe('137,5');
  });

  it('never groups the keypad value', () => {
    expect(weightForKeypad(1250, 'metric', 'en')).toBe('1250');
    expect(formatWeight(1250, 'metric', 'en').text).toBe('1,250');
    expect(formatWeight(1250, 'metric', 'pt-BR').text).toBe('1.250');
  });
});

describe('keypad input', () => {
  it.each(['', '.', ',', '1,2,3', '1.2.3', '1.2,3', 'abc', '-5', '1 000', '1e3'])('refuses %p', (input) => {
    expect(parseDecimalInput(input)).toBeNull();
  });

  it.each([
    ['5', 5],
    ['5.', 5],
    [',5', 0.5],
    ['0,25', 0.25],
  ])('accepts %p', (input, expected) => {
    expect(parseDecimalInput(input)).toBe(expected);
  });
});

describe('decimals', () => {
  it('rounds half away from zero, as the number reads', () => {
    expect(formatDecimal(1.005, 'en', { maxFractionDigits: 2 })).toBe('1.01');
    expect(formatDecimal(-2.5, 'en', { maxFractionDigits: 0 })).toBe('-3');
    expect(formatDecimal(-0.001, 'en', { maxFractionDigits: 2 })).toBe('0');
  });

  it('groups thousands with the locale separator', () => {
    expect(formatDecimal(12345.6, 'en', { maxFractionDigits: 1 })).toBe('12,345.6');
    expect(formatDecimal(12345.6, 'pt-BR', { maxFractionDigits: 1 })).toBe('12.345,6');
  });
});

describe('distance, elevation, temperature and duration', () => {
  it('shows distance in kilometres or miles', () => {
    expect(formatDistance(5000, 'metric', 'pt-BR')).toEqual({ text: '5', amount: 5, unit: 'km' });
    expect(formatDistance(5000, 'imperial', 'en')).toEqual({ text: '3.11', amount: 3.11, unit: 'mi' });
  });

  it('shows elevation in whole metres or feet', () => {
    expect(formatElevation(100, 'metric', 'en').text).toBe('100');
    expect(formatElevation(100, 'imperial', 'en')).toEqual({ text: '328', amount: 328, unit: 'ft' });
  });

  it('shows temperature in whole degrees', () => {
    expect(formatTemperature(0, 'imperial', 'en').text).toBe('32');
    expect(formatTemperature(-40, 'imperial', 'en').text).toBe('-40');
    expect(formatTemperature(21.4, 'metric', 'pt-BR')).toEqual({ text: '21', amount: 21, unit: 'celsius' });
  });

  it('shows durations as h:mm:ss or m:ss', () => {
    expect(formatDuration(3909)).toBe('1:05:09');
    expect(formatDuration(309.9)).toBe('5:09');
    expect(formatDuration(0)).toBe('0:00');
  });
});

/** What Postgres and SQLite keep of a set's distance: `numeric(9,3)` (task 004 stage 5c, 03 §4). */
function storedAsSetDistance(metres: number): number {
  return Math.round(metres * 1_000) / 1_000;
}

describe('a set’s distance — a carry, a sled push (task 004 stage 5c, INV-01)', () => {
  it('shows metres, or feet for an imperial user — never kilometres or miles for a carry', () => {
    expect(formatShortDistance(30, 'metric', 'en')).toEqual({ text: '30', amount: 30, unit: 'm' });
    expect(formatShortDistance(12.5, 'metric', 'pt-BR').text).toBe('12,5');
    expect(formatShortDistance(30.48, 'imperial', 'en')).toEqual({ text: '100', amount: 100, unit: 'ft' });
  });

  it('reads back exactly what an imperial user typed — the reason the column is no longer an integer', () => {
    // As an integer, 100 ft stored 30 m and read back as 98 ft. Every tenth of a foot from 1 to 300 must survive.
    for (let tenths = 10; tenths <= 3000; tenths += 1) {
      const typed = (tenths / 10).toFixed(1);
      const metres = keypadShortDistanceToMetres(typed, 'imperial');
      expect(metres).not.toBeNull();
      const readBack = formatShortDistance(storedAsSetDistance(metres ?? 0), 'imperial', 'en').text;
      expect(readBack).toBe(String(Number(typed)));
    }
  });

  it('would not have with whole metres — the defect this column change fixes', () => {
    const metres = keypadShortDistanceToMetres('100', 'imperial') ?? 0;
    expect(formatShortDistance(Math.round(metres), 'imperial', 'en').text).toBe('98.4');
  });

  it('takes the keypad in the user’s own unit and separator, and blank is not recorded', () => {
    expect(keypadShortDistanceToMetres('25,5', 'metric')).toBe(25.5);
    expect(keypadShortDistanceToMetres('100', 'imperial')).toBe(30.48);
    expect(keypadShortDistanceToMetres('', 'metric')).toBeNull();
    expect(shortDistanceForKeypad(30.48, 'imperial', 'pt-BR')).toBe('100');
    expect(shortDistanceForKeypad(12.5, 'metric', 'pt-BR')).toBe('12,5');
  });
});
