/**
 * The rows a live workout is made of — task 004 stage 3.
 *
 * Only the pure half is under test. `src/db/strength.ts` reaches `expo-sqlite` through `./client`, which cannot open
 * under Node, so that the writes actually land — and how long the ✓ takes when they do — is a device check, exactly
 * as it is for the seed.
 */
import {
  completionPatch,
  discardPatch,
  fieldPatch,
  finishPatch,
  isPerceivedFatigue,
  localDayOf,
  noteValue,
  pastWorkoutProblem,
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

  it('in a past workout, stamps when the set was done — and always writes the row at the real time (03 §4)', () => {
    const yesterdayEnd = NOW - 20 * 60 * 60 * 1000;
    // `updatedAt` is what last-write-wins sync compares (NFR-4): backdated, this write would lose to any stale copy.
    expect(completionPatch(true, NOW, yesterdayEnd)).toEqual({
      isCompleted: true,
      completedAt: yesterdayEnd,
      updatedAt: NOW,
    });
    expect(completionPatch(false, NOW, yesterdayEnd)).toEqual({ isCompleted: false, completedAt: null, updatedAt: NOW });
  });
});

describe('a workout logged after the fact (FR-2.13, task 004 stage 6)', () => {
  const HOUR = 60 * 60 * 1000;
  const startsAt = NOW - 30 * HOUR;
  const row = workoutRow({ id: 'w1', userId: USER, title: 'Treino A', startedAt: startsAt, tz: 'America/Sao_Paulo', now: NOW });

  it('belongs to the day it started, not the day it was typed in (INV-17)', () => {
    expect(row.startedAt).toBe(startsAt);
    expect(row.localDate).toBe(localDayOf(startsAt));
  });

  it('is still written at the real time, so sync orders it correctly (NFR-4)', () => {
    expect(row.createdAt).toBe(NOW);
    expect(row.updatedAt).toBe(NOW);
  });

  it('is open until it is finished, like any other', () => {
    expect(row.endedAt).toBeNull();
  });

  it('refuses an end that is not after the start, and an end still to come', () => {
    expect(pastWorkoutProblem({ startsAt, endsAt: startsAt + HOUR, now: NOW })).toBeNull();
    expect(pastWorkoutProblem({ startsAt, endsAt: startsAt, now: NOW })).toBe('end_before_start');
    expect(pastWorkoutProblem({ startsAt, endsAt: startsAt - HOUR, now: NOW })).toBe('end_before_start');
    expect(pastWorkoutProblem({ startsAt: NOW - HOUR, endsAt: NOW + HOUR, now: NOW })).toBe('in_future');
  });

  it('finishes at its chosen end, while the write itself is stamped now', () => {
    expect(finishPatch(startsAt + HOUR, NOW)).toEqual({ endedAt: startsAt + HOUR, updatedAt: NOW });
  });
});

describe('finishing, and putting away a workout with nothing ticked (task 004 stage 6)', () => {
  it('finishes now for a workout happening now', () => {
    expect(finishPatch(NOW, NOW)).toEqual({ endedAt: NOW, updatedAt: NOW });
  });

  it('discards with a tombstone, never a delete, and ends it so it cannot be reopened (INV-11)', () => {
    expect(discardPatch(NOW)).toEqual({ endedAt: NOW, deletedAt: NOW, updatedAt: NOW });
  });
});

describe('notes and perceived fatigue (task 004 stage 6)', () => {
  it('keeps a note exactly as typed — never trimmed, never translated (INV-27)', () => {
    expect(noteValue('  pegada fechada, ombro ok ')).toBe('  pegada fechada, ombro ok ');
    expect(noteValue('Leg day do João')).toBe('Leg day do João');
  });

  it('stores a note of nothing but whitespace as no note at all', () => {
    expect(noteValue('')).toBeNull();
    expect(noteValue('   \n ')).toBeNull();
  });

  it('takes fatigue as 1 to 10 or not recorded — never 0, which the column would refuse', () => {
    expect(isPerceivedFatigue(null)).toBe(true);
    expect(isPerceivedFatigue(1)).toBe(true);
    expect(isPerceivedFatigue(10)).toBe(true);
    expect(isPerceivedFatigue(0)).toBe(false);
    expect(isPerceivedFatigue(11)).toBe(false);
    expect(isPerceivedFatigue(6.5)).toBe(false);
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
