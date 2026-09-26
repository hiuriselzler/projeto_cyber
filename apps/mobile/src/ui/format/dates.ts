/**
 * Calendar dates in numbers, in each language's own order — 2026-09-21, 21/09/2026 — the way the API writes them in
 * emails (task 019). No month names to translate, and no `Intl`, so a test under Node and the app under Hermes print
 * the same characters.
 */
import type { Locale } from './number';

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * A time of day, `19:30` — the 24-hour clock both languages read, so there is no AM/PM to translate (task 004 stage 6).
 */
export function formatClock(minutesAfterMidnight: number): string {
  const whole = Math.max(0, Math.floor(minutesAfterMidnight));
  return `${twoDigits(Math.floor(whole / 60) % 24)}:${twoDigits(whole % 60)}`;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/**
 * A stored calendar day — a workout's `local_date`, `2026-09-23` — in the language's own order (task 004 stage 7).
 *
 * The day is taken as written, never through a `Date`: it is a fact recorded where the workout happened (INV-17), and
 * turning it into an instant would move it by the reader's time zone.
 */
export function formatLocalDate(isoDate: string, locale: Locale): string {
  const match = ISO_DATE.exec(isoDate);
  if (match === null) return isoDate;
  const [, year, month, day] = match;
  return locale === 'pt-BR' ? `${day}/${month}/${year}` : `${year}-${month}-${day}`;
}

/**
 * A stored calendar day as a count of days since 1970-01-01 — where it sits on a chart's time axis. Real dates, so a
 * gap of eleven days is eleven days wide; never a week bucket (INV-25). NaN for text that is not a date.
 */
export function dayNumberOf(isoDate: string): number {
  const match = ISO_DATE.exec(isoDate);
  if (match === null) return Number.NaN;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day)) / MS_PER_DAY;
}

/** The calendar day an instant falls on, where this device is. */
export function formatCalendarDay(epochMs: number, locale: Locale): string {
  const moment = new Date(epochMs);
  const year = String(moment.getFullYear());
  const month = twoDigits(moment.getMonth() + 1);
  const day = twoDigits(moment.getDate());
  return locale === 'pt-BR' ? `${day}/${month}/${year}` : `${year}-${month}-${day}`;
}
