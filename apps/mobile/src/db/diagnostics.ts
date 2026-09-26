import { and, eq, isNull } from 'drizzle-orm';

import { reconcilePlan, settlePlanStatuses } from '@/domain';

import { db, sqlite } from './client';
import { diffPlan, idsNeeded, insertBlock, prepareBlock, readPlan, rowsIn, type NewBlock } from './planner';
import { exercises, muscleGroups, progressionRules, setLogs, users, workoutExercises, workouts } from './schema';
import { localDayOf, readOpenWorkout, setLogRow, setSetCompleted } from './strength';

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

export interface ForeignKeyCheck {
  readonly ok: boolean;
  readonly detail: string;
}

/**
 * **Do the schema's 58 foreign keys actually bite on this device?** — task 004's device criterion.
 *
 * SQLite has foreign keys **off by default** and every connection must ask; `src/db/client.ts` asks, on the open
 * connection and outside any transaction, because inside one the pragma is a no-op. Stage 2 wrote that line and
 * refused to call it proven: nothing but a device can show it took effect.
 *
 * So this inserts a `set_logs` row pointing at a `workout_exercise_id` that does not exist. With the pragma on,
 * SQLite refuses it. With the pragma off — the state the phone was silently in until stage 2 — it accepts it happily,
 * and **being accepted is the failure**. Rolled back either way.
 */
export function checkForeignKeysEnforced(): ForeignKeyCheck {
  const pragma = sqlite.getFirstSync<{ foreign_keys: number }>('PRAGMA foreign_keys');
  const on = pragma?.foreign_keys === 1;
  const now = Date.now();
  const id = `${TICK_MARKER}-fk-orphan`;

  let rejected = false;
  let accepted = false;
  try {
    sqlite.execSync('BEGIN');
    db.insert(setLogs)
      .values(setLogRow({ id, userId: 'nobody', workoutExerciseId: 'no-such-workout-exercise', setIndex: 1, now }))
      .run();
    accepted = true;
  } catch {
    rejected = true;
  } finally {
    sqlite.execSync('ROLLBACK');
  }

  if (on && rejected) {
    return { ok: true, detail: 'PRAGMA foreign_keys = 1, and an orphan set_logs insert was rejected' };
  }
  if (!on) {
    return { ok: false, detail: `PRAGMA foreign_keys = ${String(pragma?.foreign_keys)} — the pragma did not take` };
  }
  return {
    ok: false,
    detail: accepted
      ? 'the pragma reads 1 but an orphan insert was ACCEPTED — the keys are not being enforced'
      : 'the orphan insert neither succeeded nor failed, which should not be reachable',
  };
}

export interface TickLatency {
  readonly taps: number;
  readonly sets: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly worstMs: number;
}

/** Same trick as the round trip: the measurement leaves no history behind. */
class TickRollback {
  constructor(readonly result: TickLatency) {}
}

const TICK_MARKER = 'diagnostic-tick-latency';
const TICK_TAPS = 60;
/** A realistic session to re-read: five exercises of four sets, which is what the budget has to hold at. */
const TICK_EXERCISES = 5;
const TICK_SETS_EACH = 4;

/**
 * **What tapping ✓ costs** — task 004's *"renders in < 100 ms on a mid-range Android device (measure, do not
 * assume)"*, measured rather than assumed (NFR-2).
 *
 * It times the two things the ✓ actually does, in order and on the real schema: the synchronous `UPDATE` that INV-09
 * requires before the UI moves, and the re-read of the whole open workout that the screen renders from. Sixty taps
 * across a five-exercise, twenty-set session, reported as p50, p95 and worst — a median alone would hide the stall
 * that is the one a user in a gym actually notices.
 *
 * **What it does not measure, stated so the number is not read as more than it is:** React's commit and the paint on
 * top. That half is settled by using the screen on the device. This half is the one that can regress silently as the
 * session grows, because it is the half that re-reads every row.
 */
export function measureTickLatency(): TickLatency {
  const now = Date.now();
  const userId = `${TICK_MARKER}-user`;
  const muscleId = 2_147_483_646; // a second sentinel, distinct from the round trip's
  const exerciseId = `${TICK_MARKER}-exercise`;
  const workoutId = `${TICK_MARKER}-workout`;
  const setIds: string[] = [];

  try {
    db.transaction((tx) => {
      tx.insert(users)
        .values({
          id: userId,
          email: `${TICK_MARKER}@example.invalid`,
          displayName: 'Tick latency diagnostic',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      tx.insert(muscleGroups).values({ id: muscleId, nameKey: `${TICK_MARKER}-muscle`, region: 'other' }).run();
      tx.insert(exercises)
        .values({
          id: exerciseId,
          ownerUserId: userId,
          name: 'Tick latency diagnostic exercise',
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
          title: 'Tick latency diagnostic workout',
          startedAt: now,
          localDate: '2026-09-19',
          tz: 'UTC',
          source: 'manual',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      for (let block = 0; block < TICK_EXERCISES; block += 1) {
        const workoutExerciseId = `${TICK_MARKER}-we-${block}`;
        tx.insert(workoutExercises)
          .values({ id: workoutExerciseId, userId, workoutId, exerciseId, orderIndex: block, createdAt: now, updatedAt: now })
          .run();
        for (let index = 1; index <= TICK_SETS_EACH; index += 1) {
          const id = `${TICK_MARKER}-set-${block}-${index}`;
          setIds.push(id);
          tx.insert(setLogs).values(setLogRow({ id, userId, workoutExerciseId, setIndex: index, now })).run();
        }
      }

      const samples: number[] = [];
      for (let tap = 0; tap < TICK_TAPS; tap += 1) {
        const id = setIds[tap % setIds.length];
        const started = performance.now();
        setSetCompleted(id, tap % (setIds.length * 2) < setIds.length, Date.now());
        readOpenWorkout(userId);
        samples.push(performance.now() - started);
      }
      samples.sort((a, b) => a - b);

      throw new TickRollback({
        taps: TICK_TAPS,
        sets: setIds.length,
        p50Ms: round(percentile(samples, 0.5)),
        p95Ms: round(percentile(samples, 0.95)),
        worstMs: round(samples[samples.length - 1] ?? 0),
      });
    });
  } catch (error) {
    if (error instanceof TickRollback) return error.result;
    throw error;
  }
  throw new Error('tick latency measurement did not run');
}

export interface Percentiles {
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly worstMs: number;
}

export interface CommitCost {
  /** `PRAGMA journal_mode` and `PRAGMA synchronous` as this connection runs them. */
  readonly journalMode: string;
  readonly synchronous: number;
  readonly writes: number;
  /** Each write its own transaction — what a ✓ pays, since it is one autocommitted `UPDATE`. */
  readonly committed: Percentiles;
  /** The same writes inside one transaction — what `measureTickLatency` has always measured. */
  readonly uncommitted: Percentiles;
}

const COMMIT_WRITES = 40;
const COMMIT_WARMUP = 5;

/**
 * **What a ✓'s commit costs** — task 004's closing pass (2026-09-25). `measureTickLatency` gives ~11 ms for the
 * write and the re-read, but on a real session the same two steps took 30–38 ms. That measure runs all its taps inside
 * one transaction it rolls back, so it has never paid a commit, and a real ✓ is an autocommitted `UPDATE` that does.
 *
 * This times one `UPDATE` both ways, on an existing set, and nothing else. The update writes each column back to
 * itself — SQLite still journals and rewrites the page, so the commit is real — and no trigger watches `set_logs`, so
 * nothing on the device changes: no row inserted, altered or deleted. Returns null on a device with no set to update.
 */
export function measureCommitCost(): CommitCost | null {
  const target = sqlite.getFirstSync<{ id: string }>('SELECT id FROM set_logs LIMIT 1');
  if (target === null) return null;
  const write = () => sqlite.runSync('UPDATE set_logs SET is_completed = is_completed WHERE id = ?', target.id);
  const timed = (): number => {
    const started = performance.now();
    write();
    return performance.now() - started;
  };

  for (let index = 0; index < COMMIT_WARMUP; index += 1) write();

  const committed: number[] = [];
  for (let index = 0; index < COMMIT_WRITES; index += 1) committed.push(timed());

  const uncommitted: number[] = [];
  sqlite.execSync('BEGIN');
  try {
    for (let index = 0; index < COMMIT_WRITES; index += 1) uncommitted.push(timed());
  } finally {
    sqlite.execSync('ROLLBACK');
  }

  const journal = sqlite.getFirstSync<{ journal_mode: string }>('PRAGMA journal_mode');
  const synchronous = sqlite.getFirstSync<{ synchronous: number }>('PRAGMA synchronous');
  return {
    journalMode: journal?.journal_mode ?? 'unknown',
    synchronous: synchronous?.synchronous ?? -1,
    writes: COMMIT_WRITES,
    committed: percentiles(committed),
    uncommitted: percentiles(uncommitted),
  };
}

function percentiles(samples: number[]): Percentiles {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    worstMs: round(sorted[sorted.length - 1] ?? 0),
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] ?? 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// ── Task 005 stage 4a: a planner block on this device ─────────────────────────────────────────────

export interface PlannerBlockMeasure {
  readonly rows: number;
  readonly cycles: number;
  /** Reading the catalog and the rule, generating through UniFFI, and minting every id. */
  readonly prepareMs: number;
  /** The batched insert, inside one transaction. */
  readonly insertMs: number;
  /** Prepare and insert — task 005's "a 24-cycle × 5-session block generates in < 500 ms on-device". */
  readonly totalMs: number;
  /** Reading the block back as the engine reads it, then settling and reconciling it. */
  readonly reconcileMs: number;
  /** Rows a reconciliation of the fresh block would write — zero, or the first write-back is not idempotent. */
  readonly rewrites: number;
  /** The first exercise's first-set load in cycles 1–5, as read back: 60, 62.5, 65, a deload, 67.5. */
  readonly firstLoads: string;
}

class PlannerRollback {
  constructor(readonly result: PlannerBlockMeasure) {}
}

const PLANNER_MARKER = 'diagnostic-planner';
const PLANNER_CYCLES = 24;
const PLANNER_DAYS = [1, 2, 4, 5, 6] as const;
const PLANNER_EXERCISES_EACH = 5;
const PLANNER_SETS_EACH = 4;

/**
 * **A 24-cycle × 5-session block, generated and written on this device** — task 005's 500 ms criterion, and the
 * proof that the write-back is idempotent against rows the device itself wrote (stage 4a).
 *
 * Five sessions of five exercises of four sets, every one of the 24 cycles materialised: some three thousand rows.
 * The block is inserted, read back and reconciled inside one transaction that is then rolled back, so it leaves no
 * history — only its rule, one archived row the block had to reference, reused on every run.
 */
export async function measurePlannerBlock(userId: string): Promise<PlannerBlockMeasure> {
  const now = Date.now();
  const today = localDayOf(now);
  const ruleId = `${PLANNER_MARKER}-rule-${userId}`;
  db.insert(progressionRules)
    .values({
      id: ruleId,
      userId,
      name: 'Planner diagnostic',
      strategy: 'linear_load',
      loadStepKg: 2.5,
      minReps: 8,
      maxReps: 8,
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    })
    .onConflictDoNothing()
    .run();
  const picks = db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(isNull(exercises.ownerUserId), isNull(exercises.deletedAt), eq(exercises.tracking, 'weight_reps')))
    .limit(PLANNER_DAYS.length * PLANNER_EXERCISES_EACH)
    .all();
  if (picks.length < PLANNER_DAYS.length * PLANNER_EXERCISES_EACH) throw new Error('the catalog is not seeded');

  const block: NewBlock = {
    userId,
    name: 'Planner diagnostic',
    goal: 'strength',
    startDate: today,
    numMicrocycles: PLANNER_CYCLES,
    defaultMicrocycleDays: 7,
    lengthOverrides: [],
    deload: { mode: 'every_n_microcycles', every: 4, finalCycle: false },
    defaultRuleId: ruleId,
    sessions: PLANNER_DAYS.map((dayIndex, at) => ({
      dayIndex,
      orderIndex: 0,
      name: `Session ${at + 1}`,
      exercises: picks.slice(at * PLANNER_EXERCISES_EACH, (at + 1) * PLANNER_EXERCISES_EACH).map((pick, order) => ({
        exerciseId: pick.id,
        orderIndex: order,
        progressionRuleId: null,
        restSeconds: 120,
        notes: null,
        sets: Array.from({ length: PLANNER_SETS_EACH }, (_, setIndex) => ({
          setIndex,
          setType: 'working' as const,
          targetWeightKg: 60,
          targetReps: 8,
          targetRir: 2,
        })),
      })),
    })),
  };

  const started = performance.now();
  const prepared = await prepareBlock(block, today, now);
  const preparedAt = performance.now();
  try {
    db.transaction((tx) => {
      insertBlock(tx, prepared);
      const insertedAt = performance.now();
      const read = readPlan(userId, prepared.mesocycle.id);
      if (read === null) throw new Error('the block did not read back');
      const settled = settlePlanStatuses(read.cycles, read.logs, today);
      const reconciled = reconcilePlan(read.spec, settled, read.logs, today);
      const diff = diffPlan(read.cycles, reconciled.cycles);
      const reconciledAt = performance.now();
      const rewrites =
        diff.cycles.updated.length +
        idsNeeded(diff) +
        diff.sets.updated.length +
        diff.cycles.archived.length +
        diff.sessions.archived.length +
        diff.exercises.archived.length +
        diff.sets.archived.length;
      const firstLoads = read.cycles
        .slice(0, 5)
        .map((cycle) => {
          const load = cycle.sessions[0]?.exercises[0]?.sets[0]?.targetWeightKg;
          return `${cycle.isDeload ? 'deload ' : ''}${String(load)}`;
        })
        .join(', ');
      throw new PlannerRollback({
        rows: rowsIn(prepared),
        cycles: read.cycles.length,
        prepareMs: round(preparedAt - started),
        insertMs: round(insertedAt - preparedAt),
        totalMs: round(insertedAt - started),
        reconcileMs: round(reconciledAt - insertedAt),
        rewrites,
        firstLoads,
      });
    });
  } catch (error) {
    if (error instanceof PlannerRollback) return error.result;
    throw error;
  }
  throw new Error('planner measurement did not run');
}