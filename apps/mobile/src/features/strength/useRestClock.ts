import { useEffect, useState } from 'react';

import type { LiveWorkout } from '@/db/strength';
import { restOverTap } from '@/platform';

import { runningRest, secondsLeft, type RunningRest } from './liveFlow';

/** How often the countdown redraws. A quarter second keeps the displayed second honest without a busy loop. */
const TICK_MS = 250;

export interface RestClock {
  readonly rest: RunningRest;
  /** Whole seconds left, never more than the rest itself. */
  readonly secondsLeft: number;
}

/**
 * The rest running now, counted down — or null while none is. Shared by the two places a rest is shown: the bar above
 * the list, and the keypad's heading line while a field is being edited (07 §6). Exactly one of them is mounted at a
 * time, so the end is felt once.
 *
 * **It holds a clock and nothing else.** Whether a rest is running, and until when, is `runningRest` over the workout
 * as SQLite holds it (task 004 § Stages, decision 2), so a force-quit mid-rest comes back to the same rest counting the
 * same seconds. It lives in whichever small component shows it: the countdown re-renders four times a second, and the
 * set rows beside it must not re-render with it — the ✓'s 100 ms (NFR-2) is spent on the write, not on a ticking parent.
 *
 * The end is felt — a haptic, once — because the lifter is looking at the screen, not at the phone. With the app in the
 * background the scheduled notification says it instead (`useLiveWorkout`).
 */
export function useRestClock(workout: LiveWorkout, skippedRest: string | null): RestClock | null {
  const [now, setNow] = useState(() => Date.now());
  const rest = runningRest(workout, now, skippedRest);
  const endsAt = rest?.endsAt ?? null;

  useEffect(() => {
    if (endsAt === null) return undefined;
    // The end is felt only when it is *seen* crossing — the previous tick before it, this one after. A rest that had
    // already ended when the clock resumed (an un-tick bringing an old one back) ends silently rather than buzzing late.
    let last = Date.now();
    const id = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (last < endsAt && tick >= endsAt) restOverTap();
      last = tick;
    }, TICK_MS);
    return () => clearInterval(id);
  }, [endsAt]);

  if (rest === null) return null;
  // The clock only runs while a rest does, so `now` can be stale the moment a new one starts. The set's completion is
  // a moment that has certainly passed, so it is a floor the display can trust: a fresh rest reads full, never long.
  const startedAt = rest.endsAt - rest.seconds * 1000;
  return { rest, secondsLeft: secondsLeft(rest.endsAt, Math.max(now, startedAt)) };
}
