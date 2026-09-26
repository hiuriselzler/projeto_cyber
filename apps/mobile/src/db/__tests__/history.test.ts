/**
 * The rows a finished workout's records are computed from — task 004 stage 6 — and the history screens' rows, stage 7.
 *
 * The pure half only: the reads reach `expo-sqlite` through `./client`, which cannot open under Node, so the joins —
 * body weight on or before the day, the deload flag through the planned session — are settled on a device.
 */
import {
  datedSessionsOf,
  detailExercisesOf,
  exercisesOf,
  sessionsOf,
  toLoggedSet,
  type DetailRow,
  type HistoryRow,
  type PerformedRow,
} from '../history';

jest.mock('../client', () => ({ db: {}, sqlite: {} }));

function row(overrides: Partial<HistoryRow>): HistoryRow {
  return {
    workoutId: 'w1',
    exerciseId: 'bench',
    setType: 'working',
    isCompleted: true,
    weightKg: 100,
    reps: 5,
    rir: 2,
    usesBodyweight: false,
    bodyWeightKg: null,
    isDeload: null,
    ...overrides,
  };
}

describe('a row as the core wants it', () => {
  it('keeps a blank RIR blank — not recorded is never 0 (INV-03)', () => {
    expect(toLoggedSet(row({ rir: null })).rir).toBeNull();
    expect(toLoggedSet(row({ rir: 0 })).rir).toBe(0);
  });

  it('reads a workout from no plan as no deload, which is every workout until task 005 (INV-08)', () => {
    expect(toLoggedSet(row({ isDeload: null })).isDeload).toBe(false);
    expect(toLoggedSet(row({ isDeload: true })).isDeload).toBe(true);
  });

  it('carries the body weight resolved for the workout’s own day, untouched (INV-07, INV-17)', () => {
    const set = toLoggedSet(row({ usesBodyweight: true, bodyWeightKg: 80, weightKg: 20 }));
    expect(set.usesBodyweight).toBe(true);
    expect(set.bodyWeightKg).toBe(80);
    expect(set.weightKg).toBe(20);
  });

  it('carries unticked rows through — the core decides what counts, never this module (INV-04)', () => {
    expect(toLoggedSet(row({ isCompleted: false, setType: 'warmup' }))).toMatchObject({
      isCompleted: false,
      setType: 'warmup',
    });
  });
});

describe('a history, grouped into sessions', () => {
  it('is one session per workout, in the order the rows came', () => {
    const sessions = sessionsOf([
      row({ workoutId: 'w1', weightKg: 100 }),
      row({ workoutId: 'w1', weightKg: 102.5 }),
      row({ workoutId: 'w2', weightKg: 105 }),
    ]);
    expect(sessions.map((session) => session.map((set) => set.weightKg))).toEqual([[100, 102.5], [105]]);
  });

  it('keeps an exercise done twice in one workout as one session, so its volume is one afternoon’s', () => {
    // Two `workout_exercises` rows of the same exercise are still one workout: a session-volume best belongs to it.
    const sessions = sessionsOf([row({ workoutId: 'w1' }), row({ workoutId: 'w1' }), row({ workoutId: 'w1' })]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toHaveLength(3);
  });

  it('is empty for no history — a first session has nothing to beat', () => {
    expect(sessionsOf([])).toEqual([]);
  });
});

function performed(overrides: Partial<PerformedRow>): PerformedRow {
  return {
    ...row({}),
    setIndex: 1,
    durationS: null,
    distanceM: null,
    title: 'Treino A',
    startedAt: 1_000,
    localDate: '2026-09-23',
    ...overrides,
  };
}

function detail(overrides: Partial<DetailRow>): DetailRow {
  return {
    workoutExerciseId: 'we1',
    exerciseId: 'bench',
    tracking: 'weight_reps',
    notes: null,
    setIndex: 1,
    setType: 'working',
    weightKg: 100,
    reps: 5,
    rir: 2,
    durationS: null,
    distanceM: null,
    isCompleted: true,
    ...overrides,
  };
}

describe('an exercise’s history, as dated sessions (stage 7)', () => {
  it('is one session per workout, dated as recorded, with every row as logged and as the core wants it', () => {
    const sessions = datedSessionsOf([
      performed({ workoutId: 'w1', localDate: '2026-09-20', setIndex: 1, setType: 'warmup', weightKg: 60 }),
      performed({ workoutId: 'w1', localDate: '2026-09-20', setIndex: 2, weightKg: 100, rir: null }),
      performed({ workoutId: 'w2', localDate: '2026-09-23', setIndex: 1, weightKg: 102.5 }),
    ]);
    expect(sessions.map((session) => [session.workoutId, session.localDate])).toEqual([
      ['w1', '2026-09-20'],
      ['w2', '2026-09-23'],
    ]);
    // The log keeps the warm-up; the core decides it does not count (INV-04).
    expect(sessions[0]?.performed.map((set) => set.setType)).toEqual(['warmup', 'working']);
    expect(sessions[0]?.sets.map((set) => set.weightKg)).toEqual([60, 100]);
    // A blank RIR stays blank on both sides (INV-03).
    expect(sessions[0]?.performed[1]?.rir).toBeNull();
    expect(sessions[0]?.sets[1]?.rir).toBeNull();
  });

  it('carries a hold’s time and a carry’s distance through for the list', () => {
    const [session] = datedSessionsOf([performed({ durationS: 90, distanceM: 30.48, weightKg: null, reps: null, rir: null })]);
    expect(session?.performed[0]).toMatchObject({ durationS: 90, distanceM: 30.48 });
  });
});

describe('a workout’s detail (stage 7)', () => {
  it('is one block per exercise entry in workout order, each with its note and its sets', () => {
    const blocks = detailExercisesOf([
      detail({ workoutExerciseId: 'we1', exerciseId: 'bench', notes: 'ombro ok', setIndex: 1 }),
      detail({ workoutExerciseId: 'we1', exerciseId: 'bench', notes: 'ombro ok', setIndex: 2, isCompleted: false }),
      detail({ workoutExerciseId: 'we2', exerciseId: 'row', setIndex: 1 }),
    ]);
    expect(blocks.map((block) => [block.exerciseId, block.notes, block.sets.length])).toEqual([
      ['bench', 'ombro ok', 2],
      ['row', null, 1],
    ]);
    // An unticked row is part of the log, marked, not dropped (stage 6, decision 7).
    expect(blocks[0]?.sets[1]?.isCompleted).toBe(false);
  });

  it('keeps an exercise done twice as two blocks, since the detail is the workout as it was done', () => {
    const blocks = detailExercisesOf([
      detail({ workoutExerciseId: 'we1', exerciseId: 'bench' }),
      detail({ workoutExerciseId: 'we3', exerciseId: 'bench' }),
    ]);
    expect(blocks).toHaveLength(2);
  });

  it('keeps an exercise with no set, so its note is not lost', () => {
    const blocks = detailExercisesOf([
      detail({
        workoutExerciseId: 'we1',
        notes: 'skipped: machine taken',
        setIndex: null,
        setType: null,
        weightKg: null,
        reps: null,
        rir: null,
        isCompleted: null,
      }),
    ]);
    expect(blocks).toEqual([
      { workoutExerciseId: 'we1', exerciseId: 'bench', tracking: 'weight_reps', notes: 'skipped: machine taken', sets: [] },
    ]);
  });
});

describe('a finished workout, grouped per exercise', () => {
  it('groups by exercise in the order each first appears', () => {
    const groups = exercisesOf([
      row({ exerciseId: 'squat' }),
      row({ exerciseId: 'bench' }),
      row({ exerciseId: 'squat', reps: 3 }),
    ]);
    expect(groups.map((group) => group.exerciseId)).toEqual(['squat', 'bench']);
    expect(groups[0]?.sets.map((set) => set.reps)).toEqual([5, 3]);
  });
});
