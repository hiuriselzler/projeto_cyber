import { useCallback, useState, useSyncExternalStore } from 'react';

import { getSessionState, subscribeToSession } from '@/account';
import {
  addExercise,
  addSet,
  endWorkout,
  readOpenWorkout,
  setSetCompleted,
  setSetField,
  startWorkout,
  type LiveWorkout,
  type SetField,
} from '@/db/strength';
import { confirmTap } from '@/platform';
import { readDeviceTimeZone } from '@/ui';

/**
 * Who is signed in, read straight from `src/account`'s store.
 *
 * Three lines rather than an import of `features/account`'s identical hook: features may not import each other, and
 * what they share moves down into `domain/`, `db/` or `ui/` — none of which is a home for a React subscription to the
 * account store. The store itself is the shared thing, and both features read it.
 */
export function useSignedInUserId(): string | null {
  const session = useSyncExternalStore(subscribeToSession, getSessionState);
  return session.status === 'signed-in' ? session.account.id : null;
}

export interface LiveWorkoutController {
  readonly workout: LiveWorkout | null;
  readonly start: (title: string) => void;
  readonly addExercise: (exerciseId: string) => void;
  readonly addSet: (workoutExerciseId: string) => void;
  readonly setCompleted: (setLogId: string, isCompleted: boolean) => void;
  readonly writeField: (setLogId: string, field: SetField, value: number | null) => void;
  readonly finish: () => void;
}

/**
 * The live workout, held in SQLite and *read* into React — never the other way round (INV-09).
 *
 * Every function below writes first and then re-reads what actually landed, so the screen renders committed state
 * rather than an optimistic guess. That is the whole discipline: if the process dies between the write and the read,
 * the next launch finds the write. If it renders first and writes later, it does not.
 *
 * The cost is a re-read of the open workout per mutation. That is deliberate and it is the number stage 3 measures on
 * a device (NFR-2, < 100 ms) rather than reasons about here.
 */
export function useLiveWorkout(userId: string | null): LiveWorkoutController {
  const [workout, setWorkout] = useState<LiveWorkout | null>(() =>
    userId === null ? null : readOpenWorkout(userId),
  );
  // Who the state above was read for. `SessionGate` means the screen normally mounts already signed in, so this
  // rarely fires — but seeded-once state that silently belongs to the previous account is the kind of bug that is
  // free to prevent here and expensive to find later.
  const [readFor, setReadFor] = useState(userId);
  if (userId !== readFor) {
    setReadFor(userId);
    setWorkout(userId === null ? null : readOpenWorkout(userId));
  }

  const refresh = useCallback(() => {
    setWorkout(userId === null ? null : readOpenWorkout(userId));
  }, [userId]);

  const start = useCallback(
    (title: string) => {
      if (userId === null) return;
      // The zone is a fact recorded now, beside the local date (INV-17). With none offered, the workout still starts:
      // refusing to log because a device would not name its zone is the wrong trade at the door of a gym.
      const tz = readDeviceTimeZone() ?? 'UTC';
      void startWorkout({ userId, title, now: Date.now(), tz }).then(refresh);
    },
    [refresh, userId],
  );

  const add = useCallback(
    (exerciseId: string) => {
      if (userId === null || workout === null) return;
      void addExercise({ userId, workoutId: workout.id, exerciseId, now: Date.now() }).then(refresh);
    },
    [refresh, userId, workout],
  );

  const appendSet = useCallback(
    (workoutExerciseId: string) => {
      if (userId === null) return;
      void addSet({ userId, workoutExerciseId, now: Date.now() }).then(refresh);
    },
    [refresh, userId],
  );

  /**
   * The ✓ — the path NFR-2 gives 100 ms.
   *
   * Synchronous end to end: the row already exists, so there is no id to mint and nothing to await. The haptic is
   * fired after the write and never waited on (07 §6).
   */
  const setCompleted = useCallback(
    (setLogId: string, isCompleted: boolean) => {
      setSetCompleted(setLogId, isCompleted, Date.now());
      refresh();
      if (isCompleted) confirmTap();
    },
    [refresh],
  );

  const writeField = useCallback(
    (setLogId: string, field: SetField, value: number | null) => {
      setSetField(setLogId, field, value, Date.now());
      refresh();
    },
    [refresh],
  );

  const finish = useCallback(() => {
    if (workout === null) return;
    endWorkout(workout.id, Date.now());
    refresh();
  }, [refresh, workout]);

  return { workout, start, addExercise: add, addSet: appendSet, setCompleted, writeField, finish };
}
