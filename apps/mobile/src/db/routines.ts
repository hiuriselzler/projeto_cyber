/**
 * Routines, in the local database — task 004 stage 5a (FR-2.5–2.7).
 *
 * A routine is a template: an ordered list of exercises, each with target sets, a rep range, a target RIR and a rest.
 * Starting one creates an ordinary workout, **copying** those targets onto the session (03 §4) so that editing the
 * routine afterwards never reaches back into a workout that is already running.
 *
 * The module splits in two, as every module here does (responsibility map, `src/db/`): **the rows, built purely** —
 * where the decisions live, and the half Jest can reach — and **the writes that land them**, below `── writes ──`.
 *
 * Routine and folder names are user content: stored exactly as typed and never translated (INV-27). Nothing here is
 * ever `DELETE`d — a routine is archived, and an exercise taken out of one is a tombstone that sync can replicate
 * (INV-11, task 006).
 */
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import { uuidV7 } from '@/crypto/identifiers';

import { db } from './client';
import { moveItem, normaliseSupersets, toggleSupersetWithNext } from './ordering';
import { exercises, routineExercises, routines, setLogs, workoutExercises, workouts, type Tracking } from './schema';
import {
  readOpenWorkout,
  readPreviousPerformance,
  setLogRow,
  workoutExerciseRow,
  workoutRow,
  type LiveSet,
  type SetType,
} from './strength';

export interface RoutineTargets {
  readonly targetSets: number | null;
  readonly targetMinReps: number | null;
  readonly targetMaxReps: number | null;
  /** A target, never a logged value: it is shown beside a set and never written into `set_logs.rir` (INV-03). */
  readonly targetRir: number | null;
  /** Null is no rest timer — not an invented default (task 004 § Stages, decision 1). */
  readonly restSeconds: number | null;
}

export interface RoutineExercise extends RoutineTargets {
  readonly id: string;
  readonly exerciseId: string;
  readonly orderIndex: number;
  /** Exercises sharing a value are supersetted together (FR-2.6). Null is a standalone exercise. */
  readonly supersetGroup: number | null;
  /** The exercise's tracking mode, joined in: a rep range means nothing for a plank (task 004 stage 5c). */
  readonly tracking: Tracking;
  readonly notes: string | null;
}

export interface RoutineSummary {
  readonly id: string;
  readonly name: string;
  readonly folder: string | null;
  readonly orderIndex: number;
  readonly exerciseCount: number;
  /** Set when archived. Archiving is never a delete (INV-11). */
  readonly archivedAt: number | null;
}

export interface Routine {
  readonly id: string;
  readonly name: string;
  readonly notes: string | null;
  readonly folder: string | null;
  readonly exercises: readonly RoutineExercise[];
}

export const NO_TARGETS: RoutineTargets = {
  targetSets: null,
  targetMinReps: null,
  targetMaxReps: null,
  targetRir: null,
  restSeconds: null,
};

/** The largest value a `smallint` column holds. Anything the form lets through must fit. */
const SMALLINT_MAX = 32_767;

// ── rows, built purely ───────────────────────────────────────────────────────────────────────────

/** Shared with the live session (`./strength`), which orders and groups its exercises by the same rules. */
export { moveItem, normaliseSupersets, toggleSupersetWithNext };

/** Why a routine name cannot be used. Unlike an exercise's, it need not be unique — two "Treino A"s are the user's call. */
export function routineNameProblem(name: string): 'empty' | null {
  return name.trim() === '' ? 'empty' : null;
}

/** A folder is a label the user typed; blank means no folder, never an empty-string folder of its own. */
export function normaliseFolder(folder: string | null): string | null {
  const trimmed = folder?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export type TargetProblem = 'sets' | 'reps' | 'rep_range' | 'rir' | 'rest';

/**
 * What is wrong with a set of targets, or `null` if nothing is.
 *
 * The database holds only `target_rir`'s range; the rest are this function's, because a rep range upside down or a
 * negative rest is not a thing the schema can be asked to catch on the device (03 §8 carries no such CHECK) and a
 * timer counting down from −30 s is not a thing the screen should ever be asked to draw.
 */
export function targetProblem(targets: RoutineTargets): TargetProblem | null {
  const { targetSets, targetMinReps, targetMaxReps, targetRir, restSeconds } = targets;
  if (targetSets !== null && !(Number.isInteger(targetSets) && targetSets >= 1 && targetSets <= 50)) return 'sets';
  for (const reps of [targetMinReps, targetMaxReps]) {
    if (reps !== null && !(Number.isInteger(reps) && reps >= 0 && reps <= 1000)) return 'reps';
  }
  if (targetMinReps !== null && targetMaxReps !== null && targetMaxReps < targetMinReps) return 'rep_range';
  if (targetRir !== null && !(Number.isInteger(targetRir) && targetRir >= 0 && targetRir <= 10)) return 'rir';
  if (restSeconds !== null && !(Number.isInteger(restSeconds) && restSeconds >= 0 && restSeconds <= SMALLINT_MAX)) {
    return 'rest';
  }
  return null;
}

export function routineRow(input: {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly folder: string | null;
  readonly orderIndex: number;
  readonly notes: string | null;
  readonly now: number;
}) {
  return {
    id: input.id,
    userId: input.userId,
    // Exactly as typed, trimmed of the whitespace nobody means to keep (INV-27).
    name: input.name.trim(),
    notes: input.notes,
    folder: normaliseFolder(input.folder),
    orderIndex: input.orderIndex,
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
    syncVersion: 1,
  };
}

export function routineExerciseRow(input: {
  readonly id: string;
  readonly userId: string;
  readonly routineId: string;
  readonly exerciseId: string;
  readonly orderIndex: number;
  readonly supersetGroup: number | null;
  readonly targets: RoutineTargets;
  readonly notes: string | null;
  readonly now: number;
}) {
  return {
    id: input.id,
    userId: input.userId,
    routineId: input.routineId,
    exerciseId: input.exerciseId,
    orderIndex: input.orderIndex,
    supersetGroup: input.supersetGroup,
    ...input.targets,
    notes: input.notes,
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
    syncVersion: 1,
  };
}

/**
 * The two passes that renumber a routine's live rows to 1..n in a new order without ever breaking uniqueness.
 *
 * `routine_exercises_order` is unique on `(routine_id, order_index)`, and **SQLite checks it row by row**, not at the
 * end of the statement — so renumbering in place collides with a neighbour halfway through. Pass one parks every live
 * row above anything in use; pass two writes 1..n, which nothing then holds. `occupied` includes tombstones, which
 * keep their index (see `tombstoneIndex`), so the parking spots are clear of those too.
 */
export function reorderPlan(
  orderedIds: readonly string[],
  occupied: readonly number[],
): { readonly park: readonly { id: string; orderIndex: number }[]; readonly place: readonly { id: string; orderIndex: number }[] } {
  const above = Math.max(0, ...occupied) + 1;
  return {
    park: orderedIds.map((id, at) => ({ id, orderIndex: above + at })),
    place: orderedIds.map((id, at) => ({ id, orderIndex: at + 1 })),
  };
}

/**
 * Where a removed exercise's index goes: below everything, so live rows keep 1..n free.
 *
 * A removed row is a tombstone (`deleted_at` set) that sync will replicate, and it still counts against the unique
 * index. Leaving it at, say, 2 would make the next reorder's `place` pass collide with a row nobody can see.
 */
export function tombstoneIndex(occupied: readonly number[]): number {
  return Math.min(0, ...occupied) - 1;
}

/**
 * The five targets of a routine exercise, and nothing else.
 *
 * **Picked, never spread from the whole row.** `routineExerciseRow` spreads its `targets` after setting `id`, so handing
 * it a whole routine exercise as "targets" — as `duplicateRoutine` did in stage 5a — copied the *original's* id onto
 * the copy, and every duplicate failed on the primary key. No test reached it: the write half runs only on a device.
 */
export function targetsOf(exercise: RoutineTargets): RoutineTargets {
  return {
    targetSets: exercise.targetSets,
    targetMinReps: exercise.targetMinReps,
    targetMaxReps: exercise.targetMaxReps,
    targetRir: exercise.targetRir,
    restSeconds: exercise.restSeconds,
  };
}

/** Whether an exercise's sets are counted in reps — the two modes a rep range and RIR mean anything for (FR-2.3). */
export function countsReps(tracking: Tracking): boolean {
  return tracking === 'weight_reps' || tracking === 'reps_only';
}

/** Everything the start plan needs to know about one routine exercise, and what was done with it last time. */
export interface StartSource {
  readonly exercise: RoutineExercise;
  /** Last time's completed sets for this exercise, by set index — `readPreviousPerformance`. */
  readonly previous: ReadonlyMap<number, LiveSet>;
}

/** What one pre-filled set starts with. RIR is absent on purpose. */
export interface PrefilledSet {
  readonly setIndex: number;
  readonly setType: SetType;
  readonly weightKg: number | null;
  readonly reps: number | null;
  readonly durationS: number | null;
  readonly distanceM: number | null;
}

/**
 * The sets a routine exercise starts with — FR-2.7, and task 004 § Stages, decision 3.
 *
 * - **How many:** the routine's `target_sets`, else as many as last time, else one.
 * - **Weight and reps:** last time's at the same set index, else last time's nearest *earlier* set — a fourth set after
 *   a three-set pyramid starts from the third — and the reps, with no last time at all, from `target_min_reps`.
 * - **Time and distance** (task 004 stage 5c): last time's, by the same rule as weight. No routine target exists for
 *   either, so with no last time they start blank; and the rep target is never written into a time or distance set.
 * - **Type:** last time's at the same index only. A fallback never turns a new set into a warm-up.
 * - **RIR: never.** A RIR written before the user looked, then ticked, is an e1RM input they did not choose — the
 *   rule that makes `5+` store nothing and a blank chip store NULL (INV-03). The routine's target RIR is shown beside
 *   the row instead, from `workout_exercises.target_rir`.
 */
export function prefillSets(source: StartSource): PrefilledSet[] {
  const { exercise, previous } = source;
  const lastIndexes = [...previous.keys()].sort((a, b) => a - b);
  const count = exercise.targetSets ?? (lastIndexes.length > 0 ? lastIndexes.length : 1);

  return Array.from({ length: count }, (_, at) => {
    const setIndex = at + 1;
    const same = previous.get(setIndex);
    const earlier = same ?? nearestEarlier(previous, lastIndexes, setIndex);
    return {
      setIndex,
      setType: same?.setType ?? 'working',
      weightKg: earlier?.weightKg ?? null,
      reps: earlier?.reps ?? (previous.size === 0 && countsReps(exercise.tracking) ? exercise.targetMinReps : null),
      durationS: earlier?.durationS ?? null,
      distanceM: earlier?.distanceM ?? null,
    };
  });
}

function nearestEarlier(previous: ReadonlyMap<number, LiveSet>, sortedIndexes: readonly number[], setIndex: number) {
  let found: LiveSet | undefined;
  for (const index of sortedIndexes) {
    if (index > setIndex) break;
    found = previous.get(index);
  }
  return found;
}

/**
 * Every row a routine start writes: the workout, one `workout_exercises` row per routine exercise carrying its
 * targets and rest, and the pre-filled sets. Built purely from ids minted beforehand, so the whole start is one
 * synchronous transaction with no promise in the middle of it.
 */
export function startFromRoutineRows(input: {
  readonly userId: string;
  readonly routine: Routine;
  readonly sources: readonly StartSource[];
  readonly ids: readonly string[];
  readonly now: number;
  readonly tz: string;
}) {
  let used = 0;
  const nextId = () => {
    const id = input.ids[used];
    if (id === undefined) throw new Error('startFromRoutineRows: not enough ids were minted');
    used += 1;
    return id;
  };

  const workoutId = nextId();
  const workout = {
    ...workoutRow({ id: workoutId, userId: input.userId, title: input.routine.name, startedAt: input.now, tz: input.tz }),
    routineId: input.routine.id,
    source: 'routine' as const,
  };

  const exerciseRows: ReturnType<typeof workoutExerciseRow>[] = [];
  const setRows: ReturnType<typeof setLogRow>[] = [];
  input.sources.forEach((source, at) => {
    const workoutExerciseId = nextId();
    exerciseRows.push(
      workoutExerciseRow({
        id: workoutExerciseId,
        userId: input.userId,
        workoutId,
        exerciseId: source.exercise.exerciseId,
        orderIndex: at + 1,
        now: input.now,
        supersetGroup: source.exercise.supersetGroup,
        targets: {
          restSeconds: source.exercise.restSeconds,
          targetMinReps: source.exercise.targetMinReps,
          targetMaxReps: source.exercise.targetMaxReps,
          targetRir: source.exercise.targetRir,
        },
      }),
    );
    for (const set of prefillSets(source)) {
      setRows.push({
        ...setLogRow({ id: nextId(), userId: input.userId, workoutExerciseId, setIndex: set.setIndex, now: input.now }),
        setType: set.setType,
        weightKg: set.weightKg,
        reps: set.reps,
        durationS: set.durationS,
        distanceM: set.distanceM,
      });
    }
  });

  return { workout, exerciseRows, setRows };
}

/** How many ids `startFromRoutineRows` will consume: one workout, one per exercise, one per pre-filled set. */
export function idsNeededToStart(sources: readonly StartSource[]): number {
  return 1 + sources.reduce((total, source) => total + 1 + prefillSets(source).length, 0);
}

// ── writes ───────────────────────────────────────────────────────────────────────────────────────

const exerciseColumns = {
  id: routineExercises.id,
  exerciseId: routineExercises.exerciseId,
  orderIndex: routineExercises.orderIndex,
  supersetGroup: routineExercises.supersetGroup,
  targetSets: routineExercises.targetSets,
  targetMinReps: routineExercises.targetMinReps,
  targetMaxReps: routineExercises.targetMaxReps,
  targetRir: routineExercises.targetRir,
  restSeconds: routineExercises.restSeconds,
  notes: routineExercises.notes,
  tracking: exercises.tracking,
} as const;

const liveExerciseCount = sql<number>`(
  SELECT count(*) FROM ${routineExercises}
  WHERE ${routineExercises.routineId} = ${routines.id} AND ${routineExercises.deletedAt} IS NULL
)`;

function summaries(userId: string, archived: boolean): RoutineSummary[] {
  return db
    .select({
      id: routines.id,
      name: routines.name,
      folder: routines.folder,
      orderIndex: routines.orderIndex,
      exerciseCount: liveExerciseCount,
      archivedAt: routines.deletedAt,
    })
    .from(routines)
    .where(
      and(eq(routines.userId, userId), archived ? sql`${routines.deletedAt} IS NOT NULL` : isNull(routines.deletedAt)),
    )
    .orderBy(asc(routines.orderIndex), asc(routines.id))
    .all();
}

/** This user's routines, archived ones excluded, in the order they arranged them. */
export function listRoutines(userId: string): RoutineSummary[] {
  return summaries(userId, false);
}

/**
 * The archived ones, for the view that offers them back. Separate so no ordinary read can forget to exclude them —
 * and it exists at all because stage 4 shipped a hide with no way back and had to add one (task 004 § Stages).
 */
export function listArchivedRoutines(userId: string): RoutineSummary[] {
  return summaries(userId, true);
}

/** One routine with its live exercises in order. Null covers both "gone" and "somebody else's" (INV-15). */
export function readRoutine(userId: string, routineId: string): Routine | null {
  const routine = db
    .select({ id: routines.id, name: routines.name, notes: routines.notes, folder: routines.folder })
    .from(routines)
    .where(and(eq(routines.id, routineId), eq(routines.userId, userId)))
    .get();
  if (routine === undefined) return null;
  return { ...routine, exercises: liveExercises(userId, routineId) };
}

function liveExercises(userId: string, routineId: string): RoutineExercise[] {
  return db
    .select(exerciseColumns)
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(
      and(
        eq(routineExercises.routineId, routineId),
        eq(routineExercises.userId, userId),
        isNull(routineExercises.deletedAt),
      ),
    )
    .orderBy(asc(routineExercises.orderIndex))
    .all();
}

/** Every order index a routine's rows hold, tombstones included — they still count against the unique index. */
function occupiedIndexes(routineId: string): number[] {
  return db
    .select({ value: routineExercises.orderIndex })
    .from(routineExercises)
    .where(eq(routineExercises.routineId, routineId))
    .all()
    .map((row) => row.value);
}

function nextRoutineIndex(userId: string): number {
  const highest = db
    .select({ value: routines.orderIndex })
    .from(routines)
    .where(eq(routines.userId, userId))
    .orderBy(desc(routines.orderIndex))
    .get()?.value;
  return (highest ?? 0) + 1;
}

/** Create an empty routine at the end of the list and return its id. */
export async function createRoutine(input: {
  readonly userId: string;
  readonly name: string;
  readonly folder: string | null;
  readonly now: number;
}): Promise<string> {
  const id = await uuidV7(input.now);
  db.insert(routines)
    .values(
      routineRow({
        id,
        userId: input.userId,
        name: input.name,
        folder: input.folder,
        orderIndex: nextRoutineIndex(input.userId),
        notes: null,
        now: input.now,
      }),
    )
    .run();
  return id;
}

/** Rename a routine, or move it between folders. */
export function updateRoutine(input: {
  readonly userId: string;
  readonly routineId: string;
  readonly name: string;
  readonly folder: string | null;
  readonly now: number;
}): void {
  db.update(routines)
    .set({ name: input.name.trim(), folder: normaliseFolder(input.folder), updatedAt: input.now })
    .where(and(eq(routines.id, input.routineId), eq(routines.userId, input.userId)))
    .run();
}

/** Archive a routine, or bring it back. Never a delete: workouts started from it keep their `routine_id` (INV-11, INV-18). */
export function setRoutineArchived(input: {
  readonly userId: string;
  readonly routineId: string;
  readonly archived: boolean;
  readonly now: number;
}): void {
  db.update(routines)
    .set({ deletedAt: input.archived ? input.now : null, updatedAt: input.now })
    .where(and(eq(routines.id, input.routineId), eq(routines.userId, input.userId)))
    .run();
}

/**
 * Copy a routine and every live exercise in it, placed at the end of the list. Returns the copy's id.
 *
 * **The copy keeps the name exactly** — no "(copy)", no "(2)". A suffix would be words the user did not type, in a
 * language the app chose, stored as their content (INV-27); two routines of the same name are theirs to tell apart.
 */
export async function duplicateRoutine(input: {
  readonly userId: string;
  readonly routineId: string;
  readonly now: number;
}): Promise<string | null> {
  const source = readRoutine(input.userId, input.routineId);
  if (source === null) return null;
  const ids = await Promise.all(Array.from({ length: 1 + source.exercises.length }, () => uuidV7(input.now)));
  const [copyId, ...exerciseIds] = ids;
  if (copyId === undefined) return null;

  db.transaction((tx) => {
    tx.insert(routines)
      .values(
        routineRow({
          id: copyId,
          userId: input.userId,
          name: source.name,
          folder: source.folder,
          orderIndex: nextRoutineIndex(input.userId),
          notes: source.notes,
          now: input.now,
        }),
      )
      .run();
    source.exercises.forEach((exercise, at) => {
      tx.insert(routineExercises)
        .values(
          routineExerciseRow({
            id: exerciseIds[at] ?? '',
            userId: input.userId,
            routineId: copyId,
            exerciseId: exercise.exerciseId,
            orderIndex: at + 1,
            supersetGroup: exercise.supersetGroup,
            targets: targetsOf(exercise),
            notes: exercise.notes,
            now: input.now,
          }),
        )
        .run();
    });
  });
  return copyId;
}

/** Append an exercise to a routine, with no targets yet, and return the row's id. */
export async function addRoutineExercise(input: {
  readonly userId: string;
  readonly routineId: string;
  readonly exerciseId: string;
  readonly now: number;
}): Promise<string> {
  const id = await uuidV7(input.now);
  db.insert(routineExercises)
    .values(
      routineExerciseRow({
        id,
        userId: input.userId,
        routineId: input.routineId,
        exerciseId: input.exerciseId,
        orderIndex: Math.max(0, ...occupiedIndexes(input.routineId)) + 1,
        supersetGroup: null,
        targets: NO_TARGETS,
        notes: null,
        now: input.now,
      }),
    )
    .run();
  return id;
}

/** Write one exercise's targets. The caller validates with `targetProblem` first; the form never saves a bad one. */
export function updateRoutineExerciseTargets(input: {
  readonly userId: string;
  readonly routineExerciseId: string;
  readonly targets: RoutineTargets;
  readonly now: number;
}): void {
  db.update(routineExercises)
    .set({ ...input.targets, updatedAt: input.now })
    .where(and(eq(routineExercises.id, input.routineExerciseId), eq(routineExercises.userId, input.userId)))
    .run();
}

/**
 * Take an exercise out of a routine: a tombstone moved below every live index, and the superset groups re-read.
 * One transaction, so a routine is never left with a group of one pointing at a row that is gone.
 */
export function removeRoutineExercise(input: {
  readonly userId: string;
  readonly routineId: string;
  readonly routineExerciseId: string;
  readonly now: number;
}): void {
  db.transaction((tx) => {
    tx.update(routineExercises)
      .set({ deletedAt: input.now, updatedAt: input.now, orderIndex: tombstoneIndex(occupiedIndexes(input.routineId)) })
      .where(and(eq(routineExercises.id, input.routineExerciseId), eq(routineExercises.userId, input.userId)))
      .run();
    writeSupersets(tx, input.userId, liveExercises(input.userId, input.routineId), input.now);
  });
}

/** Put a routine's exercises in a new order, and re-read the superset groups as runs of neighbours. */
export function reorderRoutineExercises(input: {
  readonly userId: string;
  readonly routineId: string;
  readonly orderedIds: readonly string[];
  readonly now: number;
}): void {
  const plan = reorderPlan(input.orderedIds, occupiedIndexes(input.routineId));
  db.transaction((tx) => {
    for (const pass of [plan.park, plan.place]) {
      for (const row of pass) {
        tx.update(routineExercises)
          .set({ orderIndex: row.orderIndex, updatedAt: input.now })
          .where(and(eq(routineExercises.id, row.id), eq(routineExercises.userId, input.userId)))
          .run();
      }
    }
    writeSupersets(tx, input.userId, liveExercises(input.userId, input.routineId), input.now);
  });
}

/** Link the exercise at `index` to the one below it, or unlink them (FR-2.6). */
export function toggleRoutineSuperset(input: {
  readonly userId: string;
  readonly routineId: string;
  readonly index: number;
  readonly now: number;
}): void {
  const rows = liveExercises(input.userId, input.routineId);
  const groups = toggleSupersetWithNext(
    rows.map((row) => row.supersetGroup),
    input.index,
  );
  db.transaction((tx) => writeSupersets(tx, input.userId, rows, input.now, groups));
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Write normalised superset groups for `rows`, touching only the rows whose group actually changes. */
function writeSupersets(
  tx: Transaction,
  userId: string,
  rows: readonly RoutineExercise[],
  now: number,
  groups: readonly (number | null)[] = normaliseSupersets(rows.map((row) => row.supersetGroup)),
): void {
  rows.forEach((row, at) => {
    const group = groups[at] ?? null;
    if (group === row.supersetGroup) return;
    tx.update(routineExercises)
      .set({ supersetGroup: group, updatedAt: now })
      .where(and(eq(routineExercises.id, row.id), eq(routineExercises.userId, userId)))
      .run();
  });
}

/**
 * Start a workout from a routine and return its id — or `null`, starting nothing, if a workout is already open.
 *
 * One workout at a time is the rule `readOpenWorkout` already assumes. Refusing here, rather than trusting every
 * caller to check, is what keeps a double tap on "Start" from leaving two open workouts behind.
 *
 * Ids are minted first, the one async step; everything that follows is **one synchronous transaction**, so a crash
 * mid-start leaves either the whole pre-filled workout or nothing (INV-09).
 */
export async function startWorkoutFromRoutine(input: {
  readonly userId: string;
  readonly routineId: string;
  readonly now: number;
  readonly tz: string;
}): Promise<string | null> {
  if (readOpenWorkout(input.userId) !== null) return null;
  const routine = readRoutine(input.userId, input.routineId);
  if (routine === null) return null;

  const sources: StartSource[] = routine.exercises.map((exercise) => ({
    exercise,
    // No workout id exists yet, so there is nothing to except; the new one has no sets to find.
    previous: readPreviousPerformance({ userId: input.userId, exerciseId: exercise.exerciseId, exceptWorkoutId: '' }),
  }));
  const ids = await Promise.all(Array.from({ length: idsNeededToStart(sources) }, () => uuidV7(input.now)));
  const rows = startFromRoutineRows({ userId: input.userId, routine, sources, ids, now: input.now, tz: input.tz });

  let started = false;
  db.transaction((tx) => {
    // Checked again inside the transaction: the await above is a window in which a second tap could have started one.
    const open = tx
      .select({ id: workouts.id })
      .from(workouts)
      .where(and(eq(workouts.userId, input.userId), isNull(workouts.endedAt), isNull(workouts.deletedAt)))
      .get();
    if (open !== undefined) return;
    tx.insert(workouts).values(rows.workout).run();
    if (rows.exerciseRows.length > 0) tx.insert(workoutExercises).values(rows.exerciseRows).run();
    if (rows.setRows.length > 0) tx.insert(setLogs).values(rows.setRows).run();
    started = true;
  });
  return started ? rows.workout.id : null;
}
