/**
 * Task 005's shared fixtures are well-formed — the planner's `generate.json` and `resolve_dates.json` (06 §3).
 *
 * **What this suite can and cannot prove.** Jest cannot load the core (`strength-fixtures.test.ts` says why), so the
 * app half of "fixture #1 passes in every suite" is settled on the device through UniFFI, from stage 4. Here the files
 * are held to the invariants they claim to illustrate, so a fixture that contradicts its own rule — a load off the
 * grid, a session past its cycle's end, a date that skips — fails before it reaches Rust, Python or a phone.
 */
import editsFixture from '@cyberathlete/shared/fixtures/edits.json';
import generateFixture from '@cyberathlete/shared/fixtures/generate.json';
import reconcileFixture from '@cyberathlete/shared/fixtures/reconcile.json';
import datesFixture from '@cyberathlete/shared/fixtures/resolve_dates.json';

/** FR-3.1a. There is no constant for 7: it is a default, never an assumption (INV-25). */
const MIN_LENGTH_DAYS = 1;
const MAX_LENGTH_DAYS = 28;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The five v1 values of `progression_strategy_enum`; `cycle_pattern` is v2 (01 §3.2). */
const V1_STRATEGIES = ['fixed', 'linear_load', 'double_progression', 'percent_1rm', 'rir_autoregulated'];
const COUNTED_TYPES = ['working', 'amrap'];

interface Rule {
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

interface CycleOneExercise {
  order_index: number;
  increment_kg: number;
  rule: Rule;
  uses_bodyweight: boolean;
  body_weight_kg: number | null;
  sets: { set_index: number; set_type: string }[];
}

interface CycleOneSession {
  day_index: number;
  order_index: number;
  exercises: CycleOneExercise[];
}

interface PlannedSet {
  set_index: number;
  set_type: string;
  target_weight_kg?: number | null;
  target_weight_steps?: number;
  target_reps: number | null;
  target_min_reps: number | null;
  target_max_reps: number | null;
  target_rir: number | null;
  was_clamped: boolean;
}

interface PlannedCycle {
  cycle_number: number;
  starts_on: string;
  length_days: number;
  is_deload: boolean;
  sessions: { day_index: number; order_index: number; exercises: { order_index: number; sets: PlannedSet[] }[] }[];
}

interface GenerateCase {
  name: string;
  mesocycle: {
    start_date: string;
    num_microcycles: number;
    default_length_days: number;
    length_overrides: { cycle_number: number; length_days: number }[];
    deload: { mode: string; every?: number; final_cycle?: boolean; cycles?: number[] };
  };
  cycle_one: CycleOneSession[];
  expected: PlannedCycle[];
}

const cases = generateFixture.cases as GenerateCase[];

function day(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY_MS;
}

function lengthOf(mesocycle: GenerateCase['mesocycle'], cycle: number): number {
  const override = [...mesocycle.length_overrides].reverse().find((it) => it.cycle_number === cycle);
  return override?.length_days ?? mesocycle.default_length_days;
}

function canonical(sessions: CycleOneSession[]): CycleOneSession[] {
  return [...sessions].sort((a, b) => a.day_index - b.day_index || a.order_index - b.order_index);
}

describe('generate.json', () => {
  it('holds fixture #1, the owner’s own example', () => {
    const first = cases.find((it) => it.name.startsWith('fixture #1'));
    expect(first).toBeDefined();
    const cycle11 = first?.expected.find((it) => it.cycle_number === 11);
    expect(cycle11?.sessions[0]?.exercises[0]?.sets[0]?.target_weight_kg).toBe(62.5);
  });

  describe.each(cases.map((it) => [it.name, it] as const))('%s', (_name, fixtureCase) => {
    const { mesocycle, expected } = fixtureCase;

    it('lists every cycle from 2 to N, each starting exactly one length after the one before', () => {
      expect(expected.map((it) => it.cycle_number)).toEqual(
        Array.from({ length: mesocycle.num_microcycles - 1 }, (_, index) => index + 2),
      );
      let start = day(mesocycle.start_date) + lengthOf(mesocycle, 1);
      for (const cycle of expected) {
        expect(day(cycle.starts_on)).toBe(start);
        expect(cycle.length_days).toBe(lengthOf(mesocycle, cycle.cycle_number));
        start += cycle.length_days;
      }
    });

    it('places every session inside its own cycle, and drops none (INV-25)', () => {
      for (const cycle of expected) {
        expect(cycle.length_days).toBeGreaterThanOrEqual(MIN_LENGTH_DAYS);
        expect(cycle.length_days).toBeLessThanOrEqual(MAX_LENGTH_DAYS);
        expect(cycle.sessions).toHaveLength(fixtureCase.cycle_one.length);
        for (const session of cycle.sessions) {
          expect(session.day_index).toBeGreaterThanOrEqual(1);
          expect(session.day_index).toBeLessThanOrEqual(cycle.length_days);
        }
        const keys = new Set(cycle.sessions.map((it) => `${it.day_index}:${it.order_index}`));
        expect(keys.size).toBe(cycle.sessions.length);
      }
    });

    it('writes every rule as a v1 strategy with what that strategy needs', () => {
      for (const session of fixtureCase.cycle_one) {
        for (const { rule } of session.exercises) {
          expect(V1_STRATEGIES).toContain(rule.strategy);
          expect(['per_exercise', 'per_set']).toContain(rule.rir_mode);
          const steps = [rule.load_step_kg, rule.load_step_bp].filter((it) => it !== null);
          if (['linear_load', 'double_progression', 'rir_autoregulated'].includes(rule.strategy)) {
            expect(steps).toHaveLength(1);
          }
          if (rule.strategy === 'percent_1rm') {
            expect(rule.baseline_e1rm_kg).not.toBeNull();
          }
        }
      }
    });

    it('prescribes only liftable loads and targets inside each rule (INV-02, INV-05)', () => {
      const sessions = canonical(fixtureCase.cycle_one);
      for (const cycle of expected) {
        cycle.sessions.forEach((session, at) => {
          for (const exercise of session.exercises) {
            const spec = sessions[at]?.exercises.find((it) => it.order_index === exercise.order_index);
            expect(spec).toBeDefined();
            if (!spec) continue;
            for (const set of exercise.sets) {
              // A rep range rides on exactly the counted sets of a double-progression exercise (03 §5).
              const ranged = spec.rule.strategy === 'double_progression' && COUNTED_TYPES.includes(set.set_type);
              expect([set.target_min_reps, set.target_max_reps]).toEqual(
                ranged ? [spec.rule.min_reps, spec.rule.max_reps] : [null, null],
              );
              if (set.target_weight_kg !== undefined && set.target_weight_kg !== null) {
                expect(set.target_weight_kg).toBeGreaterThanOrEqual(0);
                const steps = set.target_weight_kg / spec.increment_kg;
                expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
              }
              if (set.target_weight_steps !== undefined) {
                expect(Number.isInteger(set.target_weight_steps)).toBe(true);
              }
              if (set.target_reps !== null) {
                expect(set.target_reps).toBeGreaterThanOrEqual(spec.rule.min_reps);
                expect(set.target_reps).toBeLessThanOrEqual(spec.rule.max_reps);
              }
              if (set.target_rir !== null) {
                expect(set.target_rir).toBeGreaterThanOrEqual(spec.rule.min_rir);
                expect(set.target_rir).toBeLessThanOrEqual(spec.rule.max_rir);
              }
              expect(typeof set.was_clamped).toBe('boolean');
            }
          }
        });
      }
    });

    it('deloads only where its policy says, and never under none (FR-3.1b)', () => {
      const { deload, num_microcycles: last } = mesocycle;
      for (const cycle of expected) {
        const n = cycle.cycle_number;
        const flagged =
          deload.mode === 'every_n_microcycles'
            ? n % (deload.every ?? 0) === 0 || (deload.final_cycle === true && n === last)
            : deload.mode === 'manual'
              ? (deload.cycles ?? []).includes(n)
              : false;
        expect(cycle.is_deload).toBe(flagged);
      }
    });
  });
});

describe('resolve_dates.json', () => {
  it.each(datesFixture.cases.map((it) => [it.name, it] as const))('%s', (_name, fixtureCase) => {
    expect(fixtureCase.expected).toHaveLength(fixtureCase.length_days.length);
    expect(fixtureCase.expected[0]).toBe(fixtureCase.start_date);
    for (let index = 1; index < fixtureCase.expected.length; index += 1) {
      const length = Math.min(
        MAX_LENGTH_DAYS,
        Math.max(MIN_LENGTH_DAYS, fixtureCase.length_days[index - 1] ?? MIN_LENGTH_DAYS),
      );
      const previous = fixtureCase.expected[index - 1] ?? '';
      expect(day(fixtureCase.expected[index] ?? '') - day(previous)).toBe(length);
    }
  });
});

/** The engine these fixtures were written for (INV-06). */
const ENGINE_VERSION = 1;
const STATUSES = ['projected', 'locked', 'in_progress', 'completed', 'skipped'];
const OUTCOMES = ['exceeded', 'met', 'under', 'missed'];

interface PlanSet {
  set_index: number;
  set_type: string;
  target_weight_kg: number | null;
  target_reps: number | null;
  target_min_reps: number | null;
  target_max_reps: number | null;
  target_rir: number | null;
  was_clamped: boolean;
  origin: string;
  is_pinned: boolean;
}

interface PlanCycle {
  cycle_number: number;
  starts_on: string;
  length_days: number;
  is_deload: boolean;
  status: string;
  engine_version: number;
  last_write_kind: string;
  sessions: {
    day_index: number;
    order_index: number;
    exercises: (Omit<CycleOneExercise, 'sets'> & { exercise_id: string; sets: PlanSet[] })[];
  }[];
}

interface ReconcileCase {
  name: string;
  today: string;
  plan: PlanCycle[];
  logs: { cycle_number: number; set_index: number }[];
  expected: {
    cycles: PlanCycle[];
    outcomes: { cycle_number: number; exercise_id: string; occurrence: number; outcome: string; open_loop: boolean }[];
  };
}

const reconcileCases = reconcileFixture.cases as ReconcileCase[];

/** Every set of a cycle, with the exercise it belongs to. */
function setsOf(cycle: PlanCycle) {
  return cycle.sessions.flatMap((session) =>
    session.exercises.flatMap((exercise) => exercise.sets.map((set) => ({ exercise, set }))),
  );
}

describe('reconcile.json', () => {
  describe.each(reconcileCases.map((it) => [it.name, it] as const))('%s', (_name, fixtureCase) => {
    const { plan, logs, expected } = fixtureCase;
    const yields = plan.some((cycle) => cycle.engine_version > ENGINE_VERSION);
    const logged = new Set(logs.map((log) => log.cycle_number));
    const first = Math.min(...plan.map((cycle) => cycle.cycle_number));
    const rewritable = (cycle: PlanCycle) =>
      !yields && cycle.cycle_number !== first && cycle.status === 'projected' && !logged.has(cycle.cycle_number);

    it('names only statuses, write kinds, origins and outcomes the schema has', () => {
      for (const cycle of [...plan, ...expected.cycles]) {
        expect(STATUSES).toContain(cycle.status);
        expect(['engine', 'user']).toContain(cycle.last_write_kind);
        for (const { set } of setsOf(cycle)) expect(['generated', 'user_edited']).toContain(set.origin);
      }
      for (const it of expected.outcomes) expect(OUTCOMES).toContain(it.outcome);
    });

    it('changes only projected cycles with nothing logged, and stamps each one it rewrites (INV-06)', () => {
      expect(expected.cycles.map((it) => it.cycle_number)).toEqual(plan.map((it) => it.cycle_number));
      plan.forEach((before, at) => {
        const after = expected.cycles[at];
        if (!after) throw new Error('a cycle went missing');
        if (rewritable(before)) {
          expect(after.engine_version).toBe(ENGINE_VERSION);
          expect(after.last_write_kind).toBe('engine');
        } else {
          expect(after).toEqual(before);
        }
      });
      if (yields) expect(expected.outcomes).toEqual([]);
    });

    it('keeps every user-edited or pinned row exactly (FR-3.14)', () => {
      plan.forEach((before, at) => {
        const after = expected.cycles[at];
        if (!after) throw new Error('a cycle went missing');
        const kept = setsOf(after).map((it) => it.set);
        for (const { set } of setsOf(before)) {
          if (set.origin === 'user_edited' || set.is_pinned) expect(kept).toContainEqual(set);
        }
      });
    });

    it('writes only liftable loads inside each rule (INV-02, INV-05)', () => {
      for (const cycle of expected.cycles.filter((_, at) => plan[at] && rewritable(plan[at]))) {
        for (const { exercise, set } of setsOf(cycle)) {
          if (set.origin !== 'generated') continue;
          if (set.target_weight_kg !== null) {
            const steps = set.target_weight_kg / exercise.increment_kg;
            expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
          }
          if (set.target_reps !== null) {
            expect(set.target_reps).toBeGreaterThanOrEqual(exercise.rule.min_reps);
            expect(set.target_reps).toBeLessThanOrEqual(exercise.rule.max_reps);
          }
          if (set.target_rir !== null) {
            expect(set.target_rir).toBeGreaterThanOrEqual(exercise.rule.min_rir);
            expect(set.target_rir).toBeLessThanOrEqual(exercise.rule.max_rir);
          }
        }
      }
    });
  });
});
const REFUSALS = [
  'newer_engine',
  'started',
  'locked',
  'history',
  'session_does_not_fit',
  'out_of_range',
  'no_such_cycle',
  'no_such_exercise',
];

interface EditCase {
  op: string;
  name: string;
  plan: PlanCycle[];
  logs: { cycle_number: number }[];
  args: { to?: number; cycle_number?: number; days?: number; from_cycle?: number };
  expected: {
    cycles?: PlanCycle[];
    dropped?: number[];
    refusal?: { reason: string; cycle_number: number | null; day_index: number | null };
  };
}

const editCases = editsFixture.cases as EditCase[];

describe('edits.json', () => {
  describe.each(editCases.map((it) => [it.name, it] as const))('%s', (_name, fixtureCase) => {
    const { op, plan, logs, expected } = fixtureCase;
    const logged = new Set(logs.map((log) => log.cycle_number));
    const started = (cycle: PlanCycle) =>
      !['projected', 'locked'].includes(cycle.status) || logged.has(cycle.cycle_number);

    it('names an op the engine has, and expects either a plan or a refusal', () => {
      expect(['extend', 'shorten', 'relength', 'switch_rule', 'settle_statuses']).toContain(op);
      expect(expected.cycles === undefined).toBe(expected.refusal !== undefined);
      if (expected.refusal) expect(REFUSALS).toContain(expected.refusal.reason);
    });

    it('keeps every date contiguous and every cycle number in sequence (INV-25)', () => {
      const cycles = expected.cycles ?? [];
      cycles.forEach((cycle, at) => expect(cycle.cycle_number).toBe(at + 1));
      for (let at = 1; at < cycles.length; at += 1) {
        const previous = cycles[at - 1];
        const current = cycles[at];
        if (!previous || !current) continue;
        expect(day(current.starts_on) - day(previous.starts_on)).toBe(previous.length_days);
      }
    });

    it('drops, moves or rewrites nothing that has started (INV-06)', () => {
      const cycles = expected.cycles;
      if (!cycles) return;
      if (op === 'extend') expect(cycles.slice(0, plan.length)).toEqual(plan);
      if (op === 'shorten') {
        expect(cycles).toEqual(plan.slice(0, cycles.length));
        expect(expected.dropped).toEqual(plan.slice(cycles.length).map((it) => it.cycle_number));
        for (const dropped of plan.slice(cycles.length)) {
          expect(dropped.status).toBe('projected');
          expect(started(dropped)).toBe(false);
        }
      }
      if (op === 'relength') {
        plan.forEach((before, at) => {
          const after = cycles[at];
          if (!after) throw new Error('a cycle went missing');
          expect(after.sessions).toEqual(before.sessions);
          if (after.starts_on !== before.starts_on) expect(started(before)).toBe(false);
        });
      }
      if (op === 'switch_rule') {
        plan.forEach((before, at) => {
          if (before.status !== 'projected' || logged.has(before.cycle_number)) {
            expect(cycles[at]).toEqual(before);
          }
        });
      }
    });
  });
});