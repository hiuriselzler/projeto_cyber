import { db, sqlite } from './client';
import { exercises, muscleGroups, setLogs, users, workoutExercises, workouts } from './schema';

/** Every table in 03 §8 — 33 shared with Postgres, plus raw_gps_points, outbox and sync_state. */
export const EXPECTED_TABLES = 36;

export interface LocalDatabaseState {
  /** Rows in Drizzle's migration log. Unchanged across launches if migrations are idempotent. */
  readonly migrationsApplied: number;
  /** Application tables present, for task 017's check that the whole device schema exists. */
  readonly tables: number;
}

export function readLocalDatabaseState(): LocalDatabaseState {
  const migrations = sqlite.getFirstSync<{ count: number }>(
    'SELECT count(*) AS count FROM __drizzle_migrations',
  );
  const tables = sqlite.getFirstSync<{ count: number }>(
    "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' " +
      "AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations'",
  );
  return { migrationsApplied: migrations?.count ?? 0, tables: tables?.count ?? 0 };
}

export interface SqliteRoundTripResult {
  readonly ok: boolean;
  readonly detail: string;
}

/** Forces the round-trip transaction to roll back, success or failure — it writes no real history. */
class RoundTripRollback {
  constructor(readonly result: SqliteRoundTripResult) {}
}

const MARKER = 'diagnostic-round-trip';

/**
 * Task 017 (from task 002): writes a workout, an exercise and 3 sets through the same Drizzle path
 * the app uses, reads them back, and checks 03 §8's on-device type mapping holds for real —
 * booleans stored as SQLite integer 0/1, timestamps as epoch-millisecond integers. Runs inside a
 * transaction that always rolls back, so nothing it writes is left behind (INV-11 does not apply:
 * this is a throwaway fixture, not training history).
 */
export function checkSqliteRoundTrip(): SqliteRoundTripResult {
  const now = Date.now();
  const userId = `${MARKER}-user`;
  const muscleId = 2_147_483_647; // sentinel id, far outside any seeded catalog range
  const exerciseId = `${MARKER}-exercise`;
  const workoutId = `${MARKER}-workout`;
  const workoutExerciseId = `${MARKER}-workout-exercise`;

  try {
    db.transaction((tx) => {
      tx.insert(users)
        .values({
          id: userId,
          email: `${MARKER}@example.invalid`,
          displayName: 'Round-trip diagnostic',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      tx.insert(muscleGroups).values({ id: muscleId, nameKey: `${MARKER}-muscle`, region: 'other' }).run();
      tx.insert(exercises)
        .values({
          id: exerciseId,
          ownerUserId: userId,
          name: 'Round-trip diagnostic exercise',
          modality: 'other',
          primaryMuscleId: muscleId,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      tx.insert(workouts)
        .values({
          id: workoutId,
          userId,
          title: 'Round-trip diagnostic workout',
          startedAt: now,
          localDate: '2026-09-17',
          tz: 'UTC',
          source: 'manual',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      tx.insert(workoutExercises)
        .values({
          id: workoutExerciseId,
          userId,
          workoutId,
          exerciseId,
          orderIndex: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      for (let index = 0; index < 3; index += 1) {
        tx.insert(setLogs)
          .values({
            id: `${MARKER}-set-${index}`,
            userId,
            workoutExerciseId,
            setIndex: index,
            weightKg: 100 + index * 2.5,
            reps: 8 - index,
            rir: index,
            isCompleted: index === 0,
            completedAt: index === 0 ? now : null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      // Raw SQL, deliberately bypassing Drizzle's decode step: this checks what SQLite actually
      // stored, not what the ORM converts it back to.
      const rows = sqlite.getAllSync<{
        set_index: number;
        is_completed: number;
        is_completed_type: string;
        completed_at: number | null;
        created_at: number;
        created_at_type: string;
      }>(
        `SELECT set_index, is_completed, typeof(is_completed) AS is_completed_type,
                completed_at, created_at, typeof(created_at) AS created_at_type
         FROM set_logs WHERE workout_exercise_id = ? ORDER BY set_index`,
        workoutExerciseId,
      );

      const problems: string[] = [];
      if (rows.length !== 3) problems.push(`wrote 3 sets, read back ${rows.length}`);
      for (const row of rows) {
        if (row.is_completed_type !== 'integer' || (row.is_completed !== 0 && row.is_completed !== 1)) {
          problems.push(
            `set ${row.set_index}: is_completed is ${row.is_completed_type} ${row.is_completed}, not integer 0/1`,
          );
        }
        if (row.created_at_type !== 'integer' || row.created_at !== now) {
          problems.push(
            `set ${row.set_index}: created_at is ${row.created_at_type} ${row.created_at}, not epoch-ms integer ${now}`,
          );
        }
        if (row.set_index === 0 && row.completed_at !== now) {
          problems.push(`set 0: completed_at is ${String(row.completed_at)}, expected epoch-ms ${now}`);
        }
      }

      throw new RoundTripRollback(
        problems.length === 0
          ? { ok: true, detail: '3 sets round-tripped; booleans as integer 0/1, timestamps as epoch ms' }
          : { ok: false, detail: problems.join('; ') },
      );
    });
  } catch (error) {
    if (error instanceof RoundTripRollback) return error.result;
    return { ok: false, detail: `round-trip check crashed: ${String(error)}` };
  }
  // db.transaction's callback always throws above, so this is unreachable — but TypeScript needs a return.
  return { ok: false, detail: 'round-trip check did not run' };
}
