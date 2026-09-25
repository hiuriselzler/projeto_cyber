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

/** The calendar day an instant falls on, where this device is. */
export function formatCalendarDay(epochMs: number, locale: Locale): string {
  const moment = new Date(epochMs);
  const year = String(moment.getFullYear());
  const month = twoDigits(moment.getMonth() + 1);
  const day = twoDigits(moment.getDate());
  return locale === 'pt-BR' ? `${day}/${month}/${year}` : `${year}-${month}-${day}`;
}
