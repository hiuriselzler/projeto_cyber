import { formatCalendarDay } from '../dates';

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
