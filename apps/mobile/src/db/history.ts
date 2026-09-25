/**
 * What a finished workout's records are computed from — task 004 stage 6.
 *
 * **Nothing here is a record.** The device keeps no `personal_records` table (03 §4, §8): the summary recomputes from
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
import { and, asc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';

import type { LoggedSet } from '@/domain';

import { db } from './client';
import { bodyWeightLog, exercises, microcycles, plannedSessions, setLogs, workoutExercises, workouts } from './schema';
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

// ── reads ────────────────────────────────────────────────────────────────────────────────────────

/**
 * The latest body weight on or before the workout's own day (INV-07, INV-17). Compared as ISO dates, which order
 * correctly as text; a tombstoned entry is not a weigh-in.
 */
const bodyWeightOnTheDay = sql<number | null>`(
  SELECT ${bodyWeightLog.weightKg} FROM ${bodyWeightLog}
  WHERE ${bodyWeightLog.userId} = ${workouts.userId}
    AND ${bodyWeightLog.measuredOn} <= ${workouts.localDate}
    AND ${bodyWeightLog.deletedAt} IS NULL
  ORDER BY ${bodyWeightLog.measuredOn} DESC
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
};

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
