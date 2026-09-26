/**
 * The strength planner, in the local database — task 005 stage 4a.
 *
 * Three jobs, and the engine does the thinking in all of them (`src/domain/progression.ts` → `core-rs`):
 * - **create a block**: generate microcycles 2..N from cycle 1 and insert the whole block in one transaction (ADR-002),
 *   minting every row's id here (INV-16, ADR-012 § Amendment);
 * - **read a plan** as the engine reads it: rows keyed by their place in the plan, each exercise with its rule resolved
 *   through FR-3.6's cascade, its INV-02 increment and the latest body weight, and the sets logged against it;
 * - **write a plan back, touching only what changed** (stage 4a decision 3). A changed row is updated in place and
 *   keeps its id, so a user's edit and a pin stay attached; a new row is inserted; a row the plan no longer holds is
 *   archived, never deleted (INV-11). That is what keeps "reconciling twice produces byte-identical rows" true in the
 *   database, `updated_at` included.
 *
 * The re-projection entry point is {@link reconcileBlock}: *settle, then reconcile, then write* — the cycle statuses
 * moved by what was logged, then the engine, then the diff (stage 4a decision 2). It runs after a planned workout
 * finishes and at start-up, never inside a workout's own writes (decision 4, INV-09).
 *
 * As everywhere in `src/db/`, the rows are built purely above `── writes ──`, where Jest can reach them; the writes
 * land them, and are proven on the device.
 */
import { and, asc, eq, inArray, isNull, lte, desc } from 'drizzle-orm';

import { uuidV7Batch } from '@/crypto/identifiers';
import {
  engineVersion,
  generateBlock,
  reconcilePlan,
  settlePlanStatuses,
  type CycleOneSet,
  type CycleStatus,
  type DeloadPolicy,
  type LoggedSet,
  type MesocycleSpec,
  type PlanCycle,
  type PlanExercise,
  type PlanLog,
  type PlannedSet,
  type PlanSet,
  type ProgressionRule,
  type SetOrigin,
  type SlotOutcome,
  type WriteKind,
} from '@/domain';

import { db } from './client';
import {
  bodyWeightLog,
  exercises,
  mesocycles,
  microcycles,
  modalityIncrements,
  plannedExercises,
  plannedSessions,
  plannedSets,
  progressionRules,
  setLogs,
  users,
  workoutExercises,
  workouts,
} from './schema';

/** INV-02's last fallback, when neither the exercise nor its modality names an increment: 2.5 kg, or 5 lb exactly. */
export const FALLBACK_INCREMENT_KG = { metric: 2.5, imperial: 2.267962 } as const;

/** An exercise in a block with no rule of its own and no mesocycle default: there is no product default (FR-3.2). */
export class MissingRuleError extends Error {
  constructor(readonly exerciseId: string) {
    super(`exercise ${exerciseId} has no progression rule, and the block no default`);
    this.name = 'MissingRuleError';
  }
}

// ── The rows, built purely ────────────────────────────────────────────────────────────────────────

/** INV-02's cascade: the exercise's own increment, else its modality's for the user's unit system, else the fallback. */
export function resolveIncrement(
  exerciseIncrementKg: number | null,
  modalityIncrementKg: number | null,
  unitSystem: 'metric' | 'imperial',
): number {
  return exerciseIncrementKg ?? modalityIncrementKg ?? FALLBACK_INCREMENT_KG[unitSystem];
}

/** FR-3.6's cascade as far as the schema holds it: the exercise's rule, else the mesocycle's default (decision 5). */
export function resolveRuleId(exerciseRuleId: string | null, mesocycleDefaultRuleId: string | null): string | null {
  return exerciseRuleId ?? mesocycleDefaultRuleId;
}

type RuleRow = typeof progressionRules.$inferSelect;

/** A `progression_rules` row as the engine reads it. `cycle_pattern` is v2 and never reaches here as a strategy. */
export function ruleOfRow(row: RuleRow): ProgressionRule {
  if (row.strategy === 'cycle_pattern') throw new Error('cycle_pattern is v2 and not built (01 §3.2 (e))');
  return {
    strategy: row.strategy,
    loadStepKg: row.loadStepKg,
    loadStepBp: row.loadStepBp,
    repStep: row.repStep,
    minReps: row.minReps,
    maxReps: row.maxReps,
    minRir: row.minRir,
    maxRir: row.maxRir,
    rirMode: row.rirMode,
    rirOffsets: row.rirOffsets,
    rirStart: row.rirStart,
    rirEnd: row.rirEnd,
    percentWaveBp: row.percentWaveBp,
    baselineE1rmKg: row.baselineE1rmKg,
    failurePolicy: row.failurePolicy,
    failureLoadBp: row.failureLoadBp,
    rounding: row.rounding,
  };
}

type MesocycleRow = typeof mesocycles.$inferSelect;

/** The mesocycle as the engine reads it. A manual policy's flagged cycles are the cycles' own `is_deload`. */
export function mesocycleSpecOf(
  row: MesocycleRow,
  cycles: readonly { cycleNumber: number; lengthDays: number; isDeload: boolean }[],
): MesocycleSpec {
  const deload: DeloadPolicy =
    row.deloadMode === 'every_n_microcycles'
      ? { mode: 'every_n_microcycles', every: row.deloadEveryNMicrocycles ?? 0, finalCycle: row.deloadFinalCycle }
      : row.deloadMode === 'manual'
        ? { mode: 'manual', cycles: cycles.filter((it) => it.isDeload).map((it) => it.cycleNumber) }
        : { mode: 'none' };
  return {
    startDate: row.startDate,
    numMicrocycles: row.numMicrocycles,
    defaultMicrocycleDays: row.defaultMicrocycleDays,
    lengthOverrides: cycles
      .filter((it) => it.lengthDays !== row.defaultMicrocycleDays)
      .map((it) => ({ cycleNumber: it.cycleNumber, lengthDays: it.lengthDays })),
    deload,
    deloadSetBp: row.deloadSetBp,
    deloadLoadBp: row.deloadLoadBp,
    deloadRirBump: row.deloadRirBump,
  };
}

/** A row's place in the plan (ADR-002 § Amendment): cycle, session, exercise, set. */
export const keyOf = {
  cycle: (cycle: number) => `${cycle}`,
  session: (cycle: number, day: number, order: number) => `${cycle}|${day}|${order}`,
  exercise: (cycle: number, day: number, order: number, exercise: number) => `${cycle}|${day}|${order}|${exercise}`,
  set: (cycle: number, day: number, order: number, exercise: number, set: number) =>
    `${cycle}|${day}|${order}|${exercise}|${set}`,
};

function sameSet(a: PlanSet, b: PlanSet): boolean {
  return (
    a.setType === b.setType &&
    a.targetWeightKg === b.targetWeightKg &&
    a.targetReps === b.targetReps &&
    a.targetMinReps === b.targetMinReps &&
    a.targetMaxReps === b.targetMaxReps &&
    a.targetRir === b.targetRir &&
    a.wasClamped === b.wasClamped &&
    a.origin === b.origin &&
    a.isPinned === b.isPinned
  );
}

function sameCycleRow(a: PlanCycle, b: PlanCycle): boolean {
  return (
    a.lengthDays === b.lengthDays &&
    a.startsOn === b.startsOn &&
    a.isDeload === b.isDeload &&
    a.status === b.status &&
    a.engineVersion === b.engineVersion &&
    a.lastWriteKind === b.lastWriteKind
  );
}

/** What writing `after` over `before` changes, by natural key. Nothing that did not change is listed. */
export interface PlanDiff {
  readonly cycles: {
    readonly updated: readonly PlanCycle[];
    readonly inserted: readonly PlanCycle[];
    readonly archived: readonly number[];
  };
  readonly sessions: {
    readonly inserted: readonly { cycle: number; day: number; order: number; at: number }[];
    readonly archived: readonly string[];
  };
  readonly exercises: {
    readonly inserted: readonly { cycle: number; day: number; order: number; exercise: PlanExercise; occurrence: number }[];
    readonly archived: readonly string[];
  };
  readonly sets: {
    readonly updated: readonly { key: string; set: PlanSet }[];
    readonly inserted: readonly { exerciseKey: string; set: PlanSet }[];
    readonly archived: readonly string[];
  };
}

/** The diff that writes `after` over `before`. Pure: every key and every comparison is the natural key's. */
export function diffPlan(before: readonly PlanCycle[], after: readonly PlanCycle[]): PlanDiff {
  const beforeCycles = new Map(before.map((cycle) => [cycle.cycleNumber, cycle]));
  const afterCycles = new Set(after.map((cycle) => cycle.cycleNumber));
  const beforeSessions = new Set<string>();
  const beforeExercises = new Set<string>();
  const beforeSets = new Map<string, PlanSet>();
  for (const cycle of before) {
    for (const session of cycle.sessions) {
      beforeSessions.add(keyOf.session(cycle.cycleNumber, session.dayIndex, session.orderIndex));
      for (const exercise of session.exercises) {
        beforeExercises.add(
          keyOf.exercise(cycle.cycleNumber, session.dayIndex, session.orderIndex, exercise.orderIndex),
        );
        for (const set of exercise.sets) {
          beforeSets.set(
            keyOf.set(cycle.cycleNumber, session.dayIndex, session.orderIndex, exercise.orderIndex, set.setIndex),
            set,
          );
        }
      }
    }
  }

  const cycles = { updated: [] as PlanCycle[], inserted: [] as PlanCycle[], archived: [] as number[] };
  const sessions = { inserted: [] as PlanDiff['sessions']['inserted'][number][], archived: [] as string[] };
  const exercisesDiff = { inserted: [] as PlanDiff['exercises']['inserted'][number][], archived: [] as string[] };
  const sets = {
    updated: [] as { key: string; set: PlanSet }[],
    inserted: [] as { exerciseKey: string; set: PlanSet }[],
    archived: [] as string[],
  };
  const seenSessions = new Set<string>();
  const seenExercises = new Set<string>();
  const seenSets = new Set<string>();

  for (const cycle of after) {
    const previous = beforeCycles.get(cycle.cycleNumber);
    if (previous === undefined) cycles.inserted.push(cycle);
    else if (!sameCycleRow(previous, cycle)) cycles.updated.push(cycle);

    const occurrences = new Map<string, number>();
    cycle.sessions.forEach((session, at) => {
      const sessionKey = keyOf.session(cycle.cycleNumber, session.dayIndex, session.orderIndex);
      seenSessions.add(sessionKey);
      if (!beforeSessions.has(sessionKey)) {
        sessions.inserted.push({ cycle: cycle.cycleNumber, day: session.dayIndex, order: session.orderIndex, at });
      }
      for (const exercise of session.exercises) {
        const occurrence = occurrences.get(exercise.exerciseId) ?? 0;
        occurrences.set(exercise.exerciseId, occurrence + 1);
        const exerciseKey = keyOf.exercise(cycle.cycleNumber, session.dayIndex, session.orderIndex, exercise.orderIndex);
        seenExercises.add(exerciseKey);
        if (!beforeExercises.has(exerciseKey)) {
          exercisesDiff.inserted.push({
            cycle: cycle.cycleNumber,
            day: session.dayIndex,
            order: session.orderIndex,
            exercise,
            occurrence,
          });
        }
        for (const set of exercise.sets) {
          const setKey = keyOf.set(
            cycle.cycleNumber,
            session.dayIndex,
            session.orderIndex,
            exercise.orderIndex,
            set.setIndex,
          );
          seenSets.add(setKey);
          const was = beforeSets.get(setKey);
          if (was === undefined) sets.inserted.push({ exerciseKey, set });
          else if (!sameSet(was, set)) sets.updated.push({ key: setKey, set });
        }
      }
    });
  }

  for (const number of beforeCycles.keys()) if (!afterCycles.has(number)) cycles.archived.push(number);
  for (const key of beforeSessions) if (!seenSessions.has(key)) sessions.archived.push(key);
  for (const key of beforeExercises) if (!seenExercises.has(key)) exercisesDiff.archived.push(key);
  for (const key of beforeSets.keys()) if (!seenSets.has(key)) sets.archived.push(key);
  return { cycles, sessions, exercises: exercisesDiff, sets };
}

/** How many new ids a diff needs. */
export function idsNeeded(diff: PlanDiff): number {
  return (
    diff.cycles.inserted.length + diff.sessions.inserted.length + diff.exercises.inserted.length + diff.sets.inserted.length
  );
}

function setColumns(set: PlanSet | PlannedSet, origin: SetOrigin, isPinned: boolean) {
  return {
    setIndex: set.setIndex,
    setType: set.setType,
    targetWeightKg: set.targetWeightKg,
    targetReps: set.targetReps,
    targetMinReps: set.targetMinReps,
    targetMaxReps: set.targetMaxReps,
    targetRir: set.targetRir,
    wasClamped: set.wasClamped,
    origin,
    isPinned,
  };
}

// ── Creating a block ──────────────────────────────────────────────────────────────────────────────

export interface NewBlockExercise {
  readonly exerciseId: string;
  readonly orderIndex: number;
  /** The exercise's own rule; null takes the block's default (FR-3.6). */
  readonly progressionRuleId: string | null;
  readonly restSeconds: number | null;
  readonly notes: string | null;
  readonly sets: readonly CycleOneSet[];
}

export interface NewBlock {
  readonly userId: string;
  readonly name: string;
  readonly goal: 'hypertrophy' | 'strength' | 'peaking' | 'maintenance';
  readonly startDate: string;
  readonly numMicrocycles: number;
  readonly defaultMicrocycleDays: number;
  readonly lengthOverrides: readonly { readonly cycleNumber: number; readonly lengthDays: number }[];
  readonly deload: DeloadPolicy;
  readonly deloadSetBp?: number;
  readonly deloadLoadBp?: number;
  readonly deloadRirBump?: number;
  readonly defaultRuleId: string | null;
  /** Cycle 1, as the user authored it (FR-3.3). Session names are user content, kept as typed (INV-27). */
  readonly sessions: readonly {
    readonly dayIndex: number;
    readonly orderIndex: number;
    readonly name: string;
    readonly exercises: readonly NewBlockExercise[];
  }[];
}

/** SQLite binds at most 32 766 values a statement; a planned set is 17 columns, so 500 rows stay well inside it. */
const CHUNK = 500;

function inChunks<T>(rows: readonly T[], write: (chunk: T[]) => void): void {
  for (let at = 0; at < rows.length; at += CHUNK) write(rows.slice(at, at + CHUNK));
}

// ── writes ────────────────────────────────────────────────────────────────────────────────────────

interface ExerciseFacts {
  readonly incrementKg: number;
  readonly usesBodyweight: boolean;
}

function unitSystemOf(userId: string): 'metric' | 'imperial' {
  return db.select({ unitSystem: users.unitSystem }).from(users).where(eq(users.id, userId)).get()?.unitSystem ?? 'metric';
}

/** INV-02's increment and the bodyweight flag for each exercise, in the user's unit system. */
function exerciseFacts(exerciseIds: readonly string[], unitSystem: 'metric' | 'imperial'): Map<string, ExerciseFacts> {
  if (exerciseIds.length === 0) return new Map();
  const byModality = new Map(
    db
      .select({ modality: modalityIncrements.modality, incrementKg: modalityIncrements.incrementKg })
      .from(modalityIncrements)
      .where(eq(modalityIncrements.unitSystem, unitSystem))
      .all()
      .map((row) => [row.modality, row.incrementKg]),
  );
  return new Map(
    db
      .select({
        id: exercises.id,
        modality: exercises.modality,
        loadIncrementKg: exercises.loadIncrementKg,
        usesBodyweight: exercises.usesBodyweight,
      })
      .from(exercises)
      .where(inArray(exercises.id, [...new Set(exerciseIds)]))
      .all()
      .map((row) => [
        row.id,
        {
          incrementKg: resolveIncrement(row.loadIncrementKg, byModality.get(row.modality) ?? null, unitSystem),
          usesBodyweight: row.usesBodyweight,
        },
      ]),
  );
}

/** Any date after every real one: `bodyWeightOn(userId, LATEST)` is the latest body weight logged. */
const LATEST = '9999-12-31';

/** Rows grouped by a key, in the order given. `Map.groupBy` is ES2024, which Hermes may not have. */
function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const group = groups.get(key(row));
    if (group === undefined) groups.set(key(row), [row]);
    else group.push(row);
  }
  return groups;
}

/** The latest body weight on or before `date`, or null — never a guess (INV-07). */
function bodyWeightOn(userId: string, date: string): number | null {
  return (
    db
      .select({ weightKg: bodyWeightLog.weightKg })
      .from(bodyWeightLog)
      .where(and(eq(bodyWeightLog.userId, userId), lte(bodyWeightLog.measuredOn, date), isNull(bodyWeightLog.deletedAt)))
      .orderBy(desc(bodyWeightLog.measuredOn))
      .get()?.weightKg ?? null
  );
}

function rulesById(userId: string, ids: readonly string[]): Map<string, ProgressionRule> {
  if (ids.length === 0) return new Map();
  return new Map(
    db
      .select()
      .from(progressionRules)
      .where(and(eq(progressionRules.userId, userId), inArray(progressionRules.id, [...new Set(ids)])))
      .all()
      .map((row) => [row.id, ruleOfRow(row)]),
  );
}

/** A whole block's rows, generated and given ids, ready for {@link insertBlock}. */
export interface PreparedBlock {
  readonly mesocycle: typeof mesocycles.$inferInsert & { id: string };
  readonly cycles: readonly (typeof microcycles.$inferInsert)[];
  readonly sessions: readonly (typeof plannedSessions.$inferInsert)[];
  readonly exercises: readonly (typeof plannedExercises.$inferInsert)[];
  readonly sets: readonly (typeof plannedSets.$inferInsert)[];
}

/** The rows a {@link PreparedBlock} holds — the ~1 500 of ADR-002's worked example, or more. */
export function rowsIn(prepared: PreparedBlock): number {
  return 1 + prepared.cycles.length + prepared.sessions.length + prepared.exercises.length + prepared.sets.length;
}

/**
 * Generate a block from cycle 1 and give every row an id — everything {@link createBlock} does before it writes.
 *
 * Throws {@link MissingRuleError} for an exercise with no rule and no block default, and `IncompleteRuleError` for a
 * rule the engine cannot run — before anything is written.
 */
export async function prepareBlock(block: NewBlock, today: string, now: number): Promise<PreparedBlock> {
  const unitSystem = unitSystemOf(block.userId);
  const cycleOne = block.sessions.flatMap((session) => session.exercises);
  const ruleIds = cycleOne.map((exercise) => {
    const id = resolveRuleId(exercise.progressionRuleId, block.defaultRuleId);
    if (id === null) throw new MissingRuleError(exercise.exerciseId);
    return id;
  });
  const rules = rulesById(block.userId, ruleIds);
  const facts = exerciseFacts(
    cycleOne.map((exercise) => exercise.exerciseId),
    unitSystem,
  );
  const bodyWeightKg = bodyWeightOn(block.userId, today);

  const spec: MesocycleSpec = {
    startDate: block.startDate,
    numMicrocycles: block.numMicrocycles,
    defaultMicrocycleDays: block.defaultMicrocycleDays,
    lengthOverrides: block.lengthOverrides,
    deload: block.deload,
    deloadSetBp: block.deloadSetBp ?? 5000,
    deloadLoadBp: block.deloadLoadBp ?? 6000,
    deloadRirBump: block.deloadRirBump ?? 2,
  };
  const sessionsSorted = [...block.sessions].sort((a, b) => a.dayIndex - b.dayIndex || a.orderIndex - b.orderIndex);
  const specOf = (exercise: NewBlockExercise) => {
    const ruleId = resolveRuleId(exercise.progressionRuleId, block.defaultRuleId);
    const rule = ruleId === null ? undefined : rules.get(ruleId);
    const fact = facts.get(exercise.exerciseId);
    if (rule === undefined || fact === undefined) throw new MissingRuleError(exercise.exerciseId);
    return { rule, fact };
  };
  const generated = generateBlock(
    spec,
    sessionsSorted.map((session) => ({
      dayIndex: session.dayIndex,
      orderIndex: session.orderIndex,
      exercises: session.exercises.map((exercise) => {
        const { rule, fact } = specOf(exercise);
        return {
          orderIndex: exercise.orderIndex,
          incrementKg: fact.incrementKg,
          rule,
          usesBodyweight: fact.usesBodyweight,
          bodyWeightKg,
          sets: exercise.sets,
        };
      }),
    })),
  );

  const cycleOneLength =
    block.lengthOverrides.find((it) => it.cycleNumber === 1)?.lengthDays ?? block.defaultMicrocycleDays;
  const rowCount =
    1 +
    1 +
    generated.length +
    (1 + generated.length) * sessionsSorted.length +
    (1 + generated.length) * cycleOne.length +
    cycleOne.reduce((sum, exercise) => sum + exercise.sets.length, 0) +
    generated.reduce(
      (sum, cycle) =>
        sum +
        cycle.sessions.reduce(
          (inner, session) => inner + session.exercises.reduce((sets, exercise) => sets + exercise.sets.length, 0),
          0,
        ),
      0,
    );
  const ids = await uuidV7Batch(now, rowCount);
  let next = 0;
  const mint = (): string => {
    const id = ids[next];
    next += 1;
    if (id === undefined) throw new Error('the block needed more ids than were minted');
    return id;
  };

  const stamps = { userId: block.userId, createdAt: now, updatedAt: now };
  const mesocycleId = mint();
  const cycleRows: (typeof microcycles.$inferInsert)[] = [];
  const sessionRows: (typeof plannedSessions.$inferInsert)[] = [];
  const exerciseRows: (typeof plannedExercises.$inferInsert)[] = [];
  const setRows: (typeof plannedSets.$inferInsert)[] = [];

  const writeCycle = (
    cycle: { cycleNumber: number; lengthDays: number; startsOn: string; isDeload: boolean; lastWriteKind: WriteKind },
    sessionSets: (sessionAt: number, exerciseAt: number) => readonly (PlannedSet | CycleOneSet)[],
    origin: SetOrigin,
    sessionKeys: readonly { dayIndex: number; orderIndex: number }[],
  ) => {
    const cycleId = mint();
    cycleRows.push({
      ...stamps,
      id: cycleId,
      mesocycleId,
      cycleNumber: cycle.cycleNumber,
      lengthDays: cycle.lengthDays,
      startsOn: cycle.startsOn,
      isDeload: cycle.isDeload,
      status: 'projected',
      engineVersion: engineVersion(),
      lastWriteKind: cycle.lastWriteKind,
    });
    sessionsSorted.forEach((session, sessionAt) => {
      const sessionId = mint();
      const key = sessionKeys[sessionAt];
      sessionRows.push({
        ...stamps,
        id: sessionId,
        microcycleId: cycleId,
        dayIndex: key?.dayIndex ?? session.dayIndex,
        orderIndex: key?.orderIndex ?? session.orderIndex,
        name: session.name,
      });
      const ordered = [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
      ordered.forEach((exercise, exerciseAt) => {
        const exerciseRowId = mint();
        exerciseRows.push({
          ...stamps,
          id: exerciseRowId,
          plannedSessionId: sessionId,
          exerciseId: exercise.exerciseId,
          progressionRuleId: exercise.progressionRuleId,
          orderIndex: exercise.orderIndex,
          restSeconds: exercise.restSeconds,
          notes: exercise.notes,
        });
        for (const set of sessionSets(sessionAt, exerciseAt)) {
          setRows.push({
            ...stamps,
            id: mint(),
            plannedExerciseId: exerciseRowId,
            ...setColumns(
              {
                targetMinReps: null,
                targetMaxReps: null,
                wasClamped: false,
                ...set,
              },
              origin,
              false,
            ),
          });
        }
      });
    });
  };

  // Cycle 1 is the user's own authoring (FR-3.3): its rows are theirs, and the engine never rewrites them.
  writeCycle(
    {
      cycleNumber: 1,
      lengthDays: cycleOneLength,
      startsOn: block.startDate,
      isDeload: false,
      lastWriteKind: 'user',
    },
    (sessionAt, exerciseAt) =>
      [...(sessionsSorted[sessionAt]?.exercises ?? [])].sort((a, b) => a.orderIndex - b.orderIndex)[exerciseAt]?.sets ??
      [],
    'user_edited',
    sessionsSorted,
  );
  for (const cycle of generated) {
    writeCycle(
      { ...cycle, lastWriteKind: 'engine' },
      (sessionAt, exerciseAt) => cycle.sessions[sessionAt]?.exercises[exerciseAt]?.sets ?? [],
      'generated',
      cycle.sessions,
    );
  }

  return {
    mesocycle: {
      ...stamps,
      id: mesocycleId,
      name: block.name,
      goal: block.goal,
      startDate: block.startDate,
      numMicrocycles: block.numMicrocycles,
      defaultMicrocycleDays: block.defaultMicrocycleDays,
      deloadMode: block.deload.mode,
      deloadEveryNMicrocycles: block.deload.mode === 'every_n_microcycles' ? block.deload.every : null,
      deloadFinalCycle: block.deload.mode === 'every_n_microcycles' ? block.deload.finalCycle : false,
      deloadSetBp: spec.deloadSetBp,
      deloadLoadBp: spec.deloadLoadBp,
      deloadRirBump: spec.deloadRirBump,
      defaultRuleId: block.defaultRuleId,
      status: 'active',
    },
    cycles: cycleRows,
    sessions: sessionRows,
    exercises: exerciseRows,
    sets: setRows,
  };
}

/** The writer a transaction hands its callback. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Write a prepared block — batched inserts, never a row at a time (ADR-002). Call inside one transaction. */
export function insertBlock(tx: Transaction, prepared: PreparedBlock): void {
  tx.insert(mesocycles).values(prepared.mesocycle).run();
  inChunks(prepared.cycles, (chunk) => tx.insert(microcycles).values(chunk).run());
  inChunks(prepared.sessions, (chunk) => tx.insert(plannedSessions).values(chunk).run());
  inChunks(prepared.exercises, (chunk) => tx.insert(plannedExercises).values(chunk).run());
  inChunks(prepared.sets, (chunk) => tx.insert(plannedSets).values(chunk).run());
}

/** Generate a block from cycle 1 and write the whole of it in one transaction; returns the mesocycle's id. */
export async function createBlock(block: NewBlock, today: string, now: number): Promise<string> {
  const prepared = await prepareBlock(block, today, now);
  db.transaction((tx) => insertBlock(tx, prepared));
  return prepared.mesocycle.id;
}

// ── Reading a plan ────────────────────────────────────────────────────────────────────────────────

/** A plan as the engine reads it, with the ids behind each natural key for writing it back. */
export interface ReadPlan {
  readonly mesocycle: MesocycleRow;
  readonly spec: MesocycleSpec;
  readonly cycles: PlanCycle[];
  readonly logs: PlanLog[];
  readonly ids: {
    readonly cycles: Map<string, string>;
    readonly sessions: Map<string, string>;
    readonly exercises: Map<string, { id: string; ruleId: string | null; exerciseId: string }>;
    readonly sets: Map<string, string>;
    /** Archived rows still holding a unique position: revived rather than inserted beside (INV-11). */
    readonly archivedCycles: Map<number, string>;
    readonly archivedSets: Map<string, string>;
  };
  /** Cycle 1's session names by canonical position — what a new cycle's sessions are called. */
  readonly sessionNames: string[];
}

/** Read a block. Returns null for a block that is not this user's, is archived, or is not active. */
export function readPlan(userId: string, mesocycleId: string): ReadPlan | null {
  const mesocycle = db
    .select()
    .from(mesocycles)
    .where(and(eq(mesocycles.id, mesocycleId), eq(mesocycles.userId, userId), isNull(mesocycles.deletedAt)))
    .get();
  if (mesocycle === undefined || mesocycle.status !== 'active') return null;
  const unitSystem = unitSystemOf(userId);

  const cycleRows = db
    .select()
    .from(microcycles)
    .where(eq(microcycles.mesocycleId, mesocycleId))
    .orderBy(asc(microcycles.cycleNumber))
    .all();
  const live = cycleRows.filter((row) => row.deletedAt === null);
  const cycleIds = live.map((row) => row.id);
  const sessionRows =
    cycleIds.length === 0
      ? []
      : db
          .select()
          .from(plannedSessions)
          .where(and(inArray(plannedSessions.microcycleId, cycleIds), isNull(plannedSessions.deletedAt)))
          .orderBy(asc(plannedSessions.dayIndex), asc(plannedSessions.orderIndex))
          .all();
  const sessionIds = sessionRows.map((row) => row.id);
  const exerciseRows =
    sessionIds.length === 0
      ? []
      : db
          .select()
          .from(plannedExercises)
          .where(and(inArray(plannedExercises.plannedSessionId, sessionIds), isNull(plannedExercises.deletedAt)))
          .orderBy(asc(plannedExercises.orderIndex))
          .all();
  const exerciseIds = exerciseRows.map((row) => row.id);
  const setRows =
    exerciseIds.length === 0
      ? []
      : db
          .select()
          .from(plannedSets)
          .where(inArray(plannedSets.plannedExerciseId, exerciseIds))
          .orderBy(asc(plannedSets.setIndex))
          .all();

  const rules = rulesById(
    userId,
    exerciseRows
      .map((row) => resolveRuleId(row.progressionRuleId, mesocycle.defaultRuleId))
      .filter((id): id is string => id !== null),
  );
  const facts = exerciseFacts(
    exerciseRows.map((row) => row.exerciseId),
    unitSystem,
  );
  // The latest body weight, for `percent_1rm` on a bodyweight exercise; each log reads its own day's (INV-07).
  const bodyWeightKg = bodyWeightOn(userId, LATEST);

  const ids: ReadPlan['ids'] = {
    cycles: new Map(),
    sessions: new Map(),
    exercises: new Map(),
    sets: new Map(),
    archivedCycles: new Map(cycleRows.filter((row) => row.deletedAt !== null).map((row) => [row.cycleNumber, row.id])),
    archivedSets: new Map(),
  };
  const setsByExercise = groupBy(setRows, (row) => row.plannedExerciseId);
  const exercisesBySession = groupBy(exerciseRows, (row) => row.plannedSessionId);
  const sessionsByCycle = groupBy(sessionRows, (row) => row.microcycleId);

  const cycles: PlanCycle[] = live.map((cycle) => {
    ids.cycles.set(keyOf.cycle(cycle.cycleNumber), cycle.id);
    return {
      cycleNumber: cycle.cycleNumber,
      lengthDays: cycle.lengthDays,
      startsOn: cycle.startsOn,
      isDeload: cycle.isDeload,
      status: cycle.status as CycleStatus,
      engineVersion: cycle.engineVersion,
      lastWriteKind: cycle.lastWriteKind,
      sessions: (sessionsByCycle.get(cycle.id) ?? []).map((session) => {
        ids.sessions.set(keyOf.session(cycle.cycleNumber, session.dayIndex, session.orderIndex), session.id);
        return {
          dayIndex: session.dayIndex,
          orderIndex: session.orderIndex,
          exercises: (exercisesBySession.get(session.id) ?? []).map((exercise) => {
            const ruleId = resolveRuleId(exercise.progressionRuleId, mesocycle.defaultRuleId);
            const rule = ruleId === null ? undefined : rules.get(ruleId);
            const fact = facts.get(exercise.exerciseId);
            if (rule === undefined || fact === undefined) throw new MissingRuleError(exercise.exerciseId);
            const exerciseKey = keyOf.exercise(cycle.cycleNumber, session.dayIndex, session.orderIndex, exercise.orderIndex);
            ids.exercises.set(exerciseKey, {
              id: exercise.id,
              ruleId: exercise.progressionRuleId,
              exerciseId: exercise.exerciseId,
            });
            const sets: PlanSet[] = [];
            for (const set of setsByExercise.get(exercise.id) ?? []) {
              const setKey = keyOf.set(
                cycle.cycleNumber,
                session.dayIndex,
                session.orderIndex,
                exercise.orderIndex,
                set.setIndex,
              );
              if (set.deletedAt !== null) {
                ids.archivedSets.set(setKey, set.id);
                continue;
              }
              ids.sets.set(setKey, set.id);
              sets.push({
                setIndex: set.setIndex,
                setType: set.setType,
                targetWeightKg: set.targetWeightKg,
                targetReps: set.targetReps,
                targetMinReps: set.targetMinReps,
                targetMaxReps: set.targetMaxReps,
                targetRir: set.targetRir,
                wasClamped: set.wasClamped,
                origin: set.origin,
                isPinned: set.isPinned,
              });
            }
            return {
              orderIndex: exercise.orderIndex,
              exerciseId: exercise.exerciseId,
              incrementKg: fact.incrementKg,
              rule,
              usesBodyweight: fact.usesBodyweight,
              bodyWeightKg,
              sets,
            };
          }),
        };
      }),
    };
  });

  const firstCycleId = live[0]?.id;
  const sessionNames = (firstCycleId === undefined ? [] : (sessionsByCycle.get(firstCycleId) ?? [])).map(
    (session) => session.name,
  );
  return {
    mesocycle,
    spec: mesocycleSpecOf(mesocycle, live),
    cycles,
    logs: readLogs(userId, mesocycleId, live),
    ids,
    sessionNames,
  };
}

/**
 * Every set logged against this block's planned sets (FR-3.15), placed on the planned set's natural key, with body
 * weight on its workout's date (INV-07). Discarded workouts are archived, and are not read.
 */
function readLogs(
  userId: string,
  mesocycleId: string,
  cycles: readonly { cycleNumber: number; isDeload: boolean }[],
): PlanLog[] {
  const deload = new Map(cycles.map((cycle) => [cycle.cycleNumber, cycle.isDeload]));
  const rows = db
    .select({
      cycleNumber: microcycles.cycleNumber,
      dayIndex: plannedSessions.dayIndex,
      sessionOrderIndex: plannedSessions.orderIndex,
      exerciseOrderIndex: plannedExercises.orderIndex,
      setIndex: plannedSets.setIndex,
      setType: setLogs.setType,
      isCompleted: setLogs.isCompleted,
      weightKg: setLogs.weightKg,
      reps: setLogs.reps,
      rir: setLogs.rir,
      localDate: workouts.localDate,
      usesBodyweight: exercises.usesBodyweight,
    })
    .from(setLogs)
    .innerJoin(plannedSets, eq(setLogs.plannedSetId, plannedSets.id))
    .innerJoin(plannedExercises, eq(plannedSets.plannedExerciseId, plannedExercises.id))
    .innerJoin(plannedSessions, eq(plannedExercises.plannedSessionId, plannedSessions.id))
    .innerJoin(microcycles, eq(plannedSessions.microcycleId, microcycles.id))
    .innerJoin(exercises, eq(plannedExercises.exerciseId, exercises.id))
    .innerJoin(workoutExercises, eq(setLogs.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(
      and(
        eq(microcycles.mesocycleId, mesocycleId),
        eq(setLogs.userId, userId),
        isNull(setLogs.deletedAt),
        isNull(workouts.deletedAt),
      ),
    )
    .all();
  return rows.map((row) => {
    const set: LoggedSet = {
      setType: row.setType,
      isCompleted: row.isCompleted,
      weightKg: row.weightKg,
      reps: row.reps,
      rir: row.rir,
      usesBodyweight: row.usesBodyweight,
      bodyWeightKg: row.usesBodyweight ? bodyWeightOn(userId, row.localDate) : null,
      isDeload: deload.get(row.cycleNumber) ?? false,
    };
    return {
      cycleNumber: row.cycleNumber,
      dayIndex: row.dayIndex,
      sessionOrderIndex: row.sessionOrderIndex,
      exerciseOrderIndex: row.exerciseOrderIndex,
      setIndex: row.setIndex,
      set,
    };
  });
}

// ── Writing a plan back ───────────────────────────────────────────────────────────────────────────

/** What a write changed — counts only, for the caller and the device pass. */
export interface WriteSummary {
  readonly cyclesUpdated: number;
  readonly cyclesInserted: number;
  readonly setsUpdated: number;
  readonly setsInserted: number;
  readonly rowsArchived: number;
}

/**
 * Write `after` over the plan `read` came from, touching only what changed (stage 4a decision 3), in one transaction.
 * Ids for new rows are minted first; nothing is written unless everything is.
 */
export async function writePlan(read: ReadPlan, after: readonly PlanCycle[], now: number): Promise<WriteSummary> {
  const diff = diffPlan(read.cycles, after);
  const fresh = await uuidV7Batch(now, idsNeeded(diff));
  let next = 0;
  const mint = (): string => {
    const id = fresh[next];
    next += 1;
    if (id === undefined) throw new Error('the write needed more ids than were minted');
    return id;
  };
  const userId = read.mesocycle.userId;
  const stamps = { userId, createdAt: now, updatedAt: now };
  const cycleIds = new Map(read.ids.cycles);
  const sessionIds = new Map(read.ids.sessions);
  const exerciseIds = new Map([...read.ids.exercises].map(([key, it]) => [key, it.id]));

  // The rule a new exercise row points at: its latest existing row's, found as the engine finds "the same exercise".
  const latestRule = (exerciseId: string, occurrence: number): string | null => {
    for (const cycle of [...read.cycles].reverse()) {
      let seen = 0;
      for (const session of cycle.sessions) {
        for (const exercise of session.exercises) {
          if (exercise.exerciseId !== exerciseId) continue;
          if (seen === occurrence) {
            const key = keyOf.exercise(cycle.cycleNumber, session.dayIndex, session.orderIndex, exercise.orderIndex);
            return read.ids.exercises.get(key)?.ruleId ?? null;
          }
          seen += 1;
        }
      }
    }
    return null;
  };

  db.transaction((tx) => {
    for (const cycle of diff.cycles.updated) {
      const id = cycleIds.get(keyOf.cycle(cycle.cycleNumber));
      if (id === undefined) continue;
      tx.update(microcycles)
        .set({
          lengthDays: cycle.lengthDays,
          startsOn: cycle.startsOn,
          isDeload: cycle.isDeload,
          status: cycle.status,
          engineVersion: cycle.engineVersion,
          lastWriteKind: cycle.lastWriteKind,
          updatedAt: now,
        })
        .where(eq(microcycles.id, id))
        .run();
    }
    for (const cycle of diff.cycles.inserted) {
      const columns = {
        lengthDays: cycle.lengthDays,
        startsOn: cycle.startsOn,
        isDeload: cycle.isDeload,
        status: cycle.status,
        engineVersion: cycle.engineVersion,
        lastWriteKind: cycle.lastWriteKind,
        updatedAt: now,
      };
      const revived = read.ids.archivedCycles.get(cycle.cycleNumber);
      if (revived !== undefined) {
        tx.update(microcycles)
          .set({ ...columns, deletedAt: null })
          .where(eq(microcycles.id, revived))
          .run();
        cycleIds.set(keyOf.cycle(cycle.cycleNumber), revived);
        mint();
      } else {
        const id = mint();
        tx.insert(microcycles)
          .values({ ...stamps, ...columns, id, mesocycleId: read.mesocycle.id, cycleNumber: cycle.cycleNumber })
          .run();
        cycleIds.set(keyOf.cycle(cycle.cycleNumber), id);
      }
    }
    for (const session of diff.sessions.inserted) {
      const id = mint();
      const microcycleId = cycleIds.get(keyOf.cycle(session.cycle));
      if (microcycleId === undefined) continue;
      tx.insert(plannedSessions)
        .values({
          ...stamps,
          id,
          microcycleId,
          dayIndex: session.day,
          orderIndex: session.order,
          name: read.sessionNames[session.at] ?? '',
        })
        .run();
      sessionIds.set(keyOf.session(session.cycle, session.day, session.order), id);
    }
    for (const entry of diff.exercises.inserted) {
      const id = mint();
      const plannedSessionId = sessionIds.get(keyOf.session(entry.cycle, entry.day, entry.order));
      if (plannedSessionId === undefined) continue;
      tx.insert(plannedExercises)
        .values({
          ...stamps,
          id,
          plannedSessionId,
          exerciseId: entry.exercise.exerciseId,
          progressionRuleId: latestRule(entry.exercise.exerciseId, entry.occurrence),
          orderIndex: entry.exercise.orderIndex,
        })
        .run();
      exerciseIds.set(keyOf.exercise(entry.cycle, entry.day, entry.order, entry.exercise.orderIndex), id);
    }
    for (const { key, set } of diff.sets.updated) {
      const id = read.ids.sets.get(key);
      if (id === undefined) continue;
      tx.update(plannedSets)
        .set({ ...setColumns(set, set.origin, set.isPinned), updatedAt: now })
        .where(eq(plannedSets.id, id))
        .run();
    }
    for (const { exerciseKey, set } of diff.sets.inserted) {
      const plannedExerciseId = exerciseIds.get(exerciseKey);
      if (plannedExerciseId === undefined) continue;
      const revived = read.ids.archivedSets.get(`${exerciseKey}|${set.setIndex}`);
      if (revived !== undefined) {
        tx.update(plannedSets)
          .set({ ...setColumns(set, set.origin, set.isPinned), updatedAt: now, deletedAt: null })
          .where(eq(plannedSets.id, revived))
          .run();
        mint();
      } else {
        tx.insert(plannedSets)
          .values({ ...stamps, id: mint(), plannedExerciseId, ...setColumns(set, set.origin, set.isPinned) })
          .run();
      }
    }
    const archive = { deletedAt: now, updatedAt: now };
    for (const number of diff.cycles.archived) {
      const id = cycleIds.get(keyOf.cycle(number));
      if (id !== undefined) tx.update(microcycles).set(archive).where(eq(microcycles.id, id)).run();
    }
    for (const key of diff.sessions.archived) {
      const id = read.ids.sessions.get(key);
      if (id !== undefined) tx.update(plannedSessions).set(archive).where(eq(plannedSessions.id, id)).run();
    }
    for (const key of diff.exercises.archived) {
      const id = read.ids.exercises.get(key)?.id;
      if (id !== undefined) tx.update(plannedExercises).set(archive).where(eq(plannedExercises.id, id)).run();
    }
    for (const key of diff.sets.archived) {
      const id = read.ids.sets.get(key);
      if (id !== undefined) tx.update(plannedSets).set(archive).where(eq(plannedSets.id, id)).run();
    }
  });

  return {
    cyclesUpdated: diff.cycles.updated.length,
    cyclesInserted: diff.cycles.inserted.length,
    setsUpdated: diff.sets.updated.length,
    setsInserted: diff.sets.inserted.length,
    rowsArchived:
      diff.cycles.archived.length +
      diff.sessions.archived.length +
      diff.exercises.archived.length +
      diff.sets.archived.length,
  };
}

// ── The re-projection entry point ─────────────────────────────────────────────────────────────────

export interface Reconciliation {
  readonly outcomes: readonly SlotOutcome[];
  readonly written: WriteSummary;
}

/**
 * Settle, then reconcile, then write (stage 4a decision 2) — the one entry point to re-projection on the phone.
 * Idempotent: a second call with nothing new logged writes nothing. Returns null for a block that is not active.
 */
export async function reconcileBlock(
  userId: string,
  mesocycleId: string,
  today: string,
  now: number,
): Promise<Reconciliation | null> {
  const read = readPlan(userId, mesocycleId);
  if (read === null) return null;
  const settled = settlePlanStatuses(read.cycles, read.logs, today);
  const reconciled = reconcilePlan(read.spec, settled, read.logs, today);
  const written = await writePlan(read, reconciled.cycles, now);
  return { outcomes: reconciled.outcomes, written };
}

/** The active blocks a finished workout logged sets against — the blocks to reconcile after it (decision 4). */
export function blocksOfWorkout(userId: string, workoutId: string): string[] {
  return [
    ...new Set(
      db
        .select({ mesocycleId: microcycles.mesocycleId })
        .from(setLogs)
        .innerJoin(plannedSets, eq(setLogs.plannedSetId, plannedSets.id))
        .innerJoin(plannedExercises, eq(plannedSets.plannedExerciseId, plannedExercises.id))
        .innerJoin(plannedSessions, eq(plannedExercises.plannedSessionId, plannedSessions.id))
        .innerJoin(microcycles, eq(plannedSessions.microcycleId, microcycles.id))
        .innerJoin(workoutExercises, eq(setLogs.workoutExerciseId, workoutExercises.id))
        .where(and(eq(workoutExercises.workoutId, workoutId), eq(setLogs.userId, userId)))
        .all()
        .map((row) => row.mesocycleId),
    ),
  ];
}

/** This user's active blocks — reconciled at start-up, so a crash between a finish and its reconciliation heals. */
export function activeBlocks(userId: string): string[] {
  return db
    .select({ id: mesocycles.id })
    .from(mesocycles)
    .where(and(eq(mesocycles.userId, userId), eq(mesocycles.status, 'active'), isNull(mesocycles.deletedAt)))
    .all()
    .map((row) => row.id);
}

/**
 * Reconcile each block in turn, and never let one block's failure stop the rest or reach the caller: this runs after
 * a workout has already been saved (INV-09), and an unreconciled plan is healed by the next start-up. Failures are
 * returned for whoever wants to show them.
 */
export async function reconcileBlocks(
  userId: string,
  mesocycleIds: readonly string[],
  today: string,
  now: number,
): Promise<{ mesocycleId: string; error: unknown }[]> {
  const failures: { mesocycleId: string; error: unknown }[] = [];
  for (const mesocycleId of mesocycleIds) {
    try {
      await reconcileBlock(userId, mesocycleId, today, now);
    } catch (error) {
      failures.push({ mesocycleId, error });
    }
  }
  return failures;
}
