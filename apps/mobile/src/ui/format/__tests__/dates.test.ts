import { formatCalendarDay, formatClock } from '../dates';

describe('calendar days', () => {
  // Built in the device's own time zone, so the day is the same wherever the test runs.
  const midday = new Date(2026, 8, 1, 12).getTime();

  it('writes a day in numbers, in each language’s order', () => {
    expect(formatCalendarDay(midday, 'en')).toBe('2026-09-01');
    expect(formatCalendarDay(midday, 'pt-BR')).toBe('01/09/2026');
  });

  it('takes the day where the device is, not in UTC', () => {
    const lateEvening = new Date(2026, 11, 31, 23, 59).getTime();

    expect(formatCalendarDay(lateEvening, 'en')).toBe('2026-12-31');
  });
});

describe('a time of day (task 004 stage 6)', () => {
  it('is the 24-hour clock, zero-padded, the same in both languages', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(7 * 60 + 5)).toBe('07:05');
    expect(formatClock(19 * 60 + 30)).toBe('19:30');
    expect(formatClock(23 * 60 + 59)).toBe('23:59');
  });
});
