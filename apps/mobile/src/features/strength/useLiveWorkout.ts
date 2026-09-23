import { useCallback, useRef, useState, useSyncExternalStore } from 'react';

import { getSessionState, subscribeToSession } from '@/account';
import { readExercise } from '@/db/catalog';
import { moveItem } from '@/db/ordering';
import { readSkippedRest, writeSkippedRest } from '@/db/preferences';
import {
  addExercise,
  addSet,
  endWorkout,
  readOpenWorkout,
  removeSessionExercise,
  removeSet,
  reorderSessionExercises,
  setExerciseRest,
  setSetCompleted,
  setSetField,
  setSetType,
  startWorkout,
  toggleSessionSuperset,
  type LiveWorkout,
  type SetField,
  type SetType,
} from '@/db/strength';
import { askForNotifications, cancelRestEnd, confirmTap, prepareRestAlerts, scheduleRestEnd } from '@/platform';
import { readDeviceTimeZone, useT } from '@/ui';

import { exerciseLabel } from './exerciseName';
import { adjustedRest, nextFocus, runningRest } from './liveFlow';

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
  /** The set whose rest the user skipped, from the device's own store (task 004 § Stages, decision 2). */
  readonly skippedRest: string | null;
  readonly start: (title: string) => void;
  readonly addExercise: (exerciseId: string) => void;
  readonly addSet: (workoutExerciseId: string) => void;
  /** Tick or un-tick, and hand back the workout as SQLite now holds it — what the screen computes focus from. */
  readonly setCompleted: (setLogId: string, isCompleted: boolean) => LiveWorkout | null;
  readonly writeField: (setLogId: string, field: SetField, value: number | null) => void;
  readonly setType: (setLogId: string, setType: SetType) => void;
  readonly removeSet: (setLogId: string) => void;
  readonly setRest: (workoutExerciseId: string, restSeconds: number | null) => void;
  /** `±15 s` on the running timer: that exercise's rest for the rest of the session (decision 2). */
  readonly adjustRest: (deltaSeconds: number) => void;
  readonly skipRest: () => void;
  readonly moveExercise: (index: number, delta: -1 | 1) => void;
  readonly toggleSuperset: (index: number) => void;
  readonly removeExercise: (workoutExerciseId: string) => void;
  readonly finish: () => void;
}

/**
 * The live workout, held in SQLite and *read* into React — never the other way round (INV-09).
 *
 * Every function below writes first and then re-reads what actually landed, so the screen renders committed state
 * rather than an optimistic guess. That is the whole discipline: if the process dies between the write and the read,
 * the next launch finds the write. If it renders first and writes later, it does not.
 *
 * The rest notification follows the same rule from the other side: after every write the running rest is **derived**
 * from the fresh read, and the one scheduled notification is moved to match it — or taken back. Nothing about the
 * timer lives in memory that the database does not already imply (task 004 § Stages, decision 2).
 */
export function useLiveWorkout(userId: string | null): LiveWorkoutController {
  const t = useT();
  const [workout, setWorkout] = useState<LiveWorkout | null>(() =>
    userId === null ? null : readOpenWorkout(userId),
  );
  const [skippedRest, setSkippedRest] = useState<string | null>(() => readSkippedRest());
  // Who the state above was read for. `SessionGate` means the screen normally mounts already signed in, so this
  // rarely fires — but seeded-once state that silently belongs to the previous account is the kind of bug that is
  // free to prevent here and expensive to find later.
  const [readFor, setReadFor] = useState(userId);
  if (userId !== readFor) {
    setReadFor(userId);
    setWorkout(userId === null ? null : readOpenWorkout(userId));
  }

  /** What the rest notification was last scheduled for, so an edit that changes nothing does not reschedule it. */
  const scheduled = useRef<string | null>(null);

  const syncRestAlert = useCallback(
    (fresh: LiveWorkout | null, skipped: string | null) => {
      const rest = fresh === null ? null : runningRest(fresh, Date.now(), skipped);
      const key = rest === null ? null : `${rest.setLogId}:${String(rest.endsAt)}`;
      if (key === scheduled.current) return;
      scheduled.current = key;
      if (rest === null || fresh === null || userId === null) {
        void cancelRestEnd();
        return;
      }
      // Named after what comes next, in the language on screen now (INV-27). Resolved here, off the ✓'s path: the
      // write and the re-read are already done, and nothing below is awaited by the tap.
      const next = nextFocus(fresh, rest.setLogId);
      const nextExercise = fresh.exercises.find((one) => one.id === (next?.workoutExerciseId ?? rest.workoutExerciseId));
      const catalog = nextExercise === undefined ? null : readExercise(userId, nextExercise.exerciseId);
      const body = catalog === null ? '' : t('rest.over_body', { exercise: exerciseLabel(catalog, t) });
      void (async () => {
        // Asked at the first rest timer and never at launch; once refused, never again (decision 6).
        if ((await askForNotifications()) !== 'granted') return;
        await prepareRestAlerts(t('rest.channel'));
        await scheduleRestEnd({ atEpochMs: rest.endsAt, title: t('rest.over_title'), body });
      })();
    },
    [t, userId],
  );

  const refresh = useCallback((): LiveWorkout | null => {
    const fresh = userId === null ? null : readOpenWorkout(userId);
    setWorkout(fresh);
    syncRestAlert(fresh, skippedRest);
    return fresh;
  }, [skippedRest, syncRestAlert, userId]);

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
   * Synchronous end to end: the row already exists, so there is no id to mint and nothing to await. The haptic and the
   * rest notification are fired after the write and never waited on (07 §6).
   */
  const setCompleted = useCallback(
    (setLogId: string, isCompleted: boolean) => {
      setSetCompleted(setLogId, isCompleted, Date.now());
      const fresh = refresh();
      if (isCompleted) confirmTap();
      return fresh;
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

  const changeType = useCallback(
    (setLogId: string, setType: SetType) => {
      setSetType(setLogId, setType, Date.now());
      refresh();
    },
    [refresh],
  );

  const dropSet = useCallback(
    (setLogId: string) => {
      removeSet(setLogId, Date.now());
      refresh();
    },
    [refresh],
  );

  const setRest = useCallback(
    (workoutExerciseId: string, restSeconds: number | null) => {
      setExerciseRest(workoutExerciseId, restSeconds, Date.now());
      refresh();
    },
    [refresh],
  );

  const adjustRest = useCallback(
    (deltaSeconds: number) => {
      if (workout === null) return;
      const rest = runningRest(workout, Date.now(), skippedRest);
      if (rest === null) return;
      setExerciseRest(rest.workoutExerciseId, adjustedRest(rest.seconds, deltaSeconds), Date.now());
      refresh();
    },
    [refresh, skippedRest, workout],
  );

  const skipRest = useCallback(() => {
    if (workout === null) return;
    const rest = runningRest(workout, Date.now(), skippedRest);
    if (rest === null) return;
    writeSkippedRest(rest.setLogId);
    setSkippedRest(rest.setLogId);
    syncRestAlert(workout, rest.setLogId);
  }, [skippedRest, syncRestAlert, workout]);

  const moveExercise = useCallback(
    (index: number, delta: -1 | 1) => {
      if (workout === null) return;
      const ids = workout.exercises.map((exercise) => exercise.id);
      reorderSessionExercises(workout.id, moveItem(ids, index, index + delta), Date.now());
      refresh();
    },
    [refresh, workout],
  );

  const toggleSuperset = useCallback(
    (index: number) => {
      if (workout === null) return;
      toggleSessionSuperset(workout.id, index, Date.now());
      refresh();
    },
    [refresh, workout],
  );

  const removeExercise = useCallback(
    (workoutExerciseId: string) => {
      if (workout === null) return;
      removeSessionExercise(workout.id, workoutExerciseId, Date.now());
      refresh();
    },
    [refresh, workout],
  );

  const finish = useCallback(() => {
    if (workout === null) return;
    endWorkout(workout.id, Date.now());
    refresh();
  }, [refresh, workout]);

  return {
    workout,
    skippedRest,
    start,
    addExercise: add,
    addSet: appendSet,
    setCompleted,
    writeField,
    setType: changeType,
    removeSet: dropSet,
    setRest,
    adjustRest,
    skipRest,
    moveExercise,
    toggleSuperset,
    removeExercise,
    finish,
  };
}
