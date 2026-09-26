/**
 * The progression engine, from the phone's side — task 005 stage 4a. Marshalling only, for the reason `index.ts`
 * gives: generation, reconciliation, the block edits and the status rule are all `core-rs`'s, so the phone and the
 * server run the same arithmetic (INV-10, ADR-004).
 *
 * The app's side of each type speaks the schema: string enums as the columns hold them, `null` for absent, and dates
 * as `YYYY-MM-DD`. **This file is the only place a date becomes the core's day count and back** (stage 4a decision 7):
 * the core reads no calendar, and a second conversion elsewhere is how a plan ends up a day out.
 */
import {
  classify as nativeClassify,
  CycleStatus as NativeCycleStatus,
  DeloadPolicy as NativeDeloadPolicy,
  engineVersion as nativeEngineVersion,
  extend as nativeExtend,
  FailurePolicy as NativeFailurePolicy,
  FailurePolicy_Tags,
  generate as nativeGenerate,
  LoadStep as NativeLoadStep,
  LoadStep_Tags,
  Outcome as NativeOutcome,
  PlanError,
  reconcile as nativeReconcile,
  relength as nativeRelength,
  RirMode as NativeRirMode,
  RirMode_Tags,
  RoundingMode as NativeRoundingMode,
  SetOrigin as NativeSetOrigin,
  settleStatuses as nativeSettleStatuses,
  shorten as nativeShorten,
  Strategy as NativeStrategy,
  Strategy_Tags,
  switchRule as nativeSwitchRule,
  WriteKind as NativeWriteKind,
  type MesocycleSpec as NativeMesocycleSpec,
  type PlanCycle as NativePlanCycle,
  type PlanLog as NativePlanLog,
  type PlannedMicrocycle as NativePlannedMicrocycle,
  type PlanSet as NativePlanSet,
  type Rule as NativeRule,
  type SessionSpec as NativeSessionSpec,
} from '@cyberathlete/core-native';

import {
  absent,
  NATIVE_SET_TYPE,
  present,
  setTypeName,
  toNativeLoggedSet,
  type LoggedSet,
  type SetType,
} from './marshal';

// ── Dates ─────────────────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** A `YYYY-MM-DD` date as the core counts it: whole days since 1970-01-01. */
export function epochDayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.round(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / DAY_MS);
}

/** The inverse of {@link epochDayOf}. */
export function dateOfEpochDay(days: number): string {
  return new Date(days * DAY_MS).toISOString().slice(0, 10);
}

// ── The rule, as `progression_rules` holds it ─────────────────────────────────────────────────────

export type ProgressionStrategy = 'fixed' | 'linear_load' | 'double_progression' | 'percent_1rm' | 'rir_autoregulated';
export type RoundingMode = 'nearest' | 'down' | 'up';
export type RirModeName = 'per_exercise' | 'per_set';
export type FailurePolicyName = 'hold' | 'repeat_cycle' | 'reduce_load';

/** The `progression_rules` columns the engine reads, as the row holds them. */
export interface ProgressionRule {
  readonly strategy: ProgressionStrategy;
  readonly loadStepKg: number | null;
  readonly loadStepBp: number | null;
  readonly repStep: number | null;
  readonly minReps: number;
  readonly maxReps: number;
  readonly minRir: number;
  readonly maxRir: number;
  readonly rirMode: RirModeName;
  readonly rirOffsets: readonly number[] | null;
  readonly rirStart: number | null;
  readonly rirEnd: number | null;
  readonly percentWaveBp: readonly number[] | null;
  readonly baselineE1rmKg: number | null;
  readonly failurePolicy: FailurePolicyName;
  readonly failureLoadBp: number | null;
  readonly rounding: RoundingMode;
}

/** A rule the engine cannot run: a stepping strategy without exactly one step, `percent_1rm` without its baseline. */
export class IncompleteRuleError extends Error {
  constructor(readonly strategy: ProgressionStrategy) {
    super(`a ${strategy} rule is missing what its strategy needs`);
    this.name = 'IncompleteRuleError';
  }
}

const NATIVE_ROUNDING: Record<RoundingMode, NativeRoundingMode> = {
  nearest: NativeRoundingMode.Nearest,
  down: NativeRoundingMode.Down,
  up: NativeRoundingMode.Up,
};

function loadStepOf(rule: ProgressionRule): NativeLoadStep {
  if (rule.loadStepKg !== null && rule.loadStepBp === null) return new NativeLoadStep.Kg(rule.loadStepKg);
  if (rule.loadStepKg === null && rule.loadStepBp !== null) return new NativeLoadStep.BasisPoints(rule.loadStepBp);
  throw new IncompleteRuleError(rule.strategy);
}

function toNativeStrategy(rule: ProgressionRule): NativeStrategy {
  switch (rule.strategy) {
    case 'fixed':
      return new NativeStrategy.Fixed();
    case 'linear_load':
      return new NativeStrategy.LinearLoad(loadStepOf(rule));
    case 'double_progression':
      // `rep_step smallint NULL DEFAULT 1`: a NULL reads as the default.
      return new NativeStrategy.DoubleProgression({ step: loadStepOf(rule), repStep: rule.repStep ?? 1 });
    case 'percent_1rm':
      if (rule.baselineE1rmKg === null) throw new IncompleteRuleError(rule.strategy);
      return new NativeStrategy.Percent1rm({
        waveBp: [...(rule.percentWaveBp ?? [])],
        baselineE1rmKg: rule.baselineE1rmKg,
      });
    case 'rir_autoregulated':
      return new NativeStrategy.RirAutoregulated({
        step: loadStepOf(rule),
        rirStart: absent(rule.rirStart),
        rirEnd: absent(rule.rirEnd),
      });
  }
}

export function toNativeRule(rule: ProgressionRule): NativeRule {
  return {
    strategy: toNativeStrategy(rule),
    minReps: rule.minReps,
    maxReps: rule.maxReps,
    minRir: rule.minRir,
    maxRir: rule.maxRir,
    rounding: NATIVE_ROUNDING[rule.rounding],
    rirMode:
      rule.rirMode === 'per_set'
        ? new NativeRirMode.PerSet({ offsets: [...(rule.rirOffsets ?? [])] })
        : new NativeRirMode.PerExercise(),
    failurePolicy:
      rule.failurePolicy === 'reduce_load'
        ? new NativeFailurePolicy.ReduceLoad({ loadBp: rule.failureLoadBp ?? 9000 })
        : rule.failurePolicy === 'repeat_cycle'
          ? new NativeFailurePolicy.RepeatCycle()
          : new NativeFailurePolicy.Hold(),
  };
}

function fromNativeLoadStep(step: NativeLoadStep): { loadStepKg: number | null; loadStepBp: number | null } {
  return step.tag === LoadStep_Tags.Kg
    ? { loadStepKg: step.inner[0], loadStepBp: null }
    : { loadStepKg: null, loadStepBp: step.inner[0] };
}

const ROUNDING_NAME = new Map<NativeRoundingMode, RoundingMode>(
  (Object.entries(NATIVE_ROUNDING) as [RoundingMode, NativeRoundingMode][]).map(([name, native]) => [native, name]),
);

/** A rule back from the core — the same columns it went in as. */
export function fromNativeRule(rule: NativeRule): ProgressionRule {
  const none = { loadStepKg: null, loadStepBp: null, repStep: null, rirStart: null, rirEnd: null };
  const strategy = rule.strategy;
  const byStrategy = ((): Pick<
    ProgressionRule,
    'strategy' | 'loadStepKg' | 'loadStepBp' | 'repStep' | 'rirStart' | 'rirEnd' | 'percentWaveBp' | 'baselineE1rmKg'
  > => {
    switch (strategy.tag) {
      case Strategy_Tags.Fixed:
        return { strategy: 'fixed', ...none, percentWaveBp: null, baselineE1rmKg: null };
      case Strategy_Tags.LinearLoad:
        return {
          strategy: 'linear_load',
          ...none,
          ...fromNativeLoadStep(strategy.inner[0]),
          percentWaveBp: null,
          baselineE1rmKg: null,
        };
      case Strategy_Tags.DoubleProgression:
        return {
          strategy: 'double_progression',
          ...none,
          ...fromNativeLoadStep(strategy.inner.step),
          repStep: strategy.inner.repStep,
          percentWaveBp: null,
          baselineE1rmKg: null,
        };
      case Strategy_Tags.Percent1rm:
        return {
          strategy: 'percent_1rm',
          ...none,
          percentWaveBp: [...strategy.inner.waveBp],
          baselineE1rmKg: strategy.inner.baselineE1rmKg,
        };
      case Strategy_Tags.RirAutoregulated:
        return {
          strategy: 'rir_autoregulated',
          ...none,
          ...fromNativeLoadStep(strategy.inner.step),
          rirStart: present(strategy.inner.rirStart),
          rirEnd: present(strategy.inner.rirEnd),
          percentWaveBp: null,
          baselineE1rmKg: null,
        };
    }
  })();
  const rounding = ROUNDING_NAME.get(rule.rounding);
  if (rounding === undefined) throw new Error(`unknown rounding from the core: ${String(rule.rounding)}`);
  return {
    ...byStrategy,
    minReps: rule.minReps,
    maxReps: rule.maxReps,
    minRir: rule.minRir,
    maxRir: rule.maxRir,
    rirMode: rule.rirMode.tag === RirMode_Tags.PerSet ? 'per_set' : 'per_exercise',
    rirOffsets: rule.rirMode.tag === RirMode_Tags.PerSet ? [...rule.rirMode.inner.offsets] : null,
    failurePolicy:
      rule.failurePolicy.tag === FailurePolicy_Tags.ReduceLoad
        ? 'reduce_load'
        : rule.failurePolicy.tag === FailurePolicy_Tags.RepeatCycle
          ? 'repeat_cycle'
          : 'hold',
    failureLoadBp: rule.failurePolicy.tag === FailurePolicy_Tags.ReduceLoad ? rule.failurePolicy.inner.loadBp : null,
    rounding,
  };
}

// ── Generation ────────────────────────────────────────────────────────────────────────────────────

export type DeloadPolicy =
  | { readonly mode: 'none' }
  | { readonly mode: 'every_n_microcycles'; readonly every: number; readonly finalCycle: boolean }
  | { readonly mode: 'manual'; readonly cycles: readonly number[] };

/** The mesocycle as generation reads it. */
export interface MesocycleSpec {
  readonly startDate: string;
  readonly numMicrocycles: number;
  readonly defaultMicrocycleDays: number;
  readonly lengthOverrides: readonly { readonly cycleNumber: number; readonly lengthDays: number }[];
  readonly deload: DeloadPolicy;
  readonly deloadSetBp: number;
  readonly deloadLoadBp: number;
  readonly deloadRirBump: number;
}

export interface CycleOneSet {
  readonly setIndex: number;
  readonly setType: SetType;
  readonly targetWeightKg: number | null;
  readonly targetReps: number | null;
  readonly targetRir: number | null;
}

export interface ExerciseSpec {
  readonly orderIndex: number;
  /** INV-02's increment in the user's unit system, resolved by the caller, in exact kilograms. */
  readonly incrementKg: number;
  readonly rule: ProgressionRule;
  readonly usesBodyweight: boolean;
  readonly bodyWeightKg: number | null;
  readonly sets: readonly CycleOneSet[];
}

export interface SessionSpec {
  readonly dayIndex: number;
  readonly orderIndex: number;
  readonly exercises: readonly ExerciseSpec[];
}

export interface PlannedSet {
  readonly setIndex: number;
  readonly setType: SetType;
  readonly targetWeightKg: number | null;
  readonly targetReps: number | null;
  readonly targetMinReps: number | null;
  readonly targetMaxReps: number | null;
  readonly targetRir: number | null;
  readonly wasClamped: boolean;
}

export interface PlannedMicrocycle {
  readonly cycleNumber: number;
  readonly lengthDays: number;
  readonly startsOn: string;
  readonly isDeload: boolean;
  readonly engineVersion: number;
  readonly sessions: readonly {
    readonly dayIndex: number;
    readonly orderIndex: number;
    readonly exercises: readonly { readonly orderIndex: number; readonly sets: readonly PlannedSet[] }[];
  }[];
}

function toNativeDeload(deload: DeloadPolicy): NativeDeloadPolicy {
  switch (deload.mode) {
    case 'none':
      return new NativeDeloadPolicy.None();
    case 'every_n_microcycles':
      return new NativeDeloadPolicy.EveryN({ every: deload.every, finalCycle: deload.finalCycle });
    case 'manual':
      return new NativeDeloadPolicy.Manual({ cycles: [...deload.cycles] });
  }
}

function toNativeMesocycle(spec: MesocycleSpec): NativeMesocycleSpec {
  return {
    startDay: epochDayOf(spec.startDate),
    numMicrocycles: spec.numMicrocycles,
    defaultLengthDays: spec.defaultMicrocycleDays,
    lengthOverrides: spec.lengthOverrides.map((it) => ({ cycleNumber: it.cycleNumber, lengthDays: it.lengthDays })),
    deload: toNativeDeload(spec.deload),
    deloadSetBp: spec.deloadSetBp,
    deloadLoadBp: spec.deloadLoadBp,
    deloadRirBump: spec.deloadRirBump,
  };
}

function toNativeSession(session: SessionSpec): NativeSessionSpec {
  return {
    dayIndex: session.dayIndex,
    orderIndex: session.orderIndex,
    exercises: session.exercises.map((exercise) => ({
      orderIndex: exercise.orderIndex,
      incrementKg: exercise.incrementKg,
      rule: toNativeRule(exercise.rule),
      usesBodyweight: exercise.usesBodyweight,
      bodyWeightKg: absent(exercise.bodyWeightKg),
      sets: exercise.sets.map((set) => ({
        setIndex: set.setIndex,
        setType: NATIVE_SET_TYPE[set.setType],
        targetWeightKg: absent(set.targetWeightKg),
        targetReps: absent(set.targetReps),
        targetRir: absent(set.targetRir),
      })),
    })),
  };
}

function fromNativePlannedSet(set: {
  setIndex: number;
  setType: NativePlanSet['setType'];
  targetWeightKg?: number;
  targetReps?: number;
  targetMinReps?: number;
  targetMaxReps?: number;
  targetRir?: number;
  wasClamped: boolean;
}): PlannedSet {
  return {
    setIndex: set.setIndex,
    setType: setTypeName(set.setType),
    targetWeightKg: present(set.targetWeightKg),
    targetReps: present(set.targetReps),
    targetMinReps: present(set.targetMinReps),
    targetMaxReps: present(set.targetMaxReps),
    targetRir: present(set.targetRir),
    wasClamped: set.wasClamped,
  };
}

function fromNativeMicrocycle(cycle: NativePlannedMicrocycle): PlannedMicrocycle {
  return {
    cycleNumber: cycle.cycleNumber,
    lengthDays: cycle.lengthDays,
    startsOn: dateOfEpochDay(cycle.startsOn),
    isDeload: cycle.isDeload,
    engineVersion: cycle.engineVersion,
    sessions: cycle.sessions.map((session) => ({
      dayIndex: session.dayIndex,
      orderIndex: session.orderIndex,
      exercises: session.exercises.map((exercise) => ({
        orderIndex: exercise.orderIndex,
        sets: exercise.sets.map(fromNativePlannedSet),
      })),
    })),
  };
}

/** The engine that stamps every projection (INV-06). */
export function engineVersion(): number {
  return nativeEngineVersion();
}

/** Microcycles 2..N from microcycle 1 (FR-3.3), dated and stamped. Throws {@link IncompleteRuleError}. */
export function generateBlock(spec: MesocycleSpec, cycleOne: readonly SessionSpec[]): PlannedMicrocycle[] {
  return nativeGenerate(toNativeMesocycle(spec), cycleOne.map(toNativeSession)).map(fromNativeMicrocycle);
}

// ── The plan as rows, for reconciliation and the block edits ──────────────────────────────────────

export type CycleStatus = 'projected' | 'locked' | 'in_progress' | 'completed' | 'skipped';
export type WriteKind = 'engine' | 'user';
export type SetOrigin = 'generated' | 'user_edited';
export type Outcome = 'exceeded' | 'met' | 'under' | 'missed';

const NATIVE_STATUS: Record<CycleStatus, NativeCycleStatus> = {
  projected: NativeCycleStatus.Projected,
  locked: NativeCycleStatus.Locked,
  in_progress: NativeCycleStatus.InProgress,
  completed: NativeCycleStatus.Completed,
  skipped: NativeCycleStatus.Skipped,
};
const NATIVE_WRITE_KIND: Record<WriteKind, NativeWriteKind> = {
  engine: NativeWriteKind.Engine,
  user: NativeWriteKind.User,
};
const NATIVE_ORIGIN: Record<SetOrigin, NativeSetOrigin> = {
  generated: NativeSetOrigin.Generated,
  user_edited: NativeSetOrigin.UserEdited,
};
const OUTCOME_NAME: Record<NativeOutcome, Outcome> = {
  [NativeOutcome.Exceeded]: 'exceeded',
  [NativeOutcome.Met]: 'met',
  [NativeOutcome.Under]: 'under',
  [NativeOutcome.Missed]: 'missed',
};

function reverse<K extends string, V extends number>(forward: Record<K, V>): Record<V, K> {
  return Object.fromEntries(Object.entries(forward).map(([key, value]) => [value, key])) as Record<V, K>;
}
const STATUS_NAME = reverse(NATIVE_STATUS);
const WRITE_KIND_NAME = reverse(NATIVE_WRITE_KIND);
const ORIGIN_NAME = reverse(NATIVE_ORIGIN);

export interface PlanSet extends PlannedSet {
  readonly origin: SetOrigin;
  readonly isPinned: boolean;
}

export interface PlanExercise {
  readonly orderIndex: number;
  /** `planned_exercises.exercise_id` — compared by the engine, never read (stage 3, decision 2). */
  readonly exerciseId: string;
  readonly incrementKg: number;
  readonly rule: ProgressionRule;
  readonly usesBodyweight: boolean;
  readonly bodyWeightKg: number | null;
  readonly sets: readonly PlanSet[];
}

export interface PlanSession {
  readonly dayIndex: number;
  readonly orderIndex: number;
  readonly exercises: readonly PlanExercise[];
}

export interface PlanCycle {
  readonly cycleNumber: number;
  readonly lengthDays: number;
  readonly startsOn: string;
  readonly isDeload: boolean;
  readonly status: CycleStatus;
  readonly engineVersion: number;
  readonly lastWriteKind: WriteKind;
  readonly sessions: readonly PlanSession[];
}

/** A logged set on the planned set it was logged against, by that set's natural key (FR-3.15). */
export interface PlanLog {
  readonly cycleNumber: number;
  readonly dayIndex: number;
  readonly sessionOrderIndex: number;
  readonly exerciseOrderIndex: number;
  readonly setIndex: number;
  readonly set: LoggedSet;
}

export interface SlotOutcome {
  readonly cycleNumber: number;
  readonly exerciseId: string;
  readonly occurrence: number;
  readonly outcome: Outcome;
  readonly openLoop: boolean;
}

function toNativePlanSet(set: PlanSet): NativePlanSet {
  return {
    setIndex: set.setIndex,
    setType: NATIVE_SET_TYPE[set.setType],
    targetWeightKg: absent(set.targetWeightKg),
    targetReps: absent(set.targetReps),
    targetMinReps: absent(set.targetMinReps),
    targetMaxReps: absent(set.targetMaxReps),
    targetRir: absent(set.targetRir),
    wasClamped: set.wasClamped,
    origin: NATIVE_ORIGIN[set.origin],
    isPinned: set.isPinned,
  };
}

function toNativePlan(cycles: readonly PlanCycle[]): NativePlanCycle[] {
  return cycles.map((cycle) => ({
    cycleNumber: cycle.cycleNumber,
    lengthDays: cycle.lengthDays,
    startsOn: epochDayOf(cycle.startsOn),
    isDeload: cycle.isDeload,
    status: NATIVE_STATUS[cycle.status],
    engineVersion: cycle.engineVersion,
    lastWriteKind: NATIVE_WRITE_KIND[cycle.lastWriteKind],
    sessions: cycle.sessions.map((session) => ({
      dayIndex: session.dayIndex,
      orderIndex: session.orderIndex,
      exercises: session.exercises.map((exercise) => ({
        orderIndex: exercise.orderIndex,
        exerciseId: exercise.exerciseId,
        incrementKg: exercise.incrementKg,
        rule: toNativeRule(exercise.rule),
        usesBodyweight: exercise.usesBodyweight,
        bodyWeightKg: absent(exercise.bodyWeightKg),
        sets: exercise.sets.map(toNativePlanSet),
      })),
    })),
  }));
}

function fromNativePlan(cycles: readonly NativePlanCycle[]): PlanCycle[] {
  return cycles.map((cycle) => ({
    cycleNumber: cycle.cycleNumber,
    lengthDays: cycle.lengthDays,
    startsOn: dateOfEpochDay(cycle.startsOn),
    isDeload: cycle.isDeload,
    status: STATUS_NAME[cycle.status],
    engineVersion: cycle.engineVersion,
    lastWriteKind: WRITE_KIND_NAME[cycle.lastWriteKind],
    sessions: cycle.sessions.map((session) => ({
      dayIndex: session.dayIndex,
      orderIndex: session.orderIndex,
      exercises: session.exercises.map((exercise) => ({
        orderIndex: exercise.orderIndex,
        exerciseId: exercise.exerciseId,
        incrementKg: exercise.incrementKg,
        rule: fromNativeRule(exercise.rule),
        usesBodyweight: exercise.usesBodyweight,
        bodyWeightKg: present(exercise.bodyWeightKg),
        sets: exercise.sets.map((set) => ({
          ...fromNativePlannedSet(set),
          origin: ORIGIN_NAME[set.origin],
          isPinned: set.isPinned,
        })),
      })),
    })),
  }));
}

function toNativeLogs(logs: readonly PlanLog[]): NativePlanLog[] {
  return logs.map((log) => ({
    cycleNumber: log.cycleNumber,
    dayIndex: log.dayIndex,
    sessionOrderIndex: log.sessionOrderIndex,
    exerciseOrderIndex: log.exerciseOrderIndex,
    setIndex: log.setIndex,
    set: toNativeLoggedSet(log.set),
  }));
}

/** A block edit the engine refused: why, and where (task 005 stage 3b). */
export class PlanRefusedError extends Error {
  constructor(
    readonly reason: string,
    readonly cycleNumber: number | null,
    readonly dayIndex: number | null,
  ) {
    super(`plan edit refused: ${reason}`);
    this.name = 'PlanRefusedError';
  }
}

function refusals<T>(edit: () => T): T {
  try {
    return edit();
  } catch (error) {
    if (PlanError.Refused.instanceOf(error)) {
      const { reason, cycleNumber, dayIndex } = PlanError.Refused.getInner(error);
      throw new PlanRefusedError(reason, present(cycleNumber), present(dayIndex));
    }
    throw error;
  }
}

/** How one planned exercise went (01 §3.4). */
export function classifyExercise(planned: readonly PlanSet[], logs: readonly PlanLog[]): Outcome {
  return OUTCOME_NAME[nativeClassify(planned.map(toNativePlanSet), toNativeLogs(logs))];
}

/** Move each cycle's status on from the logs, as of `today` — settle, then reconcile, then write. */
export function settlePlanStatuses(plan: readonly PlanCycle[], logs: readonly PlanLog[], today: string): PlanCycle[] {
  return fromNativePlan(nativeSettleStatuses(toNativePlan(plan), toNativeLogs(logs), epochDayOf(today)));
}

/** Re-project the plan from what was logged, as of `today` (01 §3.4, INV-06). */
export function reconcilePlan(
  spec: MesocycleSpec,
  plan: readonly PlanCycle[],
  logs: readonly PlanLog[],
  today: string,
): { cycles: PlanCycle[]; outcomes: SlotOutcome[] } {
  const reconciled = nativeReconcile(toNativeMesocycle(spec), toNativePlan(plan), toNativeLogs(logs), epochDayOf(today));
  return {
    cycles: fromNativePlan(reconciled.cycles),
    outcomes: reconciled.outcomes.map((it) => ({
      cycleNumber: it.cycleNumber,
      exerciseId: it.exerciseId,
      occurrence: it.occurrence,
      outcome: OUTCOME_NAME[it.outcome],
      openLoop: it.openLoop,
    })),
  };
}

/** Lengthen a block to `to` cycles (FR-3.1c). Throws {@link PlanRefusedError}. */
export function extendPlan(
  spec: MesocycleSpec,
  plan: readonly PlanCycle[],
  logs: readonly PlanLog[],
  today: string,
  to: number,
): PlanCycle[] {
  return refusals(() =>
    fromNativePlan(nativeExtend(toNativeMesocycle(spec), toNativePlan(plan), toNativeLogs(logs), epochDayOf(today), to)),
  );
}

/** Shorten a block to `to` cycles; the dropped cycle numbers are the caller's to archive. Throws {@link PlanRefusedError}. */
export function shortenPlan(
  plan: readonly PlanCycle[],
  logs: readonly PlanLog[],
  to: number,
): { cycles: PlanCycle[]; dropped: number[] } {
  return refusals(() => {
    const shortened = nativeShorten(toNativePlan(plan), toNativeLogs(logs), to);
    return { cycles: fromNativePlan(shortened.cycles), dropped: [...shortened.dropped] };
  });
}

/** Give one cycle a length of `days` (FR-3.1a). Throws {@link PlanRefusedError}. */
export function relengthPlan(
  plan: readonly PlanCycle[],
  logs: readonly PlanLog[],
  cycleNumber: number,
  days: number,
): PlanCycle[] {
  return refusals(() => fromNativePlan(nativeRelength(toNativePlan(plan), toNativeLogs(logs), cycleNumber, days)));
}

/** Put `rule` on one exercise from `fromCycle` on, and reconcile — preview and commit alike (FR-3.6a). */
export function switchPlanRule(
  spec: MesocycleSpec,
  plan: readonly PlanCycle[],
  logs: readonly PlanLog[],
  today: string,
  exercise: { readonly exerciseId: string; readonly occurrence: number },
  fromCycle: number,
  rule: ProgressionRule,
): PlanCycle[] {
  return refusals(() =>
    fromNativePlan(
      nativeSwitchRule(
        toNativeMesocycle(spec),
        toNativePlan(plan),
        toNativeLogs(logs),
        epochDayOf(today),
        exercise.exerciseId,
        exercise.occurrence,
        fromCycle,
        toNativeRule(rule),
      ).cycles,
    ),
  );
}
