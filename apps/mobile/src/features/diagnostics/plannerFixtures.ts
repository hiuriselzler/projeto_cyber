/**
 * Every shared progression fixture, run through the engine on this device — task 005 stage 4a, decision 6.
 *
 * `cargo test` runs these files against the core and pytest runs them through PyO3; Jest cannot load the native module
 * (`test/strength-fixtures.test.ts` says why). This is the third suite: the same cases, through UniFFI and
 * `src/domain/progression.ts`, on the phone — the device half of "fixture #1 passes in every suite". Debug builds only.
 */
import editsFixture from '@cyberathlete/shared/fixtures/edits.json';
import generateFixture from '@cyberathlete/shared/fixtures/generate.json';
import reconcileFixture from '@cyberathlete/shared/fixtures/reconcile.json';

import {
  extendPlan,
  generateBlock,
  PlanRefusedError,
  reconcilePlan,
  relengthPlan,
  settlePlanStatuses,
  shortenPlan,
  switchPlanRule,
  type CycleStatus,
  type DeloadPolicy,
  type FailurePolicyName,
  type MesocycleSpec,
  type PlanCycle,
  type PlanLog,
  type ProgressionRule,
  type ProgressionStrategy,
  type RirModeName,
  type RoundingMode,
  type SessionSpec,
  type SetOrigin,
  type SetType,
  type WriteKind,
} from '@/domain';

/* The fixtures' own shapes, as the JSON spells them. */
interface JsonRule {
  strategy: string;
  load_step_kg: number | null;
  load_step_bp: number | null;
  rep_step: number | null;
  min_reps: number;
  max_reps: number;
  min_rir: number;
  max_rir: number;
  rir_mode: string;
  rir_offsets: number[] | null;
  rir_start: number | null;
  rir_end: number | null;
  percent_wave_bp: number[] | null;
  baseline_e1rm_kg: number | null;
  failure_policy: string;
  failure_load_bp: number | null;
  rounding: string;
}
interface JsonMesocycle {
  start_date: string;
  num_microcycles: number;
  default_length_days: number;
  length_overrides: { cycle_number: number; length_days: number }[];
  deload: { mode: string; every?: number; final_cycle?: boolean; cycles?: number[] };
  deload_set_bp: number;
  deload_load_bp: number;
  deload_rir_bump: number;
}
interface JsonSet {
  set_index: number;
  set_type: string;
  target_weight_kg?: number | null;
  target_weight_steps?: number;
  target_reps: number | null;
  target_min_reps?: number | null;
  target_max_reps?: number | null;
  target_rir: number | null;
  was_clamped?: boolean;
  origin?: string;
  is_pinned?: boolean;
}
interface JsonExercise {
  order_index: number;
  exercise_id?: string;
  increment_kg?: number;
  rule?: JsonRule;
  uses_bodyweight?: boolean;
  body_weight_kg?: number | null;
  sets: JsonSet[];
}
interface JsonSession {
  day_index: number;
  order_index: number;
  exercises: JsonExercise[];
}
interface JsonCycle {
  cycle_number: number;
  starts_on: string;
  length_days: number;
  is_deload: boolean;
  status?: string;
  engine_version?: number;
  last_write_kind?: string;
  sessions: JsonSession[];
}
interface JsonLog {
  cycle_number: number;
  day_index: number;
  session_order_index: number;
  exercise_order_index: number;
  set_index: number;
  set: {
    set_type: string;
    is_completed: boolean;
    weight_kg: number | null;
    reps: number | null;
    rir: number | null;
    uses_bodyweight: boolean;
    body_weight_kg: number | null;
    is_deload: boolean;
  };
}
interface JsonOutcome {
  cycle_number: number;
  exercise_id: string;
  occurrence: number;
  outcome: string;
  open_loop: boolean;
}

function rule(json: JsonRule): ProgressionRule {
  return {
    strategy: json.strategy as ProgressionStrategy,
    loadStepKg: json.load_step_kg,
    loadStepBp: json.load_step_bp,
    repStep: json.rep_step,
    minReps: json.min_reps,
    maxReps: json.max_reps,
    minRir: json.min_rir,
    maxRir: json.max_rir,
    rirMode: json.rir_mode as RirModeName,
    rirOffsets: json.rir_offsets,
    rirStart: json.rir_start,
    rirEnd: json.rir_end,
    percentWaveBp: json.percent_wave_bp,
    baselineE1rmKg: json.baseline_e1rm_kg,
    failurePolicy: json.failure_policy as FailurePolicyName,
    failureLoadBp: json.failure_load_bp,
    rounding: json.rounding as RoundingMode,
  };
}

function mesocycle(json: JsonMesocycle): MesocycleSpec {
  const deload: DeloadPolicy =
    json.deload.mode === 'every_n_microcycles'
      ? { mode: 'every_n_microcycles', every: json.deload.every ?? 0, finalCycle: json.deload.final_cycle ?? false }
      : json.deload.mode === 'manual'
        ? { mode: 'manual', cycles: json.deload.cycles ?? [] }
        : { mode: 'none' };
  return {
    startDate: json.start_date,
    numMicrocycles: json.num_microcycles,
    defaultMicrocycleDays: json.default_length_days,
    lengthOverrides: json.length_overrides.map((it) => ({ cycleNumber: it.cycle_number, lengthDays: it.length_days })),
    deload,
    deloadSetBp: json.deload_set_bp,
    deloadLoadBp: json.deload_load_bp,
    deloadRirBump: json.deload_rir_bump,
  };
}

/** A fixture's expected load: written out, or as steps of the exercise's increment multiplied here (as in Rust). */
function load(set: JsonSet, incrementKg: number): number | null {
  if (set.target_weight_steps !== undefined) return set.target_weight_steps * incrementKg;
  return set.target_weight_kg ?? null;
}

function plannedSet(set: JsonSet, incrementKg: number) {
  return {
    setIndex: set.set_index,
    setType: set.set_type as SetType,
    targetWeightKg: load(set, incrementKg),
    targetReps: set.target_reps,
    targetMinReps: set.target_min_reps ?? null,
    targetMaxReps: set.target_max_reps ?? null,
    targetRir: set.target_rir,
    wasClamped: set.was_clamped ?? false,
  };
}

function plan(cycles: JsonCycle[]): PlanCycle[] {
  return cycles.map((cycle) => ({
    cycleNumber: cycle.cycle_number,
    lengthDays: cycle.length_days,
    startsOn: cycle.starts_on,
    isDeload: cycle.is_deload,
    status: (cycle.status ?? 'projected') as CycleStatus,
    engineVersion: cycle.engine_version ?? 1,
    lastWriteKind: (cycle.last_write_kind ?? 'engine') as WriteKind,
    sessions: cycle.sessions.map((session) => ({
      dayIndex: session.day_index,
      orderIndex: session.order_index,
      exercises: session.exercises.map((exercise) => {
        const incrementKg = exercise.increment_kg ?? 0;
        if (exercise.rule === undefined) throw new Error('a plan exercise carries its rule');
        return {
          orderIndex: exercise.order_index,
          exerciseId: exercise.exercise_id ?? '',
          incrementKg,
          rule: rule(exercise.rule),
          usesBodyweight: exercise.uses_bodyweight ?? false,
          bodyWeightKg: exercise.body_weight_kg ?? null,
          sets: exercise.sets.map((set) => ({
            ...plannedSet(set, incrementKg),
            origin: (set.origin ?? 'generated') as SetOrigin,
            isPinned: set.is_pinned ?? false,
          })),
        };
      }),
    })),
  }));
}

function logs(json: JsonLog[]): PlanLog[] {
  return json.map((log) => ({
    cycleNumber: log.cycle_number,
    dayIndex: log.day_index,
    sessionOrderIndex: log.session_order_index,
    exerciseOrderIndex: log.exercise_order_index,
    setIndex: log.set_index,
    set: {
      setType: log.set.set_type as SetType,
      isCompleted: log.set.is_completed,
      weightKg: log.set.weight_kg,
      reps: log.set.reps,
      rir: log.set.rir,
      usesBodyweight: log.set.uses_bodyweight,
      bodyWeightKg: log.set.body_weight_kg,
      isDeload: log.set.is_deload,
    },
  }));
}

function outcomes(json: JsonOutcome[]) {
  return json.map((it) => ({
    cycleNumber: it.cycle_number,
    exerciseId: it.exercise_id,
    occurrence: it.occurrence,
    outcome: it.outcome,
    openLoop: it.open_loop,
  }));
}

/**
 * A value with its keys sorted and every `rule` left out. The rule is input the engine passes through untouched, and
 * a rule back from the core carries the columns its strategy reads — `repStep` null for a linear rule where the
 * fixture writes the schema's default — so it is compared by the Rust suite, which holds the core's own type.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'rule')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, canonical(inner)]),
    );
  }
  return value;
}

/** Exact equality, as the Rust suite asserts it: every number to the last bit. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

export interface FixtureRun {
  readonly file: string;
  readonly passed: number;
  readonly failed: readonly string[];
}

function runGenerate(): FixtureRun {
  const failed: string[] = [];
  const cases = generateFixture.cases as unknown as {
    name: string;
    mesocycle: JsonMesocycle;
    cycle_one: JsonSession[];
    expected: JsonCycle[];
  }[];
  for (const fixture of cases) {
    try {
      const incrementOf = new Map(
        fixture.cycle_one.flatMap((session) => session.exercises.map((it) => [it.order_index, it.increment_kg ?? 0])),
      );
      const cycleOne: SessionSpec[] = fixture.cycle_one.map((session) => ({
        dayIndex: session.day_index,
        orderIndex: session.order_index,
        exercises: session.exercises.map((exercise) => {
          if (exercise.rule === undefined) throw new Error('a cycle-one exercise carries its rule');
          return {
            orderIndex: exercise.order_index,
            incrementKg: exercise.increment_kg ?? 0,
            rule: rule(exercise.rule),
            usesBodyweight: exercise.uses_bodyweight ?? false,
            bodyWeightKg: exercise.body_weight_kg ?? null,
            sets: exercise.sets.map((set) => ({
              setIndex: set.set_index,
              setType: set.set_type as SetType,
              targetWeightKg: set.target_weight_kg ?? null,
              targetReps: set.target_reps,
              targetRir: set.target_rir,
            })),
          };
        }),
      }));
      const actual = generateBlock(mesocycle(fixture.mesocycle), cycleOne);
      const expected = fixture.expected.map((cycle) => ({
        cycleNumber: cycle.cycle_number,
        lengthDays: cycle.length_days,
        startsOn: cycle.starts_on,
        isDeload: cycle.is_deload,
        engineVersion: 1,
        sessions: cycle.sessions.map((session) => ({
          dayIndex: session.day_index,
          orderIndex: session.order_index,
          exercises: session.exercises.map((exercise) => ({
            orderIndex: exercise.order_index,
            sets: exercise.sets.map((set) => plannedSet(set, incrementOf.get(exercise.order_index) ?? 0)),
          })),
        })),
      }));
      if (!same(actual, expected)) failed.push(fixture.name);
    } catch (error) {
      failed.push(`${fixture.name} — threw ${String(error)}`);
    }
  }
  return { file: 'generate.json', passed: cases.length - failed.length, failed };
}

function runReconcile(): FixtureRun {
  const failed: string[] = [];
  const cases = reconcileFixture.cases as unknown as {
    name: string;
    mesocycle: JsonMesocycle;
    today: string;
    plan: JsonCycle[];
    logs: JsonLog[];
    expected: { cycles: JsonCycle[]; outcomes: JsonOutcome[] };
  }[];
  for (const fixture of cases) {
    try {
      const actual = reconcilePlan(mesocycle(fixture.mesocycle), plan(fixture.plan), logs(fixture.logs), fixture.today);
      if (!same(actual.cycles, plan(fixture.expected.cycles)) || !same(actual.outcomes, outcomes(fixture.expected.outcomes))) {
        failed.push(fixture.name);
      }
    } catch (error) {
      failed.push(`${fixture.name} — threw ${String(error)}`);
    }
  }
  return { file: 'reconcile.json', passed: cases.length - failed.length, failed };
}

function runEdits(): FixtureRun {
  const failed: string[] = [];
  const cases = editsFixture.cases as unknown as {
    op: string;
    name: string;
    mesocycle: JsonMesocycle;
    today: string;
    plan: JsonCycle[];
    logs: JsonLog[];
    args: {
      to?: number;
      cycle_number?: number;
      days?: number;
      exercise_id?: string;
      occurrence?: number;
      from_cycle?: number;
      rule?: JsonRule;
    };
    expected: {
      cycles?: JsonCycle[];
      dropped?: number[];
      refusal?: { reason: string; cycle_number: number | null; day_index: number | null };
    };
  }[];
  for (const fixture of cases) {
    const spec = mesocycle(fixture.mesocycle);
    const before = plan(fixture.plan);
    const logged = logs(fixture.logs);
    const { args } = fixture;
    try {
      let cycles: PlanCycle[];
      let dropped: number[] | undefined;
      switch (fixture.op) {
        case 'extend':
          cycles = extendPlan(spec, before, logged, fixture.today, args.to ?? 0);
          break;
        case 'shorten': {
          const shortened = shortenPlan(before, logged, args.to ?? 0);
          cycles = shortened.cycles;
          dropped = shortened.dropped;
          break;
        }
        case 'relength':
          cycles = relengthPlan(before, logged, args.cycle_number ?? 0, args.days ?? 0);
          break;
        case 'settle_statuses':
          cycles = settlePlanStatuses(before, logged, fixture.today);
          break;
        case 'switch_rule':
          if (args.rule === undefined) throw new Error('a switch carries its rule');
          cycles = switchPlanRule(
            spec,
            before,
            logged,
            fixture.today,
            { exerciseId: args.exercise_id ?? '', occurrence: args.occurrence ?? 0 },
            args.from_cycle ?? 0,
            rule(args.rule),
          );
          break;
        default:
          throw new Error(`unknown op ${fixture.op}`);
      }
      const want = fixture.expected;
      const ok =
        want.refusal === undefined &&
        same(cycles, plan(want.cycles ?? [])) &&
        (want.dropped === undefined || same(dropped, want.dropped));
      if (!ok) failed.push(fixture.name);
    } catch (error) {
      const want = fixture.expected.refusal;
      const refusedAsExpected =
        error instanceof PlanRefusedError &&
        want !== undefined &&
        error.reason === want.reason &&
        error.cycleNumber === want.cycle_number &&
        error.dayIndex === want.day_index;
      if (!refusedAsExpected) failed.push(`${fixture.name} — ${String(error)}`);
    }
  }
  return { file: 'edits.json', passed: cases.length - failed.length, failed };
}

/** Every progression fixture through the engine on this device. */
export function runPlannerFixtures(): FixtureRun[] {
  return [runGenerate(), runReconcile(), runEdits()];
}
