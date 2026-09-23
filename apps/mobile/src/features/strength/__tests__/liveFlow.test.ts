/**
 * How a live workout moves — task 004 stage 5b. Focus after a ✓, and the rest timer, both derived from the workout
 * as SQLite holds it (INV-09). Superset alternation and "rest once per round" are decision 4 of the task's stages.
 */
import type { LiveExercise, LiveSet, LiveWorkout } from '@/db/strength';

import { adjustedRest, nextFocus, restAfter, runningRest, secondsLeft } from '../liveFlow';

const T0 = Date.UTC(2026, 8, 23, 18, 0, 0);

function sets(exerciseId: string, count: number, completed: readonly number[] = [], completedAt: Record<number, number> = {}): LiveSet[] {
  return Array.from({ length: count }, (_, at) => {
    const setIndex = at + 1;
    const done = completed.includes(setIndex);
    return {
      id: `${exerciseId}${String(setIndex)}`,
      setIndex,
      setType: 'working',
      weightKg: 40,
      reps: 6,
      rir: null,
      isCompleted: done,
      completedAt: done ? (completedAt[setIndex] ?? T0) : null,
    };
  });
}

function exercise(id: string, overrides: Partial<LiveExercise> & { sets: LiveSet[] }): LiveExercise {
  return {
    id,
    exerciseId: `e-${id}`,
    orderIndex: 0,
    supersetGroup: null,
    restSeconds: null,
    targetMinReps: null,
    targetMaxReps: null,
    targetRir: null,
    ...overrides,
  };
}

function workout(...exercises: LiveExercise[]): LiveWorkout {
  return { id: 'w', title: 'Treino', startedAt: T0, localDate: '2026-09-23', tz: 'UTC', exercises };
}

describe('focus after a ✓ (07 §6)', () => {
  it('moves to the next set of the same exercise', () => {
    const w = workout(exercise('A', { sets: sets('A', 3, [1]) }));
    expect(nextFocus(w, 'A1')).toEqual({ workoutExerciseId: 'A', setLogId: 'A2' });
  });

  it('moves on to the next exercise once this one is done', () => {
    const w = workout(exercise('A', { sets: sets('A', 2, [1, 2]) }), exercise('B', { sets: sets('B', 2) }));
    expect(nextFocus(w, 'A2')).toEqual({ workoutExerciseId: 'B', setLogId: 'B1' });
  });

  it('skips an exercise that is already finished', () => {
    const w = workout(
      exercise('A', { sets: sets('A', 1, [1]) }),
      exercise('B', { sets: sets('B', 1, [1]) }),
      exercise('C', { sets: sets('C', 1) }),
    );
    expect(nextFocus(w, 'A1')).toEqual({ workoutExerciseId: 'C', setLogId: 'C1' });
  });

  it('is null when nothing is left to do', () => {
    const w = workout(exercise('A', { sets: sets('A', 1, [1]) }));
    expect(nextFocus(w, 'A1')).toBeNull();
  });

  it('alternates through a superset, then back to the top for the next round (FR-2.6)', () => {
    const w = workout(
      exercise('A', { supersetGroup: 1, sets: sets('A', 2, [1]) }),
      exercise('B', { supersetGroup: 1, sets: sets('B', 2) }),
    );
    expect(nextFocus(w, 'A1')).toEqual({ workoutExerciseId: 'B', setLogId: 'B1' });

    const afterB1 = workout(
      exercise('A', { supersetGroup: 1, sets: sets('A', 2, [1]) }),
      exercise('B', { supersetGroup: 1, sets: sets('B', 2, [1]) }),
    );
    expect(nextFocus(afterB1, 'B1')).toEqual({ workoutExerciseId: 'A', setLogId: 'A2' });
  });

  it('leaves the superset only when the whole run is done', () => {
    const w = workout(
      exercise('A', { supersetGroup: 1, sets: sets('A', 1, [1]) }),
      exercise('B', { supersetGroup: 1, sets: sets('B', 1, [1]) }),
      exercise('C', { sets: sets('C', 1) }),
    );
    expect(nextFocus(w, 'B1')).toEqual({ workoutExerciseId: 'C', setLogId: 'C1' });
  });

  it('keeps alternating when the two sides have different set counts', () => {
    // A has three sets, B two: after B2 the round wraps to A3, and B has nothing left.
    const w = workout(
      exercise('A', { supersetGroup: 1, sets: sets('A', 3, [1, 2]) }),
      exercise('B', { supersetGroup: 1, sets: sets('B', 2, [1, 2]) }),
    );
    expect(nextFocus(w, 'B2')).toEqual({ workoutExerciseId: 'A', setLogId: 'A3' });
  });
});

describe('the rest after a set (decisions 1 and 4)', () => {
  it('is none when the exercise has no rest set — never an invented default', () => {
    const w = workout(exercise('A', { sets: sets('A', 2, [1]) }));
    expect(restAfter(w, 'A1')).toBeNull();
  });

  it('is the exercise’s own rest', () => {
    const w = workout(exercise('A', { restSeconds: 120, sets: sets('A', 2, [1]) }));
    expect(restAfter(w, 'A1')).toBe(120);
  });

  it('is none mid-round in a superset — the lifter goes straight to the next exercise', () => {
    const w = workout(
      exercise('A', { supersetGroup: 1, restSeconds: 90, sets: sets('A', 2, [1]) }),
      exercise('B', { supersetGroup: 1, restSeconds: 90, sets: sets('B', 2) }),
    );
    expect(restAfter(w, 'A1')).toBeNull();
  });

  it('comes once the round wraps back to the top', () => {
    const w = workout(
      exercise('A', { supersetGroup: 1, restSeconds: 90, sets: sets('A', 2, [1]) }),
      exercise('B', { supersetGroup: 1, restSeconds: 60, sets: sets('B', 2, [1]) }),
    );
    expect(restAfter(w, 'B1')).toBe(60);
  });
});

describe('the running rest timer (decision 2)', () => {
  const resting = workout(exercise('A', { restSeconds: 120, sets: sets('A', 3, [1, 2], { 1: T0, 2: T0 + 200_000 }) }));

  it('runs from the most recently completed set, and ends at its completion plus the rest', () => {
    expect(runningRest(resting, T0 + 210_000, null)).toEqual({
      setLogId: 'A2',
      workoutExerciseId: 'A',
      seconds: 120,
      endsAt: T0 + 320_000,
    });
  });

  it('comes back after a relaunch exactly where it was — it is a function of the rows, not of memory', () => {
    // The same rows read on a fresh launch, 30 s later: the same end time, 30 s less left.
    const again = runningRest(resting, T0 + 240_000, null);
    expect(again?.endsAt).toBe(T0 + 320_000);
    expect(secondsLeft(again?.endsAt ?? 0, T0 + 240_000)).toBe(80);
  });

  it('is gone once it has ended', () => {
    expect(runningRest(resting, T0 + 320_000, null)).toBeNull();
  });

  it('stays gone after a skip of that set, and a later tick starts a fresh one', () => {
    expect(runningRest(resting, T0 + 210_000, 'A2')).toBeNull();
    const ticked = workout(exercise('A', { restSeconds: 120, sets: sets('A', 3, [1, 2, 3], { 1: T0, 2: T0 + 200_000, 3: T0 + 400_000 }) }));
    expect(runningRest(ticked, T0 + 410_000, 'A2')?.setLogId).toBe('A3');
  });

  it('is nothing before any set is done', () => {
    expect(runningRest(workout(exercise('A', { restSeconds: 120, sets: sets('A', 2) })), T0, null)).toBeNull();
  });
});

describe('the timer’s arithmetic', () => {
  it('rounds the seconds left up, so 0:00 is never shown while time remains', () => {
    expect(secondsLeft(T0 + 1_001, T0)).toBe(2);
    expect(secondsLeft(T0 + 1_000, T0)).toBe(1);
    expect(secondsLeft(T0, T0 + 5)).toBe(0);
  });

  it('never shortens a rest below zero', () => {
    expect(adjustedRest(10, -15)).toBe(0);
    expect(adjustedRest(120, 15)).toBe(135);
  });
});
