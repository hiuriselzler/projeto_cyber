import {
  countedSetCount,
  detectPrs,
  personalBests,
  volumeKg,
  type LoggedSet,
  type PrAchievement,
  type PrKind,
} from '@/domain';

/**
 * The finish summary's arithmetic — task 004 stage 6 — none of which happens here. Every total and every record is the
 * core's (INV-04, INV-07, INV-08, ADR-004): this module decides only *which* sets are handed to it, and in what groups.
 *
 * The only module in this feature that reaches the core, and only the summary screen imports it: the live screen must
 * not load a native module to count its ticks, and its tests could not if it did.
 */

/** One exercise's sets in the finished workout, as `src/db/history` reads them. */
export interface ExerciseSets {
  readonly exerciseId: string;
  readonly sets: readonly LoggedSet[];
}

export interface WorkoutTotals {
  /** Sets that counted (INV-04) — warm-ups, drops, back-offs and unticked rows are logged and not in here. */
  readonly countedSets: number;
  /** Tonnage of the counted sets, in kilograms (INV-01). */
  readonly volumeKg: number;
  /** Rows the user never ticked. Kept, never deleted, counting for nothing (stage 6, decision 7). */
  readonly untickedSets: number;
}

/** The workout's totals, through the core. */
export function totalsOf(exercises: readonly ExerciseSets[]): WorkoutTotals {
  const all = exercises.flatMap((exercise) => exercise.sets);
  return {
    countedSets: countedSetCount(all),
    volumeKg: volumeKg(all),
    untickedSets: all.filter((set) => !set.isCompleted).length,
  };
}

export interface ExerciseRecord {
  readonly exerciseId: string;
  readonly record: PrAchievement;
}

/**
 * Every record the workout broke, exercise by exercise in workout order, each exercise's in the core's own order.
 *
 * Each exercise is judged against **every other finished workout** of it, whatever its date (stage 6, decision 2) —
 * `historyOf` hands those over, one session per workout — so what this celebrates is always the current best, and
 * reopening the summary later says the same thing again, because a tie is not a record (INV-10).
 */
export function recordsOf(
  exercises: readonly ExerciseSets[],
  historyOf: (exerciseId: string) => readonly (readonly LoggedSet[])[],
): ExerciseRecord[] {
  return exercises.flatMap((exercise) =>
    detectPrs(personalBests(historyOf(exercise.exerciseId)), exercise.sets).map((record) => ({
      exerciseId: exercise.exerciseId,
      record,
    })),
  );
}

/** The catalog key naming each kind of record. */
export const RECORD_KIND_KEY: Record<PrKind, string> = {
  max_weight: 'summary.record.max_weight',
  best_e1rm: 'summary.record.best_e1rm',
  max_reps_at_weight: 'summary.record.max_reps_at_weight',
  best_session_volume: 'summary.record.best_session_volume',
};

/** Whether a record's value is a load in kilograms — every kind but reps at a weight, which is a count. */
export function isWeightRecord(kind: PrKind): boolean {
  return kind !== 'max_reps_at_weight';
}
