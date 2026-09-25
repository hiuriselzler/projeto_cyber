/**
 * The formats the history screens add (task 004 stage 7): a stored day written as recorded, a day's place on a time
 * axis, and a weight as a plain number in the user's unit for a chart to plot.
 */
import { dayNumberOf, formatLocalDate } from '../dates';
import { KILOGRAMS_PER_POUND, weightInUnits, weightUnitOf } from '../quantities';

describe('a stored day', () => {
  it('is written in each language’s own order, exactly as recorded (INV-17)', () => {
    expect(formatLocalDate('2026-09-23', 'en')).toBe('2026-09-23');
    expect(formatLocalDate('2026-09-23', 'pt-BR')).toBe('23/09/2026');
  });

  it('never passes through a Date, so no time zone can move it', () => {
    // 1 January read as an instant in a zone west of UTC would print 31 December.
    expect(formatLocalDate('2026-01-01', 'pt-BR')).toBe('01/01/2026');
  });

  it('is left as it is if it is not a date', () => {
    expect(formatLocalDate('garbage', 'en')).toBe('garbage');
  });
});

describe('a day on a chart’s time axis', () => {
  it('counts real days, so a gap of eleven days is eleven wide (INV-25)', () => {
    expect(dayNumberOf('2026-09-23') - dayNumberOf('2026-09-12')).toBe(11);
    expect(dayNumberOf('2026-03-01') - dayNumberOf('2026-02-28')).toBe(1);
    expect(dayNumberOf('1970-01-01')).toBe(0);
  });

  it('is not a number for text that is not a date', () => {
    expect(dayNumberOf('23/09/2026')).toBeNaN();
  });
});

describe('a weight to plot', () => {
  it('is kilograms for metric and pounds for imperial, converted and never rounded (INV-01)', () => {
    expect(weightInUnits(100, 'metric')).toBe(100);
    expect(weightInUnits(100 * KILOGRAMS_PER_POUND, 'imperial')).toBeCloseTo(100, 10);
    expect(weightUnitOf('metric')).toBe('kg');
    expect(weightUnitOf('imperial')).toBe('lb');
  });

  it('keeps an imperial user’s own number: 225 lb stored as kilograms plots at 225', () => {
    const stored = 225 * KILOGRAMS_PER_POUND;
    expect(weightInUnits(stored, 'imperial')).toBeCloseTo(225, 10);
  });
});
