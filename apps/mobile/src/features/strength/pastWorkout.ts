/**
 * The day and times of a workout logged after the fact — FR-2.13, task 004 stage 6, decision 4. Where the device is,
 * because that is the zone the workout is recorded in (INV-17).
 */

/**
 * Local midnight of the day `daysBack` days before the one `now` falls on. Built from the date's parts rather than by
 * subtracting 24 hours, which a daylight-saving change would make wrong twice a year.
 */
export function dayStart(now: number, daysBack: number): number {
  const today = new Date(now);
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysBack).getTime();
}

/** The instant a time of day falls on, on the day starting at `dayStartMs`. */
export function atMinutes(dayStartMs: number, minutesAfterMidnight: number): number {
  const day = new Date(dayStartMs);
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(minutesAfterMidnight / 60),
    minutesAfterMidnight % 60,
  ).getTime();
}
