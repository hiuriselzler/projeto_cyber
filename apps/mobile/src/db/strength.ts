/**
 * The live workout, in the local database — task 004 stage 3.
 *
 * **[INV-09](../../../../docs/invariants.md) is the whole point of this file.** An in-progress workout lives in
 * SQLite, not in React state: every mutation below writes synchronously, and the screen re-reads what landed rather
 * than remembering what it sent. Killing the app mid-set must lose nothing, and the only way to promise that is for
 * memory never to hold the only copy of anything.
 *
 * The module splits in two, as every module here now does (responsibility map, `src/db/`):
 *
 * - **the rows, built purely** — `workoutRow`, `workoutExerciseRow`, `setLogRow` and the patch builders. These are
 *   where the decisions live, and they are the half Jest can reach.
 * - **the writes that land them** — everything below `── writes ──`. `expo-sqlite` cannot open under Node, so this
 *   half is settled on a device and nowhere else.
 *
 * Ids are UUIDv7 minted here, on the device, through `src/crypto`'s identifier entry point (INV-16,
 * [ADR-012](../../../../docs/decisions/ADR-012.md) § Amendment 2026-09-19). That is why the row-creating calls are
 * async and the row-*editing* calls are not — see `setSetCompleted`.
 */
import { and, asc, desc, eq, exists, isNotNull, isNull, ne } from 'drizzle-orm';

import { uuidV7 } from '@/crypto/identifiers';

import { db } from './client';
import { normaliseSupersets, toggleSupersetWithNext } from './ordering';
import { exercises, setLogs, workoutExercises, workouts, type Tracking } from './schema';

export type SetType = 'warmup' | 'working' | 'drop' | 'backoff' | 'amrap';

/** The numbers a set row edits — which of them depends on the exercise's tracking mode (FR-2.3, task 004 stage 5c). */
export type SetField = 'weightKg' | 'reps' | 'rir' | 'durationS' | 'distanceM';

export type { Tracking };

export interface LiveSet {
  readonly id: string;
  readonly setIndex: number;
  readonly setType: SetType;
  /** Kilograms, always. Conversion is `src/ui`'s alone (INV-01). */
  readonly weightKg: number | null;
  readonly reps: number | null;
  /** Null is "not recorded" and is never 0 (INV-03). */
  readonly rir: number | null;
  /** Seconds — a hold, or the time a carry took (`duration`, `distance_duration`). */
  readonly durationS: number | null;
  /** Metres, to the millimetre the column holds (`distance_duration`, 03 §4). */
  readonly distanceM: number | null;
  readonly isCompleted: boolean;
  /** When the set was ticked, or null. The rest timer is derived from this rather than held in memory (INV-09). */
  readonly completedAt: number | null;
}

/** What a session copies from its routine (03 §4), and may edit during the session. */
export interface SessionTargets {
  /** Null is no rest timer — never an invented default. */
  readonly restSeconds: number | null;
  readonly targetMinReps: number | null;
  readonly targetMaxReps: number | null;
  /** Shown beside a set as a target; never written into `set_logs.rir` (INV-03). */
  readonly targetRir: number | null;
}

export const NO_SESSION_TARGETS: SessionTargets = {
  restSeconds: null,
  targetMinReps: null,
  targetMaxReps: null,
  targetRir: null,
};

export interface LiveExercise extends SessionTargets {
  readonly id: string;
  readonly exerciseId: string;
  readonly orderIndex: number;
  /** Exercises sharing a value are supersetted together and alternate (FR-2.6). */
  readonly supersetGroup: number | null;
  /** What this exercise logs — which fields its row shows and which one completing a set needs (FR-2.3). */
  readonly tracking: Tracking;
  /** The user's own words, exactly as typed (INV-27). */
  readonly notes: string | null;
  readonly sets: readonly LiveSet[];
}

export interface LiveWorkout {
  readonly id: string;
  readonly title: string;
  readonly startedAt: number;
  readonly localDate: string;
  readonly tz: string;
  readonly notes: string | null;
  /** 1–10, the user's own annotation — not RPE, and never an input to anything (INV-03). */
  readonly perceivedFatigue: number | null;
  readonly exercises: readonly LiveExercise[];
}

// ── rows, built purely ───────────────────────────────────────────────────────────────────────────

/**
 * The calendar day an instant falls on where the device is standing, as `2026-09-19`.
 *
 * Written once, at the moment the workout starts, and never recomputed (INV-17): a 23:00 session in São Paulo belongs
 * to that day permanently, including to a user reading it from Lisbon next week. Built from the local-time getters
 * rather than `Intl`, for the reason `src/ui/format/dates.ts` gives — a test under Node and the app under Hermes must
 * print the same characters.
 */
export function localDayOf(epochMs: number): string {
  const moment = new Date(epochMs);
  const month = String(moment.getMonth() + 1).padStart(2, '0');
  const day = String(moment.getDate()).padStart(2, '0');
  return `${String(moment.getFullYear())}-${month}-${day}`;
}

export interface NewWorkout {
  readonly id: string;
  readonly userId: string;
  readonly title: string;
  readonly startedAt: number;
  readonly tz: string;
  /**
   * When the row is written, if that is not when the workout started — a workout logged after the fact (FR-2.13). The
   * row's own timestamps are always the real moment of the write: sync compares `updated_at` (NFR-4), and a backdated
   * one would lose to any stale copy (task 004 stage 6, decision 4).
   */
  readonly now?: number;
}

export function workoutRow(input: NewWorkout) {
  const writtenAt = input.now ?? input.startedAt;
  return {
    id: input.id,
    userId: input.userId,
    routineId: null,
    plannedSessionId: null,
    title: input.title,
    startedAt: input.startedAt,
    endedAt: null,
    localDate: localDayOf(input.startedAt),
    tz: input.tz,
    notes: null,
    perceivedFatigue: null,
    // A routine start overrides this and `routineId` (src/db/routines.ts); 'plan' is task 005's (03 §4).
    source: 'manual' as 'manual' | 'routine' | 'plan',
    createdAt: writtenAt,
    updatedAt: writtenAt,
    deletedAt: null,
    syncVersion: 1,
  };
}

/** Why a past workout's chosen times cannot be logged, or null if they can (FR-2.13, task 004 stage 6). */
export type PastWorkoutProblem = 'end_before_start' | 'in_future';

/**
 * The end must be after the start, and neither may be in the future: a workout logged after the fact has happened.
 * Equal times are refused too — a workout of no length is a mistyped one.
 */
export function pastWorkoutProblem(input: {
  readonly startsAt: number;
  readonly endsAt: number;
  readonly now: number;
}): PastWorkoutProblem | null {
  if (input.endsAt > input.now) return 'in_future';
  if (input.endsAt <= input.startsAt) return 'end_before_start';
  return null;
}

/**
 * A note as it is stored: exactly as typed, never trimmed or tidied (INV-27) — except that one holding nothing but
 * whitespace is no note at all, and is NULL rather than an empty string some later reader has to tell apart from it.
 */
export function noteValue(text: string): string | null {
  return text.trim() === '' ? null : text;
}

/** Perceived fatigue is 1–10 or not recorded — the column's own CHECK, answered before the write rather than by it. */
export function isPerceivedFatigue(value: number | null): boolean {
  return value === null || (Number.isInteger(value) && value >= 1 && value <= 10);
}

/**
 * What finishing a workout writes: its end, and the real moment of the write. The two differ for a workout logged
 * after the fact, whose end is the one the user chose (task 004 stage 6, decision 4).
 */
export function finishPatch(endedAt: number, now: number) {
  return { endedAt, updatedAt: now };
}

/**
 * What discarding a workout writes (decision 7) — offered only when nothing in it was ticked. A tombstone, never a
 * delete (INV-11), and ended as well, so it can never again be the open workout a relaunch reopens.
 */
export function discardPatch(now: number) {
  return { endedAt: now, deletedAt: now, updatedAt: now };
}

export interface NewWorkoutExercise {
  readonly id: string;
  readonly userId: string;
  readonly workoutId: string;
  readonly exerciseId: string;
  readonly orderIndex: number;
  readonly now: number;
  /** Carried over from a routine; an exercise added by hand mid-session has neither. */
  readonly supersetGroup?: number | null;
  readonly targets?: SessionTargets;
}

export function workoutExerciseRow(input: NewWorkoutExercise) {
  return {
    id: input.id,
    userId: input.userId,
    workoutId: input.workoutId,
    exerciseId: input.exerciseId,
    orderIndex: input.orderIndex,
    supersetGroup: input.supersetGroup ?? null,
    notes: null,
    plannedExerciseId: null,
    ...(input.targets ?? NO_SESSION_TARGETS),
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
    syncVersion: 1,
  };
}

export interface NewSetLog {
  readonly id: string;
  readonly userId: string;
  readonly workoutExerciseId: string;
  readonly setIndex: number;
  readonly now: number;
}

/**
 * A set row exists from the moment it appears on screen, empty and incomplete.
 *
 * That is deliberate and it is what makes the ✓ cheap: the row is already there, so completing a set is an `UPDATE`
 * with no id to mint and no insert to wait for. It is also why `is_counted_set()` asks about completion as well as
 * type — an untouched row must not inflate a total the user is reading mid-workout (stage 1, INV-04).
 *
 * Every value starts null rather than zero. A blank RIR means "not recorded" (INV-03), and a blank weight means "not
 * recorded" in exactly the same sense.
 */
export function setLogRow(input: NewSetLog) {
  return {
    id: input.id,
    userId: input.userId,
    workoutExerciseId: input.workoutExerciseId,
    setIndex: input.setIndex,
    // Widened rather than literal: a routine start pre-fills the type, weight and reps (src/db/routines.ts). The RIR
    // stays literally null — nothing pre-fills it (INV-03, task 004 § Stages, decision 3).
    setType: 'working' as SetType,
    weightKg: null as number | null,
    reps: null as number | null,
    rir: null,
    distanceM: null as number | null,
    durationS: null as number | null,
    isCompleted: false,
    completedAt: null,
    plannedSetId: null,
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
    syncVersion: 1,
  };
}

/**
 * What completing or un-completing a set changes.
 *
 * `completedAt` goes back to null when a set is un-ticked, rather than keeping the moment of a tick the user took
 * back. A set that is not complete was not completed at any time, and leaving a stale timestamp there would be a
 * small lie that some later aggregate would eventually read as truth.
 *
 * `doneAt` is when the set was done, and it is `now` except in a workout logged after the fact, where it is that
 * workout's chosen end — the honest upper bound. `updatedAt` is **always** `now`, the real moment of the write, because
 * sync decides by it (NFR-4, 03 §4, task 004 stage 6).
 */
export function completionPatch(isCompleted: boolean, now: number, doneAt: number = now) {
  return { isCompleted, completedAt: isCompleted ? doneAt : null, updatedAt: now };
}

/**
 * What a set of this tracking mode must hold before it can be completed, or null if it holds it — 03 §4's
 * "`is_completed = true` requires the fields its tracking mode needs, enforced in the service layer" (task 004 stage 5c).
 *
 * Reps for the two rep modes, the time for a hold, the distance for a carry. **Weight is never required**: blank is a
 * bodyweight set or a load not recorded, and both are real sets. Before this, the ✓ completed a row with nothing in it
 * — the stage 5 device pass ticked seven of them — and an empty "completed" set is a small lie every total then reads.
 */
export function missingForCompletion(
  tracking: Tracking,
  set: Pick<LiveSet, 'reps' | 'durationS' | 'distanceM'>,
): SetField | null {
  switch (tracking) {
    case 'weight_reps':
    case 'reps_only':
      return set.reps === null ? 'reps' : null;
    case 'duration':
      return set.durationS === null ? 'durationS' : null;
    case 'distance_duration':
      return set.distanceM === null ? 'distanceM' : null;
  }
}

/** What editing one of the set row's numbers changes. Clearing a field writes null, never 0 (INV-03). */
export function fieldPatch(field: SetField, value: number | null, now: number) {
  return { [field]: value, updatedAt: now } as Record<string, number | null>;
}

// ── writes ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Start a workout and return its id.
 *
 * Async because the id is: UUIDv7 comes from the OS CSPRNG through libsodium, which has a `ready` to await. Nothing
 * on the latency-critical path mints an id — see `setSetCompleted`.
 */
export async function startWorkout(input: {
  readonly userId: string;
  readonly title: string;
  readonly now: number;
  readonly tz: string;
  /**
   * A workout logged after the fact starts when the user says it did (FR-2.13); every other starts now. Its chosen end
   * is the caller's to keep on the device before this runs (`./preferences`, task 004 stage 6).
   */
  readonly startedAt?: number;
}): Promise<string> {
  const id = await uuidV7(input.now);
  db.insert(workouts)
    .values(
      workoutRow({
        id,
        userId: input.userId,
        title: input.title,
        startedAt: input.startedAt ?? input.now,
        tz: input.tz,
        now: input.now,
      }),
    )
    .run();
  return id;
}

/**
 * Add an exercise to a workout, with its first empty set, and return the `workout_exercises` id.
 *
 * Both rows land in one transaction: an exercise with no set row is a heading the user cannot log under, and a
 * half-applied add is the kind of state INV-09's promise is made against.
 */
export async function addExercise(input: {
  readonly userId: string;
  readonly workoutId: string;
  readonly exerciseId: string;
  readonly now: number;
}): Promise<string> {
  const [exerciseRowId, firstSetId] = await Promise.all([uuidV7(input.now), uuidV7(input.now)]);
  const orderIndex = nextIndex(
    db
      .select({ value: workoutExercises.orderIndex })
      .from(workoutExercises)
      .where(and(eq(workoutExercises.workoutId, input.workoutId), isNull(workoutExercises.deletedAt)))
      .orderBy(desc(workoutExercises.orderIndex))
      .get()?.value,
  );

  db.transaction((tx) => {
    tx.insert(workoutExercises)
      .values(
        workoutExerciseRow({
          id: exerciseRowId,
          userId: input.userId,
          workoutId: input.workoutId,
          exerciseId: input.exerciseId,
          orderIndex,
          now: input.now,
        }),
      )
      .run();
    tx.insert(setLogs)
      .values(
        setLogRow({
          id: firstSetId,
          userId: input.userId,
          workoutExerciseId: exerciseRowId,
          setIndex: 1,
          now: input.now,
        }),
      )
      .run();
  });

  return exerciseRowId;
}

/** Append an empty set to an exercise and return its id. */
export async function addSet(input: {
  readonly userId: string;
  readonly workoutExerciseId: string;
  readonly now: number;
}): Promise<string> {
  const id = await uuidV7(input.now);
  // Never the count of live rows: a removed set keeps its index, because `set_logs_position` is unique on
  // (workout_exercise_id, set_index) and would reject a second set 3.
  const setIndex = nextIndex(
    db
      .select({ value: setLogs.setIndex })
      .from(setLogs)
      .where(eq(setLogs.workoutExerciseId, input.workoutExerciseId))
      .orderBy(desc(setLogs.setIndex))
      .get()?.value,
  );
  db.insert(setLogs)
    .values(setLogRow({ id, userId: input.userId, workoutExerciseId: input.workoutExerciseId, setIndex, now: input.now }))
    .run();
  return id;
}

/**
 * Tick or un-tick a set. **The measured path** (NFR-2, < 100 ms).
 *
 * Synchronous on purpose, and it can be because the row already exists: no id is minted, no promise is awaited, and
 * the caller re-reads committed state rather than rendering an optimistic guess. If this ever has to become async,
 * INV-09 is what the change is arguing with.
 */
export function setSetCompleted(setLogId: string, isCompleted: boolean, now: number, doneAt: number = now): void {
  db.update(setLogs).set(completionPatch(isCompleted, now, doneAt)).where(eq(setLogs.id, setLogId)).run();
}

/** Write one of the set row's three numbers. Synchronous, for the same reason as `setSetCompleted`. */
export function setSetField(setLogId: string, field: SetField, value: number | null, now: number): void {
  db.update(setLogs).set(fieldPatch(field, value, now)).where(eq(setLogs.id, setLogId)).run();
}

/** Archive a set. Soft, so that sync has something to replicate rather than a silent absence (task 006). */
export function removeSet(setLogId: string, now: number): void {
  db.update(setLogs).set({ deletedAt: now, updatedAt: now }).where(eq(setLogs.id, setLogId)).run();
}

/**
 * Change a set's type — FR-2.9. Only `working` and `amrap` count (INV-04), and that judgement is the core's
 * `is_counted_set()`, never a filter here: this writes the fact and nothing else.
 */
export function setSetType(setLogId: string, setType: SetType, now: number): void {
  db.update(setLogs).set({ setType, updatedAt: now }).where(eq(setLogs.id, setLogId)).run();
}

/**
 * This exercise's rest for the rest of the session, in seconds — null is no timer. `±15 s` on a running timer lands
 * here too, which is what keeps the timer derivable (task 004 § Stages, decision 2).
 */
export function setExerciseRest(workoutExerciseId: string, restSeconds: number | null, now: number): void {
  db.update(workoutExercises)
    .set({ restSeconds, updatedAt: now })
    .where(eq(workoutExercises.id, workoutExerciseId))
    .run();
}

/** The live exercises of a workout, in order — what the ordering writes below renumber and regroup. */
function liveSessionExercises(workoutId: string) {
  return db
    .select({ id: workoutExercises.id, supersetGroup: workoutExercises.supersetGroup })
    .from(workoutExercises)
    .where(and(eq(workoutExercises.workoutId, workoutId), isNull(workoutExercises.deletedAt)))
    .orderBy(asc(workoutExercises.orderIndex))
    .all();
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function writeSessionSupersets(
  tx: Transaction,
  rows: readonly { readonly id: string; readonly supersetGroup: number | null }[],
  groups: readonly (number | null)[],
  now: number,
): void {
  rows.forEach((row, at) => {
    const group = groups[at] ?? null;
    if (group === row.supersetGroup) return;
    tx.update(workoutExercises).set({ supersetGroup: group, updatedAt: now }).where(eq(workoutExercises.id, row.id)).run();
  });
}

/**
 * Take an exercise out of the session — FR-2.8. A tombstone, like every removal here (sync replicates it, task 006),
 * and the superset groups re-read so the one left behind is not a superset of one.
 */
export function removeSessionExercise(workoutId: string, workoutExerciseId: string, now: number): void {
  db.transaction((tx) => {
    tx.update(workoutExercises)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(workoutExercises.id, workoutExerciseId))
      .run();
    const rows = liveSessionExercises(workoutId);
    writeSessionSupersets(tx, rows, normaliseSupersets(rows.map((row) => row.supersetGroup)), now);
  });
}

/**
 * Put the session's exercises in a new order — FR-2.8. `workout_exercises` has no unique index on its order, so one
 * pass is safe here, unlike a routine's two (`./routines`, `reorderPlan`).
 */
export function reorderSessionExercises(workoutId: string, orderedIds: readonly string[], now: number): void {
  db.transaction((tx) => {
    orderedIds.forEach((id, at) => {
      tx.update(workoutExercises).set({ orderIndex: at + 1, updatedAt: now }).where(eq(workoutExercises.id, id)).run();
    });
    const rows = liveSessionExercises(workoutId);
    writeSessionSupersets(tx, rows, normaliseSupersets(rows.map((row) => row.supersetGroup)), now);
  });
}

/** Link the exercise at `index` to the one below it, or unlink them (FR-2.6) — the routine editor's rule, mid-session. */
export function toggleSessionSuperset(workoutId: string, index: number, now: number): void {
  const rows = liveSessionExercises(workoutId);
  const groups = toggleSupersetWithNext(
    rows.map((row) => row.supersetGroup),
    index,
  );
  db.transaction((tx) => writeSessionSupersets(tx, rows, groups, now));
}

/**
 * Finish a workout — it ends `endedAt`, which is now, or a past workout's chosen end (task 004 stage 6). Its records
 * are not written anywhere: the device has no `personal_records` table, and the summary recomputes them from the rows
 * (03 §8, decision 3).
 */
export function endWorkout(workoutId: string, now: number, endedAt: number = now): void {
  db.update(workouts).set(finishPatch(endedAt, now)).where(eq(workouts.id, workoutId)).run();
}

/** Put away a workout in which nothing was ticked (decision 7). Its rows stay, archived, as every removal here does. */
export function discardWorkout(workoutId: string, now: number): void {
  db.update(workouts).set(discardPatch(now)).where(eq(workouts.id, workoutId)).run();
}

/** Perceived fatigue, 1–10 or null — written on the tap, like everything else here (INV-09). Never RPE (INV-03). */
export function setWorkoutFatigue(workoutId: string, perceivedFatigue: number | null, now: number): void {
  if (!isPerceivedFatigue(perceivedFatigue)) return;
  db.update(workouts).set({ perceivedFatigue, updatedAt: now }).where(eq(workouts.id, workoutId)).run();
}

/** The workout's note, on every change rather than on leaving the field (INV-09), exactly as typed (INV-27). */
export function setWorkoutNotes(workoutId: string, text: string, now: number): void {
  db.update(workouts).set({ notes: noteValue(text), updatedAt: now }).where(eq(workouts.id, workoutId)).run();
}

/** One exercise's note, for this workout alone — the same rules as the workout's own. */
export function setExerciseNotes(workoutExerciseId: string, text: string, now: number): void {
  db.update(workoutExercises)
    .set({ notes: noteValue(text), updatedAt: now })
    .where(eq(workoutExercises.id, workoutExerciseId))
    .run();
}

/**
 * The workout this user has open, with every exercise and set — what a relaunch mid-session reads.
 *
 * "Open" is `ended_at IS NULL`, which is also the row sync must never send (task 006). The most recently started one
 * wins if somehow there are two; nothing here creates a second.
 */
export function readOpenWorkout(userId: string): LiveWorkout | null {
  const workout = db
    .select()
    .from(workouts)
    .where(and(eq(workouts.userId, userId), isNull(workouts.endedAt), isNull(workouts.deletedAt)))
    .orderBy(desc(workouts.startedAt))
    .get();
  if (workout === undefined) {
    return null;
  }

  // Joined for `tracking`, which decides the row's fields and what the ✓ needs. The exercise may be hidden since —
  // a join, not the live catalog list, so a hidden exercise still logs the way it always did (INV-11).
  const exerciseRows = db
    .select({ row: workoutExercises, tracking: exercises.tracking })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(and(eq(workoutExercises.workoutId, workout.id), isNull(workoutExercises.deletedAt)))
    .orderBy(asc(workoutExercises.orderIndex))
    .all();

  const liveExercises = exerciseRows.map(({ row, tracking }) => ({
    id: row.id,
    exerciseId: row.exerciseId,
    orderIndex: row.orderIndex,
    supersetGroup: row.supersetGroup,
    restSeconds: row.restSeconds,
    targetMinReps: row.targetMinReps,
    targetMaxReps: row.targetMaxReps,
    targetRir: row.targetRir,
    tracking,
    notes: row.notes,
    sets: db
      .select()
      .from(setLogs)
      .where(and(eq(setLogs.workoutExerciseId, row.id), isNull(setLogs.deletedAt)))
      .orderBy(asc(setLogs.setIndex))
      .all()
      .map(toLiveSet),
  }));

  return {
    id: workout.id,
    title: workout.title,
    startedAt: workout.startedAt,
    localDate: workout.localDate,
    tz: workout.tz,
    notes: workout.notes,
    perceivedFatigue: workout.perceivedFatigue,
    exercises: liveExercises,
  };
}

/**
 * What this user did for this exercise last time, by set index — FR-2.12's "40 kg × 6 @2 last time".
 *
 * The most recent *other* **finished** workout that **completed** a set of this exercise, and its completed sets only:
 * an abandoned row the user never ticked is not a performance to compare against. Keyed by set index, because the hint
 * belongs to the row it sits behind, and returned as a map so the screen makes one query rather than one per row.
 *
 * Both conditions sit on the workout that is *chosen*, not only on the rows read from it (task 004 stage 6, decision
 * 9): picking the latest workout that merely *contained* the exercise let an abandoned session, or one with nothing
 * ticked, hide the real last time behind an empty hint.
 */
export function readPreviousPerformance(input: {
  readonly userId: string;
  readonly exerciseId: string;
  readonly exceptWorkoutId: string;
}): Map<number, LiveSet> {
  const previous = db
    .select({ workoutExerciseId: workoutExercises.id })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        eq(workoutExercises.userId, input.userId),
        eq(workoutExercises.exerciseId, input.exerciseId),
        ne(workoutExercises.workoutId, input.exceptWorkoutId),
        isNull(workoutExercises.deletedAt),
        isNull(workouts.deletedAt),
        isNotNull(workouts.endedAt),
        exists(
          db
            .select({ id: setLogs.id })
            .from(setLogs)
            .where(
              and(
                eq(setLogs.workoutExerciseId, workoutExercises.id),
                eq(setLogs.isCompleted, true),
                isNull(setLogs.deletedAt),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(workouts.startedAt))
    .get();
  if (previous === undefined) {
    return new Map();
  }

  const rows = db
    .select()
    .from(setLogs)
    .where(
      and(
        eq(setLogs.workoutExerciseId, previous.workoutExerciseId),
        eq(setLogs.isCompleted, true),
        isNull(setLogs.deletedAt),
      ),
    )
    .orderBy(asc(setLogs.setIndex))
    .all();
  return new Map(rows.map((row) => [row.setIndex, toLiveSet(row)]));
}

function nextIndex(highest: number | undefined): number {
  return (highest ?? 0) + 1;
}

function toLiveSet(row: typeof setLogs.$inferSelect): LiveSet {
  return {
    id: row.id,
    setIndex: row.setIndex,
    setType: row.setType,
    weightKg: row.weightKg,
    reps: row.reps,
    rir: row.rir,
    durationS: row.durationS,
    distanceM: row.distanceM,
    isCompleted: row.isCompleted,
    completedAt: row.completedAt,
  };
}
