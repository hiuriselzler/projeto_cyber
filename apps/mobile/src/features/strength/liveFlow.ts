import type { LiveExercise, LiveSet, LiveWorkout } from '@/db/strength';

/**
 * How a live workout moves — where focus goes after a ✓, and whether a rest is running (task 004 stage 5b).
 *
 * Both are pure functions of the workout **as re-read from SQLite** after the write, never of what the screen
 * remembers (INV-09). That is what lets a force-quit mid-rest come back with the timer still running: there is no
 * timer to lose, only a completed set and a rest length, both on disk.
 */

export interface SetAddress {
  readonly workoutExerciseId: string;
  readonly setLogId: string;
}

/** The run of neighbours sharing `exercises[index]`'s superset group — just that exercise when it has none (FR-2.6). */
function supersetRun(exercises: readonly LiveExercise[], index: number): { start: number; end: number } {
  const group = exercises[index]?.supersetGroup ?? null;
  let start = index;
  let end = index;
  if (group === null) return { start, end };
  while (start > 0 && exercises[start - 1]?.supersetGroup === group) start -= 1;
  while (end < exercises.length - 1 && exercises[end + 1]?.supersetGroup === group) end += 1;
  return { start, end };
}

function firstIncomplete(exercise: LiveExercise | undefined, after = 0): LiveSet | undefined {
  return exercise?.sets.find((set) => !set.isCompleted && set.setIndex > after);
}

function address(exercise: LiveExercise, set: LiveSet): SetAddress {
  return { workoutExerciseId: exercise.id, setLogId: set.id };
}

function locate(workout: LiveWorkout, setLogId: string) {
  for (let index = 0; index < workout.exercises.length; index += 1) {
    const exercise = workout.exercises[index];
    const set = exercise?.sets.find((one) => one.id === setLogId);
    if (exercise !== undefined && set !== undefined) return { index, exercise, set };
  }
  return null;
}

/**
 * Where focus goes after `setLogId` is ticked — 07 §6's "✓ advances focus to the next set".
 *
 * - **Alone**, the next incomplete set of the same exercise, then the first incomplete set of the exercises after it.
 * - **In a superset**, the round alternates: the next exercise in the run that still has a set to do, then back to the
 *   top of the run for the next round, and only when the whole run is done does focus leave it (FR-2.6, task 004
 *   § Stages, decision 4).
 *
 * Null when nothing is left to do.
 */
export function nextFocus(workout: LiveWorkout, setLogId: string): SetAddress | null {
  const found = locate(workout, setLogId);
  if (found === null) return null;
  const { exercises } = workout;
  const run = supersetRun(exercises, found.index);

  if (run.end > run.start) {
    for (let at = found.index + 1; at <= run.end; at += 1) {
      const exercise = exercises[at];
      const set = firstIncomplete(exercise);
      if (exercise !== undefined && set !== undefined) return address(exercise, set);
    }
    for (let at = run.start; at <= run.end; at += 1) {
      const exercise = exercises[at];
      const set = firstIncomplete(exercise);
      if (exercise !== undefined && set !== undefined) return address(exercise, set);
    }
  } else {
    const later = firstIncomplete(found.exercise, found.set.setIndex);
    if (later !== undefined) return address(found.exercise, later);
  }

  for (let at = run.end + 1; at < exercises.length; at += 1) {
    const exercise = exercises[at];
    const set = firstIncomplete(exercise);
    if (exercise !== undefined && set !== undefined) return address(exercise, set);
  }
  return null;
}

/**
 * How long to rest after `setLogId`, in seconds — or null for no rest.
 *
 * Null when the exercise has no rest set (NULL is no timer, never a default — decision 1), and **null mid-round in a
 * superset**: when focus moves on to a later exercise of the same run, the lifter goes straight to it. The rest comes
 * once the round wraps back to the top, or the run is done (decision 4).
 */
export function restAfter(workout: LiveWorkout, setLogId: string): number | null {
  const found = locate(workout, setLogId);
  if (found === null) return null;
  const seconds = found.exercise.restSeconds;
  if (seconds === null || seconds <= 0) return null;

  const run = supersetRun(workout.exercises, found.index);
  if (run.end > run.start) {
    const next = nextFocus(workout, setLogId);
    const nextIndex = next === null ? -1 : workout.exercises.findIndex((one) => one.id === next.workoutExerciseId);
    if (nextIndex > found.index && nextIndex <= run.end) return null;
  }
  return seconds;
}

export interface RunningRest {
  /** The set whose completion started it — what a skip is recorded against. */
  readonly setLogId: string;
  readonly workoutExerciseId: string;
  readonly seconds: number;
  readonly endsAt: number;
}

/**
 * The rest running at `now`, if any: the most recently completed set, plus the rest that follows it (decision 2).
 *
 * Derived, never stored — the whole reason it survives a force-quit. Nothing runs once it has ended, after a skip of
 * that same set, or when the last thing ticked was mid-superset.
 */
export function runningRest(workout: LiveWorkout, now: number, skippedSetLogId: string | null): RunningRest | null {
  let latest: { exercise: LiveExercise; set: LiveSet; at: number } | null = null;
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) {
      if (set.isCompleted && set.completedAt !== null && (latest === null || set.completedAt > latest.at)) {
        latest = { exercise, set, at: set.completedAt };
      }
    }
  }
  if (latest === null || latest.set.id === skippedSetLogId) return null;

  const seconds = restAfter(workout, latest.set.id);
  if (seconds === null) return null;
  const endsAt = latest.at + seconds * 1000;
  if (now >= endsAt) return null;
  return { setLogId: latest.set.id, workoutExerciseId: latest.exercise.id, seconds, endsAt };
}

/** Whole seconds left, rounded up — a timer reading 0:00 while time remains would be lying by up to a second. */
export function secondsLeft(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/**
 * How many sets of the workout are ticked, and how many are not — what the finish sheet says before finishing (task
 * 004 stage 6). A count of completion, not of what *counts*: that is INV-04's and the core's, and the summary asks it.
 */
export function tickCounts(workout: LiveWorkout): { ticked: number; unticked: number } {
  let ticked = 0;
  let unticked = 0;
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) {
      if (set.isCompleted) ticked += 1;
      else unticked += 1;
    }
  }
  return { ticked, unticked };
}

/** A rest lengthened or shortened by `delta` seconds, never below zero. */
export function adjustedRest(current: number, delta: number): number {
  return Math.max(0, current + delta);
}
