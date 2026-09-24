/**
 * The rows a live workout is made of — task 004 stage 3.
 *
 * Only the pure half is under test. `src/db/strength.ts` reaches `expo-sqlite` through `./client`, which cannot open
 * under Node, so that the writes actually land — and how long the ✓ takes when they do — is a device check, exactly
 * as it is for the seed.
 */
import {
  completionPatch,
  fieldPatch,
  localDayOf,
  missingForCompletion,
  setLogRow,
  workoutExerciseRow,
  workoutRow,
} from '../strength';

jest.mock('../client', () => ({ db: {}, sqlite: {} }));

const USER = 'user-1';
const NOW = Date.UTC(2026, 8, 19, 12, 0, 0);

describe('the calendar day a workout belongs to (INV-17)', () => {
  it('is zero-padded, and is the device’s own local day', () => {
    const local = new Date(NOW);
    const expected = `${String(local.getFullYear())}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(
      local.getDate(),
    ).padStart(2, '0')}`;
    expect(localDayOf(NOW)).toBe(expected);
    expect(localDayOf(NOW)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('pads a single-digit month and day rather than writing 2026-9-1', () => {
    // Midday, so that no plausible device zone can shift the date off the first.
    expect(localDayOf(new Date(2026, 0, 1, 12).getTime())).toBe('2026-01-01');
  });
});

describe('a new workout', () => {
  const row = workoutRow({ id: 'w1', userId: USER, title: 'Treino A', startedAt: NOW, tz: 'America/Sao_Paulo' });

  it('stores the local date and zone as facts, recorded now (INV-17)', () => {
    expect(row.localDate).toBe(localDayOf(NOW));
    expect(row.tz).toBe('America/Sao_Paulo');
  });

  it('is open — ended_at null is what sync must never send (task 006)', () => {
    expect(row.endedAt).toBeNull();
  });

  it('keeps the title exactly as the user typed it, never translated (INV-27)', () => {
    expect(row.title).toBe('Treino A');
  });
});

describe('a new set row', () => {
  const row = setLogRow({ id: 's1', userId: USER, workoutExerciseId: 'we1', setIndex: 1, now: NOW });

  it('exists before it is filled in, which is what makes the ✓ an UPDATE and not an INSERT', () => {
    expect(row.isCompleted).toBe(false);
    expect(row.completedAt).toBeNull();
  });

  it('starts every value at null — "not recorded", never 0 (INV-03)', () => {
    expect(row.weightKg).toBeNull();
    expect(row.reps).toBeNull();
    expect(row.rir).toBeNull();
  });

  it('is a working set until the user says otherwise, so it counts (INV-04)', () => {
    expect(row.setType).toBe('working');
  });
});

describe('completing a set', () => {
  it('stamps the moment it was ticked', () => {
    expect(completionPatch(true, NOW)).toEqual({ isCompleted: true, completedAt: NOW, updatedAt: NOW });
  });

  it('clears the stamp when it is un-ticked, rather than keeping a tick the user took back', () => {
    expect(completionPatch(false, NOW)).toEqual({ isCompleted: false, completedAt: null, updatedAt: NOW });
  });
});

describe('editing one of the row’s three numbers', () => {
  it('writes the column it was asked for', () => {
    expect(fieldPatch('weightKg', 62.5, NOW)).toEqual({ weightKg: 62.5, updatedAt: NOW });
    expect(fieldPatch('reps', 6, NOW)).toEqual({ reps: 6, updatedAt: NOW });
  });

  it('clears to null, never to 0 — a blank RIR and a recorded 0 mean opposite things (INV-03)', () => {
    expect(fieldPatch('rir', null, NOW)).toEqual({ rir: null, updatedAt: NOW });
    expect(fieldPatch('rir', 0, NOW)).toEqual({ rir: 0, updatedAt: NOW });
  });
});

describe('a new exercise in a workout', () => {
  it('starts outside any superset, which stage 4 sets when routines arrive', () => {
    const row = workoutExerciseRow({
      id: 'we1',
      userId: USER,
      workoutId: 'w1',
      exerciseId: 'e1',
      orderIndex: 1,
      now: NOW,
    });
    expect(row.supersetGroup).toBeNull();
    expect(row.orderIndex).toBe(1);
  });
});

describe('what completing a set needs (03 §4, task 004 stage 5c)', () => {
  const empty = { reps: null, durationS: null, distanceM: null };

  it('needs the reps for the two rep modes, and never the weight', () => {
    expect(missingForCompletion('weight_reps', empty)).toBe('reps');
    expect(missingForCompletion('reps_only', empty)).toBe('reps');
    // A bodyweight set, or a load not recorded, is still a real set.
    expect(missingForCompletion('weight_reps', { ...empty, reps: 8 })).toBeNull();
  });

  it('needs the time for a hold, and the distance for a carry', () => {
    expect(missingForCompletion('duration', empty)).toBe('durationS');
    expect(missingForCompletion('duration', { ...empty, durationS: 60 })).toBeNull();
    expect(missingForCompletion('distance_duration', { ...empty, durationS: 40 })).toBe('distanceM');
    expect(missingForCompletion('distance_duration', { ...empty, distanceM: 30.48 })).toBeNull();
  });

  it('takes a zero as recorded — 0 reps is a failed attempt, not a blank', () => {
    expect(missingForCompletion('weight_reps', { ...empty, reps: 0 })).toBeNull();
  });
});
