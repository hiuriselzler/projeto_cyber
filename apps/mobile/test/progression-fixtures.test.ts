/**
 * Task 005's shared fixtures are well-formed — the planner's `generate.json` and `resolve_dates.json` (06 §3).
 *
 * **What this suite can and cannot prove.** Jest cannot load the core (`strength-fixtures.test.ts` says why), so the
 * app half of "fixture #1 passes in every suite" is settled on the device through UniFFI, from stage 4. Here the files
 * are held to the invariants they claim to illustrate, so a fixture that contradicts its own rule — a load off the
 * grid, a session past its cycle's end, a date that skips — fails before it reaches Rust, Python or a phone.
 */
import generateFixture from '@cyberathlete/shared/fixtures/generate.json';
import datesFixture from '@cyberathlete/shared/fixtures/resolve_dates.json';

/** FR-3.1a. There is no constant for 7: it is a default, never an assumption (INV-25). */
const MIN_LENGTH_DAYS = 1;
const MAX_LENGTH_DAYS = 28;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Rule {
  strategy: string;
  load_step_kg: number | null;
  load_step_bp: number | null;
  min_reps: number;
  max_reps: number;
  min_rir: number;
  max_rir: number;
  rounding: string;
}

interface CycleOneExercise {
  order_index: number;
  increment_kg: number;
  rule: Rule;
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

    it('prescribes only liftable loads and targets inside each rule (INV-02, INV-05)', () => {
      const sessions = canonical(fixtureCase.cycle_one);
      for (const cycle of expected) {
        cycle.sessions.forEach((session, at) => {
          for (const exercise of session.exercises) {
            const spec = sessions[at]?.exercises.find((it) => it.order_index === exercise.order_index);
            expect(spec).toBeDefined();
            if (!spec) continue;
            for (const set of exercise.sets) {
              if (set.target_weight_kg !== undefined && set.target_weight_kg !== null) {
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
