/**
 * The rows a finished workout's records are computed from — task 004 stage 6.
 *
 * The pure half only: the reads reach `expo-sqlite` through `./client`, which cannot open under Node, so the joins —
 * body weight on or before the day, the deload flag through the planned session — are settled on a device.
 */
import { exercisesOf, sessionsOf, toLoggedSet, type HistoryRow } from '../history';

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
