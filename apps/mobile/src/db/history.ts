/**
 * What a finished workout's records are computed from — task 004 stage 6 — and what the history screens show, stage 7.
 *
 * **Nothing here is a record, and nothing here is a total.** The device keeps no `personal_records` table (03 §4, §8): the summary recomputes from
 * these rows through the core every time it opens (stage 6, decision 3). This module's job is the part the core cannot
 * do, because it is I/O — reading the sets, and resolving the two facts `LoggedSet` carries already looked up:
 *
 * - **body weight** — the latest `body_weight_log` entry **on or before the workout's `local_date`**, never today's, or
 *   every past pull-up's e1RM would move each time the user weighed in (INV-07, INV-17);
 * - **`is_deload`** — the flag of the microcycle the workout's planned session belongs to (INV-08). Always false until
 *   task 005 writes a plan, and a real join now rather than a constant, so the predicate is wired when plans arrive.
 *
 * Split like every module here (responsibility map, `src/db/`): the rows turned into the core's shape purely, which
 * Jest reaches, and the reads, which only a device does.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';

import type { LoggedSet } from '@/domain';

import { db } from './client';
import { qualified } from './qualified';
import {
  bodyWeightLog,
  exercises,
  microcycles,
  plannedSessions,
  setLogs,
  workoutExercises,
  workouts,
  type Tracking,
} from './schema';
import type { SetType } from './strength';

/** One set as read, with its two resolved facts beside it. */
export interface HistoryRow {
  readonly workoutId: string;
  readonly exerciseId: string;
  readonly setType: SetType;
  readonly isCompleted: boolean;
  readonly weightKg: number | null;
  readonly reps: number | null;
  readonly rir: number | null;
  readonly usesBodyweight: boolean;
  readonly bodyWeightKg: number | null;
  /** Null when the workout came from no plan — which, until task 005, is every workout. */
  readonly isDeload: boolean | null;
}

// ── rows, built purely ───────────────────────────────────────────────────────────────────────────

/** A row as the core wants it. `rir` stays null when it was not recorded — never 0 (INV-03). */
export function toLoggedSet(row: HistoryRow): LoggedSet {
  return {
    setType: row.setType,
    isCompleted: row.isCompleted,
    weightKg: row.weightKg,
    reps: row.reps,
    rir: row.rir,
    usesBodyweight: row.usesBodyweight,
    bodyWeightKg: row.bodyWeightKg,
    isDeload: row.isDeload ?? false,
  };
}

/**
 * Rows grouped into sessions — **one workout's sets of the exercise per session**, in the order the rows came.
 *
 * The grouping is the whole point: a session-volume best belongs to one session (`personal_bests`, stage 6 decision
 * 1). An exercise that appears twice in one workout is still one session, which is why this keys on the workout rather
 * than on the `workout_exercises` row.
 */
export function sessionsOf(rows: readonly HistoryRow[]): LoggedSet[][] {
  const sessions = new Map<string, LoggedSet[]>();
  for (const row of rows) {
    const session = sessions.get(row.workoutId);
    if (session === undefined) sessions.set(row.workoutId, [toLoggedSet(row)]);
    else session.push(toLoggedSet(row));
  }
  return [...sessions.values()];
}

/** A finished workout's sets, one group per exercise, in the order the exercises first appear. */
export function exercisesOf(rows: readonly HistoryRow[]): { exerciseId: string; sets: LoggedSet[] }[] {
  const byExercise = new Map<string, LoggedSet[]>();
  for (const row of rows) {
    const sets = byExercise.get(row.exerciseId);
    if (sets === undefined) byExercise.set(row.exerciseId, [toLoggedSet(row)]);
    else sets.push(toLoggedSet(row));
  }
  return [...byExercise.entries()].map(([exerciseId, sets]) => ({ exerciseId, sets }));
}

// ── stage 7: the history screens ─────────────────────────────────────────────────────────────────

/** A finished workout as the history list names it. */
export interface WorkoutListItem {
  readonly id: string;
  readonly title: string;
  readonly startedAt: number;
  /** The day it belongs to, fixed when it was recorded (INV-17). */
  readonly localDate: string;
}

/** One set exactly as it was logged — what a history shows, warm-ups and all (INV-04 excludes them from totals, not from the log). */
export interface PerformedSet {
  readonly setIndex: number;
  readonly setType: SetType;
  /** Kilograms, always; `src/ui` converts (INV-01). Added load for a bodyweight exercise. */
  readonly weightKg: number | null;
  readonly reps: number | null;
  /** Null is "not recorded", never 0 (INV-03). */
  readonly rir: number | null;
  readonly durationS: number | null;
  readonly distanceM: number | null;
  readonly isCompleted: boolean;
}

/** A history row: the core's inputs, plus what the screens show beside them. */
export interface PerformedRow extends HistoryRow {
  readonly setIndex: number;
  readonly durationS: number | null;
  readonly distanceM: number | null;
  readonly title: string;
  readonly startedAt: number;
  readonly localDate: string;
}

/** One workout's sets of one exercise, dated — a point on that exercise's charts and a line in its history. */
export interface DatedSession {
  readonly workoutId: string;
  readonly title: string;
  readonly startedAt: number;
  readonly localDate: string;
  /** As logged, for the list. */
  readonly performed: readonly PerformedSet[];
  /** The same sets as the core wants them, for its metrics. */
  readonly sets: readonly LoggedSet[];
}

function performedOf(row: PerformedSet): PerformedSet {
  return {
    setIndex: row.setIndex,
    setType: row.setType,
    weightKg: row.weightKg,
    reps: row.reps,
    rir: row.rir,
    durationS: row.durationS,
    distanceM: row.distanceM,
    isCompleted: row.isCompleted,
  };
}

/** Rows grouped into dated sessions, one per workout, in the order the rows came — the same grouping as {@link sessionsOf}. */
export function datedSessionsOf(rows: readonly PerformedRow[]): DatedSession[] {
  const sessions = new Map<string, { head: PerformedRow; performed: PerformedSet[]; sets: LoggedSet[] }>();
  for (const row of rows) {
    const session = sessions.get(row.workoutId);
    if (session === undefined) {
      sessions.set(row.workoutId, { head: row, performed: [performedOf(row)], sets: [toLoggedSet(row)] });
    } else {
      session.performed.push(performedOf(row));
      session.sets.push(toLoggedSet(row));
    }
  }
  return [...sessions.values()].map(({ head, performed, sets }) => ({
    workoutId: head.workoutId,
    title: head.title,
    startedAt: head.startedAt,
    localDate: head.localDate,
    performed,
    sets,
  }));
}

/** A row of a workout's detail: an exercise of it, and one of its sets — or no set, for an exercise with none logged. */
export interface DetailRow {
  readonly workoutExerciseId: string;
  readonly exerciseId: string;
  readonly tracking: Tracking;
  readonly notes: string | null;
  readonly setIndex: number | null;
  readonly setType: SetType | null;
  readonly weightKg: number | null;
  readonly reps: number | null;
  readonly rir: number | null;
  readonly durationS: number | null;
  readonly distanceM: number | null;
  readonly isCompleted: boolean | null;
}

/** One exercise of a finished workout, as its detail shows it. */
export interface DetailExercise {
  readonly workoutExerciseId: string;
  readonly exerciseId: string;
  readonly tracking: Tracking;
  /** The user's own words, exactly as typed (INV-27). */
  readonly notes: string | null;
  readonly sets: readonly PerformedSet[];
}

/**
 * Detail rows grouped per exercise *entry*, in workout order. Keyed on the `workout_exercises` row rather than the
 * exercise, because the detail shows the workout as it was done — an exercise done twice is two blocks, each with its
 * own note. An entry with no set keeps its block, so a note on it is not lost.
 */
export function detailExercisesOf(rows: readonly DetailRow[]): DetailExercise[] {
  const entries = new Map<string, { head: DetailRow; sets: PerformedSet[] }>();
  for (const row of rows) {
    let entry = entries.get(row.workoutExerciseId);
    if (entry === undefined) {
      entry = { head: row, sets: [] };
      entries.set(row.workoutExerciseId, entry);
    }
    if (row.setIndex !== null && row.setType !== null && row.isCompleted !== null) {
      entry.sets.push(
        performedOf({
          setIndex: row.setIndex,
          setType: row.setType,
          weightKg: row.weightKg,
          reps: row.reps,
          rir: row.rir,
          durationS: row.durationS,
          distanceM: row.distanceM,
          isCompleted: row.isCompleted,
        }),
      );
    }
  }
  return [...entries.values()].map(({ head, sets }) => ({
    workoutExerciseId: head.workoutExerciseId,
    exerciseId: head.exerciseId,
    tracking: head.tracking,
    notes: head.notes,
    sets,
  }));
}

// ── reads ────────────────────────────────────────────────────────────────────────────────────────

/**
 * The latest body weight on or before the workout's own day (INV-07, INV-17). Compared as ISO dates, which order
 * correctly as text; a tombstoned entry is not a weigh-in.
 *
 * Every column written out in full (`./qualified`). Bare, `user_id = user_id` would compare `body_weight_log` with
 * itself — any account's weigh-in on the device — and the query only rendered it qualified because it happens to join.
 */
export const bodyWeightOnTheDay = sql<number | null>`(
  SELECT ${qualified(bodyWeightLog, bodyWeightLog.weightKg)} FROM ${bodyWeightLog}
  WHERE ${qualified(bodyWeightLog, bodyWeightLog.userId)} = ${qualified(workouts, workouts.userId)}
    AND ${qualified(bodyWeightLog, bodyWeightLog.measuredOn)} <= ${qualified(workouts, workouts.localDate)}
    AND ${qualified(bodyWeightLog, bodyWeightLog.deletedAt)} IS NULL
  ORDER BY ${qualified(bodyWeightLog, bodyWeightLog.measuredOn)} DESC
  LIMIT 1
)`;

const historyColumns = {
  workoutId: workouts.id,
  exerciseId: workoutExercises.exerciseId,
  setType: setLogs.setType,
  isCompleted: setLogs.isCompleted,
  weightKg: setLogs.weightKg,
  reps: setLogs.reps,
  rir: setLogs.rir,
  usesBodyweight: exercises.usesBodyweight,
  bodyWeightKg: bodyWeightOnTheDay,
  isDeload: microcycles.isDeload,
  // What the history screens show beside the core's inputs (stage 7). Selected by every read so the joins below are
  // written once — a second copy of the deload join is how one of them would come to miss it.
  setIndex: setLogs.setIndex,
  durationS: setLogs.durationS,
  distanceM: setLogs.distanceM,
  title: workouts.title,
  startedAt: workouts.startedAt,
  localDate: workouts.localDate,
};

/** The sets with their workout, exercise and deload flag joined. */
function historyQuery() {
  return db
    .select(historyColumns)
    .from(setLogs)
    .innerJoin(workoutExercises, eq(workoutExercises.id, setLogs.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .leftJoin(plannedSessions, eq(plannedSessions.id, workouts.plannedSessionId))
    .leftJoin(microcycles, eq(microcycles.id, plannedSessions.microcycleId));
}

/** Every live row of a workout's own sets — tombstones out, unticked rows in, because the summary counts them. */
const liveRows = and(isNull(setLogs.deletedAt), isNull(workoutExercises.deletedAt), isNull(workouts.deletedAt));

/**
 * One workout's sets, grouped per exercise — what the summary judges. Scoped to its owner (INV-15): someone else's
 * workout reads as empty, exactly as a missing one does.
 */
export function readWorkoutSets(userId: string, workoutId: string): { exerciseId: string; sets: LoggedSet[] }[] {
  return exercisesOf(
    historyQuery()
      .where(and(eq(workouts.userId, userId), eq(workouts.id, workoutId), liveRows))
      .orderBy(asc(workoutExercises.orderIndex), asc(setLogs.setIndex))
      .all(),
  );
}

/**
 * Every **other finished** workout's sets of one exercise, one session per workout, oldest first — what that exercise's
 * standing bests are folded from (stage 6, decision 2). Not the open workout, not an archived one, and not the one
 * being judged: a record is the current best against everything else, whatever its date.
 */
export function readExerciseHistory(input: {
  readonly userId: string;
  readonly exerciseId: string;
  readonly exceptWorkoutId: string;
}): LoggedSet[][] {
  return sessionsOf(
    historyQuery()
      .where(
        and(
          eq(workouts.userId, input.userId),
          eq(workoutExercises.exerciseId, input.exerciseId),
          ne(workouts.id, input.exceptWorkoutId),
          isNotNull(workouts.endedAt),
          liveRows,
        ),
      )
      .orderBy(asc(workouts.startedAt), asc(workoutExercises.orderIndex), asc(setLogs.setIndex))
      .all(),
  );
}

/** The workout the summary is about: what it was and when, and what the user wrote on it. Null if gone or not theirs. */
export function readFinishedWorkout(userId: string, workoutId: string) {
  return (
    db
      .select({
        id: workouts.id,
        title: workouts.title,
        startedAt: workouts.startedAt,
        endedAt: workouts.endedAt,
        localDate: workouts.localDate,
        notes: workouts.notes,
        perceivedFatigue: workouts.perceivedFatigue,
      })
      .from(workouts)
      .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId), isNull(workouts.deletedAt)))
      .get() ?? null
  );
}

// ── stage 7's reads ──────────────────────────────────────────────────────────────────────────────

/** A finished, live workout: not the open one, not a discarded one (stage 6, decision 7). */
const finishedWorkout = and(isNotNull(workouts.endedAt), isNull(workouts.deletedAt));

/**
 * The user's `limit` most recent finished workouts, newest first — the history list, which grows by raising the limit.
 * Re-read whole on every return to the screen (`useDatabaseRead`), so a workout finished meanwhile appears at the top
 * rather than shifting a page. Scoped to its owner (INV-15).
 */
export function listFinishedWorkouts(userId: string, limit: number): WorkoutListItem[] {
  return db
    .select({ id: workouts.id, title: workouts.title, startedAt: workouts.startedAt, localDate: workouts.localDate })
    .from(workouts)
    .where(and(eq(workouts.userId, userId), finishedWorkout))
    .orderBy(desc(workouts.startedAt), desc(workouts.id))
    .limit(limit)
    .all();
}

/**
 * Every live set of each of these workouts, one group per workout — what the list's totals are computed from, in one
 * query per page rather than one per row. A workout with no set has no group.
 */
export function readSetsOfWorkouts(userId: string, workoutIds: readonly string[]): Map<string, LoggedSet[]> {
  if (workoutIds.length === 0) return new Map();
  const rows = historyQuery()
    .where(and(eq(workouts.userId, userId), inArray(workouts.id, [...workoutIds]), liveRows))
    .orderBy(asc(workoutExercises.orderIndex), asc(setLogs.setIndex))
    .all();
  const byWorkout = new Map<string, LoggedSet[]>();
  for (const row of rows) {
    const sets = byWorkout.get(row.workoutId);
    if (sets === undefined) byWorkout.set(row.workoutId, [toLoggedSet(row)]);
    else sets.push(toLoggedSet(row));
  }
  return byWorkout;
}

/**
 * A finished workout's exercises and every set as logged, in workout order — warm-ups, drops and unticked rows included,
 * since the detail is the log (INV-04 keeps them out of totals, not out of sight). Starts from `workout_exercises` so an
 * exercise with no set still shows its note. Empty for a workout that is not this user's (INV-15).
 */
export function readWorkoutDetail(userId: string, workoutId: string): DetailExercise[] {
  return detailExercisesOf(
    db
      .select({
        workoutExerciseId: workoutExercises.id,
        exerciseId: workoutExercises.exerciseId,
        tracking: exercises.tracking,
        notes: workoutExercises.notes,
        setIndex: setLogs.setIndex,
        setType: setLogs.setType,
        weightKg: setLogs.weightKg,
        reps: setLogs.reps,
        rir: setLogs.rir,
        durationS: setLogs.durationS,
        distanceM: setLogs.distanceM,
        isCompleted: setLogs.isCompleted,
      })
      .from(workoutExercises)
      .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
      .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
      .leftJoin(setLogs, and(eq(setLogs.workoutExerciseId, workoutExercises.id), isNull(setLogs.deletedAt)))
      .where(
        and(
          eq(workouts.userId, userId),
          eq(workouts.id, workoutId),
          isNull(workoutExercises.deletedAt),
          isNull(workouts.deletedAt),
        ),
      )
      .orderBy(asc(workoutExercises.orderIndex), asc(setLogs.setIndex))
      .all(),
  );
}

/**
 * Every finished workout's sets of one exercise, one dated session per workout, **oldest first** — the points of its
 * charts and the lines of its history. Reads through an archived exercise as readily as a live one: archiving never
 * orphans history (INV-11). Scoped to its owner (INV-15).
 */
export function readExerciseSessions(userId: string, exerciseId: string): DatedSession[] {
  return datedSessionsOf(
    historyQuery()
      .where(and(eq(workouts.userId, userId), eq(workoutExercises.exerciseId, exerciseId), finishedWorkout, liveRows))
      .orderBy(asc(workouts.startedAt), asc(workouts.id), asc(workoutExercises.orderIndex), asc(setLogs.setIndex))
      .all(),
  );
}
