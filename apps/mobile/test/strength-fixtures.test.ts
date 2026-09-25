/**
 * Task 004's shared fixtures are well-formed, checked exactly as pytest checks them (06 §3).
 *
 * **What this suite can and cannot prove.** The core reaches the app as a JSI turbo-module, which does not load
 * under Node — the same reason `shared-fixtures.test.ts` checks the rounding fixture's shape rather than calling
 * `roundToIncrement`. So the client half of "the fixture produces identical results in Python and TypeScript" is
 * settled **on a device**, the way task 017 settled the spike's two values on a Galaxy S21 FE. Here we hold the
 * files themselves to their own spec, so a case that is internally contradictory fails before it ever reaches a
 * phone, and Rust and Python — both of which do run the cases — are checking the same well-formed inputs.
 */
import e1rmFixture from '@cyberathlete/shared/fixtures/e1rm.json';
import countedFixture from '@cyberathlete/shared/fixtures/is_counted_set.json';
import bestsFixture from '@cyberathlete/shared/fixtures/personal_bests.json';
import prFixture from '@cyberathlete/shared/fixtures/pr_detection.json';

const SET_TYPES = ['warmup', 'working', 'drop', 'backoff', 'amrap'];
const COUNTED_TYPES = ['working', 'amrap'];
const PR_KINDS = ['max_weight', 'best_e1rm', 'max_reps_at_weight', 'best_session_volume'];
const MAX_EFFECTIVE_REPS = 12;

interface FixtureSet {
  set_type?: string;
  is_completed?: boolean;
  weight_kg?: number | null;
  reps?: number | null;
  rir?: number | null;
  uses_bodyweight?: boolean;
  body_weight_kg?: number | null;
  is_deload?: boolean;
}

/** INV-03: RIR is 0..10 or absent, and absent is never 0. */
function expectSetIsWellFormed(set: FixtureSet) {
  expect(SET_TYPES).toContain(set.set_type ?? 'working');
  if (set.rir !== undefined && set.rir !== null) {
    expect(Number.isInteger(set.rir)).toBe(true);
    expect(set.rir).toBeGreaterThanOrEqual(0);
    expect(set.rir).toBeLessThanOrEqual(10);
  }
  if (set.reps !== undefined && set.reps !== null) {
    expect(Number.isInteger(set.reps)).toBe(true);
    expect(set.reps).toBeGreaterThanOrEqual(0);
  }
  if (set.weight_kg !== undefined && set.weight_kg !== null) {
    expect(set.weight_kg).toBeGreaterThanOrEqual(0);
  }
}

describe('the e1rm fixture', () => {
  it('names its function and has cases', () => {
    expect(e1rmFixture.function).toBe('e1rm');
    expect(e1rmFixture.cases.length).toBeGreaterThan(0);
  });

  it.each(e1rmFixture.cases)('$name', ({ set, expected }) => {
    expectSetIsWellFormed(set);

    if (expected === null) return;

    // The expectation is a load and an effective rep count, never a float: each consumer applies Epley in its
    // own arithmetic (INV-07). What this checks is that the pair is consistent with the set it describes.
    expect(expected.effective_reps).toBeLessThanOrEqual(MAX_EFFECTIVE_REPS);
    expect(Number.isInteger(expected.effective_reps)).toBe(true);
    expect(expected.effective_reps).toBe((set.reps ?? 0) + (set.rir ?? 0));

    const added = set.weight_kg ?? 0;
    const expectedLoad = set.uses_bodyweight === true ? (set.body_weight_kg ?? 0) + added : added;
    expect(expected.load_kg).toBe(expectedLoad);
  });

  it('refuses to state an e1RM wherever an input is unknown', () => {
    // INV-07's no-guessing rule, read off the file: every null expectation has a missing input or is past
    // the bound, and no case with every input present is expected to be null.
    for (const { name, set, expected } of e1rmFixture.cases) {
      const effective = (set.reps ?? 0) + (set.rir ?? 0);
      const loadIsKnown = set.uses_bodyweight === true ? set.body_weight_kg != null : set.weight_kg != null;
      const knowable = set.reps != null && set.rir != null && loadIsKnown && effective <= MAX_EFFECTIVE_REPS;

      expect([name, expected !== null]).toEqual([name, knowable]);
    }
  });
});

describe('the is_counted_set fixture', () => {
  it('names its function and has cases', () => {
    expect(countedFixture.function).toBe('is_counted_set');
    expect(countedFixture.cases.length).toBeGreaterThan(0);
  });

  it.each(countedFixture.cases)('$name', ({ set, expected }) => {
    expectSetIsWellFormed(set);

    // INV-04, restated independently of the core: a working or amrap set that was completed, and nothing else.
    const counts = COUNTED_TYPES.includes(set.set_type ?? 'working') && (set.is_completed ?? true);
    expect(expected).toBe(counts);
  });

  it('enumerates all five set types against both completion states', () => {
    // The point of the file: adding a sixth type to the enum without deciding whether it counts should fail
    // here rather than silently in a chart.
    const seen = new Set(countedFixture.cases.map(({ set }) => `${set.set_type ?? 'working'}:${set.is_completed ?? true}`));
    for (const type of SET_TYPES) {
      expect(seen).toContain(`${type}:true`);
      expect(seen).toContain(`${type}:false`);
    }
  });
});

describe('the pr_detection fixture', () => {
  it('names its function and has cases', () => {
    expect(prFixture.function).toBe('detect_prs');
    expect(prFixture.cases.length).toBeGreaterThan(0);
  });

  it.each(prFixture.cases)('$name', ({ session, expected }) => {
    for (const set of session) expectSetIsWellFormed(set);

    for (const achievement of expected) {
      expect(PR_KINDS).toContain(achievement.kind);

      if (achievement.kind === 'best_session_volume') {
        // A session total belongs to no one set, so it carries no index.
        expect(achievement.set_index).toBeNull();
      } else {
        expect(achievement.set_index).not.toBeNull();
        expect(achievement.set_index).toBeLessThan(session.length);
      }
    }
  });

  it('never expects a record from a set that INV-04 or INV-08 excludes', () => {
    for (const { name, session, expected } of prFixture.cases) {
      for (const achievement of expected) {
        if (achievement.set_index === null) continue;
        // TypeScript infers each JSON case as its own literal shape, so the union lacks the fields a
        // case did not spell. The interface is the file's documented `set_defaults` shape.
        const set: FixtureSet = session[achievement.set_index];
        expect([name, COUNTED_TYPES.includes(set.set_type ?? 'working')]).toEqual([name, true]);
        expect([name, set.is_completed ?? true]).toEqual([name, true]);
        expect([name, set.is_deload ?? false]).toEqual([name, false]);
      }
    }
  });

  it('lists achievements in the order the core returns them', () => {
    // The order is part of the contract: two devices showing a celebration must show the same one first.
    for (const { name, expected } of prFixture.cases) {
      const positions = expected.map((achievement) => PR_KINDS.indexOf(achievement.kind));
      expect([name, positions]).toEqual([name, [...positions].sort((left, right) => left - right)]);
    }
  });
});

describe('the personal_bests fixture (task 004 stage 6)', () => {
  it('names its function and has cases', () => {
    expect(bestsFixture.function).toBe('personal_bests');
    expect(bestsFixture.cases.length).toBeGreaterThan(0);
  });

  it.each(bestsFixture.cases)('$name', ({ sessions, expected }) => {
    // TypeScript infers each case's literal shape; the interface is the file's documented `set_defaults`.
    const all: FixtureSet[] = sessions.flat();
    for (const set of all) expectSetIsWellFormed(set);

    // Read off the file rather than recomputed: a best can only come from a set INV-04 and INV-08 let count.
    const eligible = all.filter(
      (set) => COUNTED_TYPES.includes(set.set_type ?? 'working') && (set.is_completed ?? true) && !(set.is_deload ?? false),
    );
    if (eligible.length === 0) {
      expect(expected.max_weight_kg).toBeNull();
      expect(expected.best_e1rm).toBeNull();
      expect(expected.best_session_volume_kg).toBeNull();
      expect(expected.best_reps_at_weight).toEqual([]);
    }

    // The e1RM best is a load and an effective rep count, never a float (INV-07), inside Epley's honest range.
    if (expected.best_e1rm !== null) {
      expect(Number.isInteger(expected.best_e1rm.effective_reps)).toBe(true);
      expect(expected.best_e1rm.effective_reps).toBeLessThanOrEqual(MAX_EFFECTIVE_REPS);
    }

    // Lightest load first, and one entry per load: the order is part of the contract.
    const loads = expected.best_reps_at_weight.map((best) => best.weight_kg);
    expect(loads).toEqual([...loads].sort((left, right) => left - right));
    expect(new Set(loads).size).toBe(loads.length);
  });
});
