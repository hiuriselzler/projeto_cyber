import { Redirect } from 'expo-router';
import { useState } from 'react';

import { readOpenWorkout } from '@/db/strength';

import { useSignedInUserId } from './useLiveWorkout';

/**
 * Whether this launch has already offered the open workout. Module state on purpose: it lives exactly as long as the
 * process, which is the definition of "a launch" — so a force-quit resets it and the next cold start resumes again,
 * while navigating home during the same session does not bounce the user back into the workout.
 */
let resumedThisLaunch = false;

/**
 * Reopen the workout in progress on a cold start — task 004's force-quit criterion (INV-09, FR-2.11).
 *
 * Stage 3 proved the *data* survives a force-stop; the app then landed on its home route with nothing offering the
 * workout back. A set that is safe on disk but that the user has to go looking for is not "restored the exact state".
 * The rest timer needs nothing here: it is derived from the rows (task 004 § Stages, decision 2), so arriving on the
 * workout screen is enough for it to be running again.
 */
export function ResumeOpenWorkout() {
  const userId = useSignedInUserId();
  // Decided once, at mount, from what SQLite holds — read in the initialiser, never in an effect.
  const [resume] = useState(() => {
    if (resumedThisLaunch || userId === null) return false;
    resumedThisLaunch = true;
    return readOpenWorkout(userId) !== null;
  });
  return resume ? <Redirect href="/workout" /> : null;
}
